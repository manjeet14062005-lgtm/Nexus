const crypto = require('crypto');
const { adminDb, adminAuth } = require('./supabaseAdmin');
const { getWorkspaceAnalytics, buildVerificationCsv, parseRange } = require('./analytics');
const { requireWorkspaceFeature } = require('./entitlements');
const { sendResendEmail } = require('./automation');

const MAX_SCHEDULES = 20;
const MAX_RECIPIENTS = 5;
const LOCK_MS = 5 * 60 * 1000;
const MAX_RUNS_PER_TICK = 20;

function nowIso() { return new Date().toISOString(); }
function cleanText(value, max = 200) { return String(value || '').trim().slice(0, max); }

function validateTimezone(timeZone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); return timeZone; }
  catch (_) { throw Object.assign(new Error('Invalid IANA timezone.'), { status: 400 }); }
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date);
  const out = {};
  for (const part of parts) if (part.type !== 'literal') out[part.type] = part.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), second: Number(out.second), weekday: out.weekday,
  };
}

function timezoneOffsetMs(date, timeZone) {
  const p = localParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function localDateTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  candidate = new Date(candidate.getTime() - timezoneOffsetMs(candidate, timeZone));
  return candidate;
}

function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('time must use HH:MM.'), { status: 400 });
  const hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw Object.assign(new Error('time must use HH:MM.'), { status: 400 });
  return { hour, minute, value: `${match[1]}:${match[2]}` };
}

function nextRunAt(schedule, from = new Date()) {
  const time = parseTime(schedule.time);
  const timeZone = validateTimezone(schedule.timezone || 'UTC');
  const local = localParts(from, timeZone);
  let y = local.year, m = local.month, d = local.day;
  const frequency = schedule.frequency;

  if (frequency === 'daily') {
    let candidate = localDateTimeToUtc({ year: y, month: m, day: d, hour: time.hour, minute: time.minute }, timeZone);
    if (candidate.getTime() <= from.getTime()) {
      const next = new Date(Date.UTC(y, m - 1, d));
      next.setUTCDate(next.getUTCDate() + 1);
      candidate = localDateTimeToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: time.hour, minute: time.minute }, timeZone);
    }
    return candidate.toISOString();
  }

  if (frequency === 'weekly') {
    const target = Number(schedule.weekday);
    if (!Number.isInteger(target) || target < 0 || target > 6) throw Object.assign(new Error('weekday must be 0-6 for weekly schedules.'), { status: 400 });
    const currentDate = new Date(Date.UTC(y, m - 1, d));
    const currentDow = currentDate.getUTCDay();
    let delta = (target - currentDow + 7) % 7;
    let candidateDate = new Date(currentDate); candidateDate.setUTCDate(candidateDate.getUTCDate() + delta);
    let candidate = localDateTimeToUtc({ year: candidateDate.getUTCFullYear(), month: candidateDate.getUTCMonth() + 1, day: candidateDate.getUTCDate(), hour: time.hour, minute: time.minute }, timeZone);
    if (candidate.getTime() <= from.getTime()) {
      candidateDate.setUTCDate(candidateDate.getUTCDate() + 7);
      candidate = localDateTimeToUtc({ year: candidateDate.getUTCFullYear(), month: candidateDate.getUTCMonth() + 1, day: candidateDate.getUTCDate(), hour: time.hour, minute: time.minute }, timeZone);
    }
    return candidate.toISOString();
  }

  if (frequency === 'monthly') {
    const targetDay = Math.max(1, Math.min(28, Number(schedule.dayOfMonth) || 1));
    let month = m, year = y;
    let day = Math.min(targetDay, daysInMonth(year, month));
    let candidate = localDateTimeToUtc({ year, month, day, hour: time.hour, minute: time.minute }, timeZone);
    if (candidate.getTime() <= from.getTime()) {
      month += 1;
      if (month === 13) { month = 1; year += 1; }
      day = Math.min(targetDay, daysInMonth(year, month));
      candidate = localDateTimeToUtc({ year, month, day, hour: time.hour, minute: time.minute }, timeZone);
    }
    return candidate.toISOString();
  }
  throw Object.assign(new Error('Unsupported schedule frequency.'), { status: 400 });
}

function sanitizeScheduleInput(input = {}) {
  const frequency = String(input.frequency || 'weekly').trim().toLowerCase();
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) throw Object.assign(new Error('frequency must be daily, weekly, or monthly.'), { status: 400 });
  const time = parseTime(input.time || '09:00');
  const timezone = validateTimezone(cleanText(input.timezone || 'UTC', 64));
  const range = parseRange(input.range || 30);
  const environment = ['all', 'test', 'live'].includes(String(input.environment || 'all')) ? String(input.environment || 'all') : (() => { throw Object.assign(new Error('environment must be all, test, or live.'), { status: 400 }); })();
  const name = cleanText(input.name, 80);
  if (!name) throw Object.assign(new Error('Schedule name is required.'), { status: 400 });
  const recipients = Array.isArray(input.recipients) ? [...new Set(input.recipients.map((email) => String(email).trim().toLowerCase()).filter(Boolean))].slice(0, MAX_RECIPIENTS) : [];
  if (!recipients.length || recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Object.assign(new Error('Provide at least one valid report recipient.'), { status: 400 });
  const schedule = { name, frequency, time: time.value, timezone, range, environment };
  if (frequency === 'weekly') {
    const weekday = Number(input.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw Object.assign(new Error('weekday must be 0-6.'), { status: 400 });
    schedule.weekday = weekday;
  }
  if (frequency === 'monthly') {
    const dayOfMonth = Number(input.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) throw Object.assign(new Error('dayOfMonth must be between 1 and 28.'), { status: 400 });
    schedule.dayOfMonth = dayOfMonth;
  }
  return { ...schedule, recipients };
}

function safeSchedule(record) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    frequency: record.frequency,
    time: record.time,
    timezone: record.timezone,
    range: record.range,
    environment: record.environment,
    weekday: record.weekday ?? null,
    dayOfMonth: record.dayOfMonth ?? null,
    recipients: Array.isArray(record.recipients) ? record.recipients : [],
    enabled: record.enabled !== false,
    nextRunAt: record.nextRunAt || null,
    lastRunAt: record.lastRunAt || null,
    lastStatus: record.lastStatus || null,
    lastError: record.lastError || null,
    runCount: Number(record.runCount || 0),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  };
}

function schedulesCollection(workspaceId) {
  return adminDb().collection('workspaces').doc(workspaceId).collection('reportSchedules');
}

async function listReportSchedules(workspaceId) {
  const snapshot = await schedulesCollection(workspaceId).orderBy('createdAt', 'desc').limit(MAX_SCHEDULES).get();
  return snapshot.docs.map((doc) => safeSchedule({ id: doc.id, ...doc.data() }));
}

async function createReportSchedule({ workspaceId, uid, input }) {
  const plan = await requireWorkspaceFeature(workspaceId, 'scheduledReports');
  const planLimit = Number(plan.reportScheduleLimit ?? MAX_SCHEDULES);
  const snapshot = await schedulesCollection(workspaceId).limit(MAX_SCHEDULES).get();
  const activeCount = snapshot.docs.filter((doc) => doc.data()?.enabled !== false).length;
  if (planLimit <= 0) throw Object.assign(new Error('Scheduled reports are not included in the current plan.'), { status: 402, code: 'FEATURE_NOT_INCLUDED' });
  if (activeCount >= planLimit) throw Object.assign(new Error(`Your plan allows up to ${planLimit} active scheduled reports.`), { status: 409, code: 'REPORT_SCHEDULE_LIMIT' });
  const normalized = sanitizeScheduleInput(input);
  const id = `rpt_${crypto.randomBytes(10).toString('hex')}`;
  const record = {
    id,
    workspaceId,
    createdBy: uid,
    ...normalized,
    enabled: input.enabled !== false,
    nextRunAt: nextRunAt(normalized),
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await schedulesCollection(workspaceId).doc(id).set(record);
  return safeSchedule(record);
}

async function updateReportSchedule({ workspaceId, scheduleId, input }) {
  const ref = schedulesCollection(workspaceId).doc(scheduleId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('Report schedule not found.'), { status: 404 });
  const existing = snapshot.data();
  const onlyDisabling = input && input.enabled === false && Object.keys(input).every((key) => key === 'enabled');
  if (!onlyDisabling) await requireWorkspaceFeature(workspaceId, 'scheduledReports');
  const mergedInput = { ...existing, ...input };
  const normalized = sanitizeScheduleInput(mergedInput);
  const updates = { ...normalized, nextRunAt: nextRunAt(normalized), updatedAt: nowIso() };
  if (input.enabled !== undefined) updates.enabled = Boolean(input.enabled);
  if (input.enabled === false) updates.nextRunAt = existing.nextRunAt || null;
  await ref.set(updates, { merge: true });
  return safeSchedule({ id: scheduleId, ...existing, ...updates });
}

async function deleteReportSchedule({ workspaceId, scheduleId }) {
  const ref = schedulesCollection(workspaceId).doc(scheduleId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('Report schedule not found.'), { status: 404 });
  await ref.set({ enabled: false, updatedAt: nowIso(), deletedAt: nowIso() }, { merge: true });
  return { id: scheduleId, status: 'deleted' };
}

async function sendScheduledReport(schedule) {
  const analytics = await getWorkspaceAnalytics(schedule.workspaceId, { range: schedule.range, environment: schedule.environment });
  const csv = buildVerificationCsv(analytics);
  const filename = `nexus-verification-report-${analytics.environment}-${schedule.range}d-${new Date().toISOString().slice(0, 10)}.csv`;
  const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];
  if (!recipients.length) {
    const workspace = await adminDb().collection('workspaces').doc(schedule.workspaceId).get();
    const ownerUid = workspace.data()?.ownerUid;
    if (ownerUid) {
      const owner = await adminAuth().getUser(ownerUid);
      if (owner.email) recipients.push(owner.email);
    }
  }
  if (!recipients.length) throw new Error('No report recipients are configured.');
  const text = [
    `Nexus scheduled report: ${schedule.name}`,
    `Range: ${schedule.range} days`,
    `Environment: ${schedule.environment}`,
    `Requests: ${analytics.totals.requests}`,
    `Verified: ${analytics.totals.verified}`,
    `Verification rate: ${analytics.totals.verificationRate}%`,
    `High risk: ${analytics.totals.highRisk}`,
    '',
    'The detailed CSV is attached.',
  ].join('\n');
  const messageId = await sendResendEmail({
    recipients,
    subject: `Nexus report — ${schedule.name}`,
    text,
    attachment: { filename, content: Buffer.from(csv, 'utf8').toString('base64'), content_type: 'text/csv' },
  });
  return { messageId, filename, recipients };
}

async function claimSchedule(doc) {
  const ref = doc.ref;
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.enabled === false) return null;
    const stale = data.lockedAt && Date.now() - new Date(data.lockedAt).getTime() > LOCK_MS;
    if (!data.nextRunAt || new Date(data.nextRunAt).getTime() > Date.now()) return null;
    if (data.lockedAt && !stale) return null;
    const lockId = `lock_${crypto.randomBytes(8).toString('hex')}`;
    tx.set(ref, { lockedAt: nowIso(), lockId, updatedAt: nowIso() }, { merge: true });
    return { ...data, id: snap.id, lockId };
  });
}

async function processReportSchedule(doc) {
  const schedule = await claimSchedule(doc);
  if (!schedule) return false;
  try {
    try {
      await requireWorkspaceFeature(schedule.workspaceId, 'scheduledReports');
    } catch (error) {
      await doc.ref.set({ lastStatus: 'blocked', lastError: 'Scheduled reports are not included in the current workspace plan.', lockedAt: null, updatedAt: nowIso() }, { merge: true });
      return false;
    }
    const result = await sendScheduledReport(schedule);
    const next = nextRunAt(schedule, new Date());
    await doc.ref.set({ lastRunAt: nowIso(), lastStatus: 'sent', lastError: null, runCount: Number(schedule.runCount || 0) + 1, nextRunAt: next, lockedAt: null, updatedAt: nowIso(), lastMessageId: result.messageId || null }, { merge: true });
    const runRef = adminDb().collection('workspaces').doc(schedule.workspaceId).collection('reportRuns').doc(`run_${crypto.randomBytes(10).toString('hex')}`);
    await runRef.set({ workspaceId: schedule.workspaceId, scheduleId: schedule.id, status: 'sent', range: schedule.range, environment: schedule.environment, recipients: result.recipients, filename: result.filename, messageId: result.messageId || null, createdAt: nowIso() });
    return true;
  } catch (error) {
    const next = nextRunAt(schedule, new Date(Date.now() + 60_000));
    await doc.ref.set({ lastRunAt: nowIso(), lastStatus: 'failed', lastError: String(error.message || error).slice(0, 500), nextRunAt: next, lockedAt: null, updatedAt: nowIso() }, { merge: true });
    const runRef = adminDb().collection('workspaces').doc(schedule.workspaceId).collection('reportRuns').doc(`run_${crypto.randomBytes(10).toString('hex')}`);
    await runRef.set({ workspaceId: schedule.workspaceId, scheduleId: schedule.id, status: 'failed', error: String(error.message || error).slice(0, 500), createdAt: nowIso() });
    return false;
  }
}

async function processReportSchedulerOnce() {
  const snapshot = await adminDb().collectionGroup('reportSchedules').where('enabled', '==', true).where('nextRunAt', '<=', nowIso()).limit(MAX_RUNS_PER_TICK).get();
  for (const doc of snapshot.docs) {
    try { await processReportSchedule(doc); } catch (error) { console.error('Report scheduler job failed:', error.message); }
  }
}

async function runReportScheduleNow({ workspaceId, scheduleId }) {
  await requireWorkspaceFeature(workspaceId, 'scheduledReports');
  const ref = schedulesCollection(workspaceId).doc(scheduleId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.enabled === false) throw Object.assign(new Error('Report schedule is not available.'), { status: 404 });
  const result = await sendScheduledReport({ id: scheduleId, ...snapshot.data() });
  await ref.set({ lastRunAt: nowIso(), lastStatus: 'sent', lastError: null, runCount: Number(snapshot.data()?.runCount || 0) + 1, updatedAt: nowIso() }, { merge: true });
  const runRef = adminDb().collection('workspaces').doc(workspaceId).collection('reportRuns').doc(`run_${crypto.randomBytes(10).toString('hex')}`);
  await runRef.set({ workspaceId, scheduleId, status: 'sent', range: snapshot.data()?.range, environment: snapshot.data()?.environment, recipients: result.recipients, filename: result.filename, messageId: result.messageId || null, manual: true, createdAt: nowIso() });
  return result;
}

function startReportScheduler() {
  const enabled = String(process.env.REPORT_SCHEDULER_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return null;
  const interval = Math.min(Math.max(Number(process.env.REPORT_SCHEDULER_INTERVAL_MS) || 60000, 30000), 300000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processReportSchedulerOnce(); } catch (error) { console.error('Report scheduler tick failed:', error.message); }
    running = false;
  };
  const timer = setInterval(tick, interval);
  timer.unref?.();
  setImmediate(tick);
  console.log(`🗓️ Report scheduler enabled (${interval}ms interval)`);
  return timer;
}

module.exports = { listReportSchedules, createReportSchedule, updateReportSchedule, deleteReportSchedule, runReportScheduleNow, startReportScheduler };
