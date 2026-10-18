const crypto = require('crypto');
const { adminDb, adminAuth } = require('./supabaseAdmin');
const { requireWorkspaceFeature } = require('./entitlements');
const { queueWebhookEvent, listSupportedEvents, getWebhookForAutomation } = require('./webhooks');

const MAX_WORKFLOWS = 20;
const MAX_CONDITIONS = 5;
const MAX_ACTIONS = 3;
const MAX_JOBS_PER_TICK = 25;
const STALE_LOCK_MS = 2 * 60 * 1000;

const ALLOWED_TRIGGERS = new Set(listSupportedEvents().map((item) => item.id).filter((id) => id !== 'webhook.test'));
const CONDITION_FIELDS = new Set(['risk_score', 'status', 'method', 'environment', 'disposable']);
const CONDITION_OPERATORS = new Set(['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_true', 'is_false']);
const ACTION_TYPES = new Set(['webhook_event', 'email_owner', 'email_recipients', 'create_security_event']);

function nowIso() { return new Date().toISOString(); }
function randomId(prefix) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function getWorkspaceCollection(workspaceId) {
  return adminDb().collection('workspaces').doc(workspaceId).collection('automationWorkflows');
}

function sanitizeConditions(conditions) {
  if (conditions == null) return [];
  if (!Array.isArray(conditions) || conditions.length > MAX_CONDITIONS) {
    throw Object.assign(new Error(`A workflow can have at most ${MAX_CONDITIONS} conditions.`), { status: 400 });
  }
  return conditions.map((condition) => {
    const field = cleanText(condition?.field, 40);
    const operator = cleanText(condition?.operator, 30);
    if (!CONDITION_FIELDS.has(field) || !CONDITION_OPERATORS.has(operator)) {
      throw Object.assign(new Error('Workflow condition is invalid.'), { status: 400 });
    }
    let value = condition?.value;
    if (operator === 'is_true' || operator === 'is_false') value = null;
    else if (field === 'risk_score') {
      value = Number(value);
      if (!Number.isFinite(value)) throw Object.assign(new Error('risk_score condition requires a number.'), { status: 400 });
    } else if (field === 'disposable') value = String(value).toLowerCase() === 'true';
    else value = cleanText(value, 120);
    return { field, operator, value };
  });
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS) {
    throw Object.assign(new Error(`A workflow must contain 1-${MAX_ACTIONS} actions.`), { status: 400 });
  }
  return actions.map((action) => {
    const type = cleanText(action?.type, 40);
    if (!ACTION_TYPES.has(type)) throw Object.assign(new Error('Unsupported workflow action.'), { status: 400 });
    const config = action?.config && typeof action.config === 'object' ? action.config : {};
    if (type === 'webhook_event') {
      const eventType = cleanText(config.eventType || 'verification.failed', 80);
      if (!ALLOWED_TRIGGERS.has(eventType)) throw Object.assign(new Error('Invalid webhook event action.'), { status: 400 });
      return { type, config: { eventType, webhookId: cleanText(config.webhookId, 120) || null } };
    }
    if (type === 'email_owner') return { type, config: {} };
    if (type === 'email_recipients') {
      const recipients = Array.isArray(config.recipients) ? [...new Set(config.recipients.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 5) : [];
      if (!recipients.length || recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw Object.assign(new Error('At least one valid email recipient is required.'), { status: 400 });
      }
      return { type, config: { recipients } };
    }
    return { type, config: { severity: ['low', 'medium', 'high'].includes(String(config.severity)) ? String(config.severity) : 'medium' } };
  });
}

function normalizeEnvironment(value) {
  const environment = String(value || 'all').trim().toLowerCase();
  if (!['all', 'test', 'live'].includes(environment)) throw Object.assign(new Error('Workflow environment must be all, test, or live.'), { status: 400 });
  return environment;
}

function safeWorkflow(record) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description || '',
    enabled: record.enabled !== false,
    environment: record.environment || 'all',
    trigger: record.trigger || null,
    conditions: Array.isArray(record.conditions) ? record.conditions : [],
    actions: Array.isArray(record.actions) ? record.actions : [],
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    lastRunAt: record.lastRunAt || null,
    runCount: Number(record.runCount || 0),
    failureCount: Number(record.failureCount || 0),
  };
}

async function listWorkflows(workspaceId) {
  const snapshot = await getWorkspaceCollection(workspaceId).orderBy('createdAt', 'desc').limit(MAX_WORKFLOWS).get();
  return snapshot.docs.map((doc) => safeWorkflow({ id: doc.id, ...doc.data() }));
}

async function createWorkflow({ workspaceId, uid, name, description, trigger, conditions, actions, environment }) {
  const collection = getWorkspaceCollection(workspaceId);
  const existing = await collection.limit(MAX_WORKFLOWS).get();
  if (existing.size >= MAX_WORKFLOWS) throw Object.assign(new Error(`A workspace can have at most ${MAX_WORKFLOWS} workflows.`), { status: 409 });
  const cleanName = cleanText(name, 80);
  if (!cleanName) throw Object.assign(new Error('Workflow name is required.'), { status: 400 });
  const triggerId = cleanText(trigger, 80);
  if (!ALLOWED_TRIGGERS.has(triggerId)) throw Object.assign(new Error('Unsupported workflow trigger.'), { status: 400 });
  const record = {
    workspaceId,
    name: cleanName,
    description: cleanText(description, 240),
    enabled: true,
    environment: normalizeEnvironment(environment),
    trigger: { event: triggerId },
    conditions: sanitizeConditions(conditions),
    actions: sanitizeActions(actions),
    createdBy: uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastRunAt: null,
    runCount: 0,
    failureCount: 0,
  };
  const id = randomId('wf');
  await collection.doc(id).set({ id, ...record });
  return safeWorkflow({ id, ...record });
}

async function updateWorkflow({ workspaceId, workflowId, patch }) {
  const ref = getWorkspaceCollection(workspaceId).doc(workflowId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('Workflow not found.'), { status: 404 });
  const onlyDisabling = patch && patch.enabled === false && Object.keys(patch).every((key) => key === 'enabled');
  if (!onlyDisabling) await requireWorkspaceFeature(workspaceId, 'automation');
  const updates = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    const cleanName = cleanText(patch.name, 80);
    if (!cleanName) throw Object.assign(new Error('Workflow name is required.'), { status: 400 });
    updates.name = cleanName;
  }
  if (patch.description !== undefined) updates.description = cleanText(patch.description, 240);
  if (patch.enabled !== undefined) updates.enabled = Boolean(patch.enabled);
  if (patch.environment !== undefined) updates.environment = normalizeEnvironment(patch.environment);
  if (patch.trigger !== undefined) {
    const triggerId = cleanText(patch.trigger, 80);
    if (!ALLOWED_TRIGGERS.has(triggerId)) throw Object.assign(new Error('Unsupported workflow trigger.'), { status: 400 });
    updates.trigger = { event: triggerId };
  }
  if (patch.conditions !== undefined) updates.conditions = sanitizeConditions(patch.conditions);
  if (patch.actions !== undefined) updates.actions = sanitizeActions(patch.actions);
  await ref.set(updates, { merge: true });
  return safeWorkflow({ id: workflowId, ...snapshot.data(), ...updates });
}

async function deleteWorkflow({ workspaceId, workflowId }) {
  const ref = getWorkspaceCollection(workspaceId).doc(workflowId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('Workflow not found.'), { status: 404 });
  await ref.set({ enabled: false, deletedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
  return { id: workflowId, status: 'deleted' };
}

function queueAutomationEvent({ workspaceId, type, environment, data = {} }) {
  const eventRef = adminDb().collection('workspaces').doc(workspaceId).collection('automationJobs').doc(randomId('job'));
  const safeData = {
    verification_id: data.verification_id || null,
    external_user_id: data.external_user_id || null,
    method: data.method || null,
    status: data.status || null,
    environment: environment || null,
    risk_score: Number(data.risk_score || 0),
    disposable: Boolean(data.disposable),
    created_at: data.created_at || null,
    expires_at: data.expires_at || null,
  };
  return eventRef.set({
    id: eventRef.id,
    workspaceId,
    type,
    environment: environment || null,
    data: safeData,
    status: 'pending',
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nextAttemptAt: nowIso(),
  });
}

function getField(data, field) {
  return data?.[field];
}

function matchesCondition(data, condition) {
  const actual = getField(data, condition.field);
  switch (condition.operator) {
    case 'equals': return String(actual ?? '').toLowerCase() === String(condition.value ?? '').toLowerCase();
    case 'not_equals': return String(actual ?? '').toLowerCase() !== String(condition.value ?? '').toLowerCase();
    case 'gt': return Number(actual) > Number(condition.value);
    case 'gte': return Number(actual) >= Number(condition.value);
    case 'lt': return Number(actual) < Number(condition.value);
    case 'lte': return Number(actual) <= Number(condition.value);
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    case 'is_true': return Boolean(actual);
    case 'is_false': return !Boolean(actual);
    default: return false;
  }
}

function matchesWorkflow(workflow, job) {
  if (workflow.enabled === false) return false;
  if (workflow.trigger?.event !== job.type) return false;
  if (workflow.environment && workflow.environment !== 'all' && job.environment && workflow.environment !== job.environment) return false;
  return (workflow.conditions || []).every((condition) => matchesCondition(job.data || {}, condition));
}

async function sendResendEmail({ recipients, subject, text, attachment }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Email provider is not configured.');
  const body = { from, to: recipients, subject, text };
  if (attachment) body.attachments = [attachment];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Email provider rejected the message.');
  return data.id || null;
}

async function getOwnerEmail(workspaceId) {
  const workspace = await adminDb().collection('workspaces').doc(workspaceId).get();
  if (!workspace.exists || !workspace.data()?.ownerUid) throw Object.assign(new Error('Workspace owner not found.'), { status: 404 });
  const owner = await adminAuth().getUser(workspace.data().ownerUid);
  return owner.email || null;
}

async function executeAction(workspaceId, workflow, job, action) {
  const payload = {
    automation_id: workflow.id,
    automation_name: workflow.name,
    trigger: job.type,
    workspace_id: workspaceId,
    event: job.data,
  };
  if (action.type === 'webhook_event') {
    let target = null;
    if (action.config.webhookId) {
      target = await getWebhookForAutomation(workspaceId, action.config.webhookId);
      if (!target || target.status !== 'active' || target.enabled === false) throw new Error('Configured webhook is unavailable.');
    }
    await queueWebhookEvent({
      workspaceId,
      type: action.config.eventType,
      environment: job.environment,
      targetWebhookId: target?.id || null,
      data: payload,
    });
    return { type: action.type, status: 'queued', eventType: action.config.eventType };
  }
  if (action.type === 'email_owner' || action.type === 'email_recipients') {
    const recipients = action.type === 'email_owner' ? await getOwnerEmail(workspaceId) : action.config.recipients;
    const list = Array.isArray(recipients) ? recipients : [recipients];
    if (!list.filter(Boolean).length) throw new Error('No valid email recipients found.');
    const subject = `Nexus automation: ${workflow.name}`;
    const text = [
      `Workflow: ${workflow.name}`,
      `Trigger: ${job.type}`,
      `Environment: ${job.environment || 'all'}`,
      `Verification ID: ${job.data.verification_id || '—'}`,
      `Method: ${job.data.method || '—'}`,
      `Status: ${job.data.status || '—'}`,
      `Risk score: ${job.data.risk_score ?? '—'}`,
      `Disposable: ${job.data.disposable ? 'yes' : 'no'}`,
      '',
      'This message was generated by Nexus Automation.',
    ].join('\n');
    const messageId = await sendResendEmail({ recipients: list.filter(Boolean), subject, text });
    return { type: action.type, status: 'sent', messageId };
  }
  await adminDb().collection('workspaces').doc(workspaceId).collection('securityEvents').add({
    workspaceId,
    type: 'automation.security_event',
    severity: action.config.severity,
    workflowId: workflow.id,
    workflowName: workflow.name,
    sourceEvent: job.type,
    verificationId: job.data.verification_id || null,
    environment: job.environment || null,
    createdAt: nowIso(),
  });
  return { type: action.type, status: 'recorded' };
}

async function claimJob(doc) {
  const ref = doc.ref;
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    const stale = data.status === 'processing' && data.lockedAt && Date.now() - new Date(data.lockedAt).getTime() > STALE_LOCK_MS;
    const due = data.status === 'pending' || (data.status === 'retry' && (!data.nextAttemptAt || new Date(data.nextAttemptAt).getTime() <= Date.now())) || stale;
    if (!due) return null;
    tx.set(ref, { status: 'processing', lockedAt: nowIso(), attempts: Number(data.attempts || 0) + 1, updatedAt: nowIso() }, { merge: true });
    return { ...data, id: snap.id, attempts: Number(data.attempts || 0) + 1 };
  });
}

async function processJob(doc) {
  const job = await claimJob(doc);
  if (!job) return false;
  try {
    try {
      await requireWorkspaceFeature(job.workspaceId, 'automation');
    } catch (error) {
      await doc.ref.set({
        status: 'blocked',
        completedAt: nowIso(),
        updatedAt: nowIso(),
        lockedAt: null,
        lastError: 'Automation is not included in the current workspace plan.',
      }, { merge: true });
      return false;
    }
    const workflowSnap = await getWorkspaceCollection(job.workspaceId).where('enabled', '==', true).limit(MAX_WORKFLOWS).get();
    const workflows = workflowSnap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((workflow) => matchesWorkflow(workflow, job));
    const results = [];
    for (const workflow of workflows) {
      const actions = [];
      try {
        for (const action of workflow.actions || []) actions.push(await executeAction(job.workspaceId, workflow, job, action));
        await getWorkspaceCollection(job.workspaceId).doc(workflow.id).set({ lastRunAt: nowIso(), runCount: Number(workflow.runCount || 0) + 1, updatedAt: nowIso() }, { merge: true });
        results.push({ workflowId: workflow.id, status: 'success', actions });
      } catch (error) {
        await getWorkspaceCollection(job.workspaceId).doc(workflow.id).set({ lastRunAt: nowIso(), failureCount: Number(workflow.failureCount || 0) + 1, updatedAt: nowIso() }, { merge: true }).catch(() => {});
        results.push({ workflowId: workflow.id, status: 'failed', error: error.message });
      }
    }
    await doc.ref.set({ status: 'complete', completedAt: nowIso(), updatedAt: nowIso(), lockedAt: null, matchedWorkflows: workflows.length, results }, { merge: true });
    return true;
  } catch (error) {
    const terminal = Number(job.attempts || 1) >= 4;
    await doc.ref.set({ status: terminal ? 'failed' : 'retry', nextAttemptAt: new Date(Date.now() + Math.min(300000, 15000 * Math.pow(2, Math.max(0, Number(job.attempts || 1) - 1)))).toISOString(), lastError: error.message, updatedAt: nowIso(), lockedAt: null }, { merge: true });
    return false;
  }
}

async function processAutomationWorkerOnce() {
  const snapshot = await adminDb().collectionGroup('automationJobs').where('status', 'in', ['pending', 'retry', 'processing']).limit(MAX_JOBS_PER_TICK).get();
  for (const doc of snapshot.docs) {
    try { await processJob(doc); } catch (error) { console.error('Automation job processing failed:', error.message); }
  }
}

function startAutomationWorker() {
  const enabled = String(process.env.AUTOMATION_WORKER_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return null;
  const interval = Math.min(Math.max(Number(process.env.AUTOMATION_WORKER_INTERVAL_MS) || 5000, 1000), 60000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processAutomationWorkerOnce(); } catch (error) { console.error('Automation worker tick failed:', error.message); }
    running = false;
  };
  const timer = setInterval(tick, interval);
  timer.unref?.();
  setImmediate(tick);
  console.log(`⚙️ Automation worker enabled (${interval}ms interval)`);
  return timer;
}

module.exports = {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  queueAutomationEvent,
  startAutomationWorker,
  sendResendEmail,
};
