const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { adminDb } = require('./supabaseAdmin');

const MAX_WEBHOOKS = 50;
const MAX_EVENTS_PER_WEBHOOK = 50;
const MAX_ATTEMPTS = 6;
const STALE_LOCK_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = Math.min(Math.max(Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS) || 10000, 1000), 30000);
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

const EVENT_DEFINITIONS = Object.freeze({
  'webhook.test': 'Test event sent from the Nexus Developer Portal.',
  'verification.created': 'A verification request was created.',
  'verification.completed': 'A verification request was successfully completed.',
  'verification.failed': 'A verification request failed.',
  'verification.expired': 'A verification request expired.',
  'user.created': 'A customer end-user record was created.',
  'risk.detected': 'A high-risk verification signal was detected.',
  'subscription.updated': 'A workspace owner subscription state changed.',
});

const ALLOWED_PROTOCOLS = new Set(['https:']);
const ALLOW_HTTP = String(process.env.WEBHOOK_ALLOW_HTTP || '').toLowerCase() === 'true';
const STORE_RESPONSE_BODY = String(process.env.WEBHOOK_STORE_RESPONSE_BODY || '').toLowerCase() === 'true';
const MAX_STORED_RESPONSE_BODY = Math.min(Math.max(Number(process.env.WEBHOOK_MAX_STORED_RESPONSE_BODY_BYTES) || 8192, 0), 65536);

function nowIso() { return new Date().toISOString(); }

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseWebhookKey() {
  const raw = String(process.env.WEBHOOK_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('WEBHOOK_ENCRYPTION_KEY is not configured.');
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch (_) {}
  throw new Error('WEBHOOK_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).');
}

function encryptSecret(secret) {
  const key = parseWebhookKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decryptSecret(record) {
  const key = parseWebhookKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function createSigningSecret() {
  return `nx_whsec_${crypto.randomBytes(32).toString('base64url')}`;
}

function normalizeEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return ['webhook.test', 'verification.created', 'verification.completed'];
  const result = [...new Set(events.map((event) => String(event).trim()).filter((event) => Object.prototype.hasOwnProperty.call(EVENT_DEFINITIONS, event)))];
  if (!result.length) {
    const error = new Error('No valid webhook events were selected.');
    error.status = 400;
    throw error;
  }
  if (result.length > MAX_EVENTS_PER_WEBHOOK) {
    const error = new Error(`A webhook can subscribe to at most ${MAX_EVENTS_PER_WEBHOOK} events.`);
    error.status = 400;
    throw error;
  }
  return result;
}

function normalizeEnvironment(value) {
  const env = String(value || 'all').trim().toLowerCase();
  return ['all', 'test', 'live'].includes(env) ? env : null;
}

function isPrivateIPv4(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0;
}

function isPrivateIPv6(ip) {
  const value = String(ip).toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // Loopback, unspecified, unique-local, link-local and multicast ranges are not
  // valid destinations for customer webhooks.
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') ||
    value.startsWith('fe80:') || value.startsWith('ff');
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  return family === 4 ? isPrivateIPv4(ip) : family === 6 ? isPrivateIPv6(ip) : true;
}

async function resolveSafeTarget(url) {
  const parsed = new URL(url);
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol) && !(ALLOW_HTTP && parsed.protocol === 'http:')) {
    throw Object.assign(new Error('Webhook URL must use HTTPS.'), { status: 400 });
  }
  if (parsed.username || parsed.password) throw Object.assign(new Error('Webhook URLs may not contain embedded credentials.'), { status: 400 });
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') || parsed.hostname.endsWith('.internal')) {
    throw Object.assign(new Error('Webhook URL hostname is not allowed.'), { status: 400 });
  }
  if (net.isIP(parsed.hostname)) {
    if (isPrivateAddress(parsed.hostname)) throw Object.assign(new Error('Private or reserved webhook targets are not allowed.'), { status: 400 });
    return { parsed, ip: parsed.hostname };
  }

  const results = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  const publicIpv4 = results.find((entry) => entry.family === 4 && !isPrivateAddress(entry.address));
  const publicIpv6 = results.find((entry) => entry.family === 6 && !isPrivateAddress(entry.address));
  const selected = publicIpv4 || publicIpv6;
  if (!selected) throw Object.assign(new Error('Webhook hostname does not resolve to a public address.'), { status: 400 });
  return { parsed, ip: selected.address };
}

function validateWebhookUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value || value.length > 2048) {
    const error = new Error('A valid webhook URL is required (maximum 2048 characters).');
    error.status = 400;
    throw error;
  }
  let parsed;
  try { parsed = new URL(value); } catch (_) {
    const error = new Error('Webhook URL is invalid.');
    error.status = 400;
    throw error;
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    const error = new Error('Webhook URL must use HTTP or HTTPS.');
    error.status = 400;
    throw error;
  }
  if (parsed.username || parsed.password) {
    const error = new Error('Webhook URLs may not contain embedded credentials.');
    error.status = 400;
    throw error;
  }
  return value;
}

function safeWebhook(record) {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    enabled: record.enabled !== false,
    events: Array.isArray(record.events) ? record.events : [],
    environment: record.environment || 'all',
    status: record.status || 'active',
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    lastDeliveryAt: record.lastDeliveryAt || null,
    lastDeliveryStatus: record.lastDeliveryStatus || null,
    failureCount: Number(record.failureCount || 0),
    secretPreview: record.secretPreview || null,
  };
}

async function listWebhooks(workspaceId) {
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('webhooks')
    .orderBy('createdAt', 'desc').limit(MAX_WEBHOOKS).get();
  return snapshot.docs.map((doc) => safeWebhook({ id: doc.id, ...doc.data() }));
}

async function createWebhook({ workspaceId, uid, name, url, events, environment }) {
  const db = adminDb();
  const collection = db.collection('workspaces').doc(workspaceId).collection('webhooks');
  const countSnapshot = await collection.limit(MAX_WEBHOOKS).get();
  if (countSnapshot.size >= MAX_WEBHOOKS) {
    const error = new Error(`A workspace can have at most ${MAX_WEBHOOKS} webhooks.`);
    error.status = 409;
    throw error;
  }

  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) {
    const error = new Error('Webhook name is required.');
    error.status = 400;
    throw error;
  }
  const cleanUrl = validateWebhookUrl(url);
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    const error = new Error('Webhook environment must be all, test, or live.');
    error.status = 400;
    throw error;
  }
  await resolveSafeTarget(cleanUrl);
  const normalizedEvents = normalizeEvents(events);
  const secret = createSigningSecret();
  const encrypted = encryptSecret(secret);
  const id = randomId('wh');
  const now = nowIso();
  const record = {
    workspaceId,
    name: cleanName,
    url: cleanUrl,
    enabled: true,
    status: 'active',
    events: normalizedEvents,
    environment: normalizedEnvironment,
    secretPreview: `••••${secret.slice(-4)}`,
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    secretTag: encrypted.tag,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    failureCount: 0,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
  };
  await collection.doc(id).set(record);
  return { webhook: safeWebhook({ id, ...record }), secret, secretShownOnce: true };
}

async function getWebhook(workspaceId, webhookId) {
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('webhooks').doc(webhookId);
  const snapshot = await ref.get();
  return snapshot.exists ? { ref, ...snapshot.data(), id: snapshot.id } : null;
}

async function updateWebhook({ workspaceId, webhookId, patch }) {
  const webhook = await getWebhook(workspaceId, webhookId);
  if (!webhook) throw Object.assign(new Error('Webhook not found.'), { status: 404 });
  const updates = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim().slice(0, 80);
    if (!name) throw Object.assign(new Error('Webhook name is required.'), { status: 400 });
    updates.name = name;
  }
  if (patch.url !== undefined) {
    const url = validateWebhookUrl(patch.url);
    await resolveSafeTarget(url);
    updates.url = url;
  }
  if (patch.events !== undefined) updates.events = normalizeEvents(patch.events);
  if (patch.environment !== undefined) {
    const env = normalizeEnvironment(patch.environment);
    if (!env) throw Object.assign(new Error('Webhook environment must be all, test, or live.'), { status: 400 });
    updates.environment = env;
  }
  if (patch.enabled !== undefined) updates.enabled = Boolean(patch.enabled);
  await webhook.ref.set(updates, { merge: true });
  return safeWebhook({ ...webhook, ...updates });
}

async function deleteWebhook({ workspaceId, webhookId }) {
  const webhook = await getWebhook(workspaceId, webhookId);
  if (!webhook) throw Object.assign(new Error('Webhook not found.'), { status: 404 });
  await webhook.ref.set({ enabled: false, status: 'deleted', updatedAt: nowIso() }, { merge: true });
  return { id: webhookId, status: 'deleted' };
}

async function rotateWebhookSecret({ workspaceId, webhookId }) {
  const webhook = await getWebhook(workspaceId, webhookId);
  if (!webhook) throw Object.assign(new Error('Webhook not found.'), { status: 404 });
  const secret = createSigningSecret();
  const encrypted = encryptSecret(secret);
  await webhook.ref.set({
    secretPreview: `••••${secret.slice(-4)}`,
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    secretTag: encrypted.tag,
    updatedAt: nowIso(),
  }, { merge: true });
  return { id: webhookId, secret, secretShownOnce: true };
}

function createEventEnvelope(type, data = {}, environment = null) {
  if (!Object.prototype.hasOwnProperty.call(EVENT_DEFINITIONS, type)) {
    throw new Error(`Unsupported webhook event type: ${type}`);
  }
  return {
    id: randomId('evt'),
    type,
    created: nowIso(),
    environment: environment || null,
    data,
  };
}

async function queueWebhookEvent({ workspaceId, type, data = {}, environment = null, targetWebhookId = null }) {
  const event = createEventEnvelope(type, data, environment);
  if (targetWebhookId) event.targetWebhookId = targetWebhookId;
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('webhookEvents').doc(event.id);
  await ref.set({
    workspaceId,
    ...event,
    status: 'pending',
    fanoutAttempts: 0,
    createdAt: event.created,
    updatedAt: event.created,
  });
  return event;
}

async function queueWebhookEventForOwner(uid, type, data = {}, environment = null) {
  const snapshot = await adminDb().collection('workspaces').where('ownerUid', '==', uid).get();
  const results = [];
  for (const doc of snapshot.docs) {
    try {
      results.push(await queueWebhookEvent({ workspaceId: doc.id, type, data, environment }));
    } catch (error) {
      console.error(`Webhook event enqueue failed for workspace ${doc.id}:`, error.message);
    }
  }
  return results;
}

function shouldReceive(webhook, event) {
  if (webhook.status !== 'active' || webhook.enabled === false) return false;
  if (event.targetWebhookId && event.targetWebhookId !== webhook.id) return false;
  if (!Array.isArray(webhook.events) || !webhook.events.includes(event.type)) return false;
  if (webhook.environment && webhook.environment !== 'all' && event.environment && webhook.environment !== event.environment) return false;
  return true;
}

async function fanOutEvent(doc) {
  const db = adminDb();
  const event = { id: doc.id, ...doc.data() };
  const eventRef = doc.ref;
  const eventClaimed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(eventRef);
    if (!snapshot.exists) return false;
    const data = snapshot.data();
    const stale = data.status === 'processing' && data.lockedAt && Date.now() - new Date(data.lockedAt).getTime() > STALE_LOCK_MS;
    if (data.status === 'complete') return false;
    if (data.status !== 'pending' && !(data.status === 'processing' && stale)) return false;
    tx.set(eventRef, { status: 'processing', lockedAt: nowIso(), fanoutAttempts: Number(data.fanoutAttempts || 0) + 1, updatedAt: nowIso() }, { merge: true });
    return true;
  });
  if (!eventClaimed) return false;

  try {
    const webhookSnapshot = await db.collection('workspaces').doc(event.workspaceId).collection('webhooks')
      .where('status', '==', 'active').limit(MAX_WEBHOOKS).get();
    const batch = db.batch();
    let count = 0;
    for (const webhookDoc of webhookSnapshot.docs) {
      const webhook = { id: webhookDoc.id, ...webhookDoc.data() };
      if (!shouldReceive(webhook, event)) continue;
      const deliveryId = `del_${sha256(`${webhookDoc.id}:${event.id}`).slice(0, 32)}`;
      const deliveryRef = webhookDoc.ref.collection('deliveries').doc(deliveryId);
      batch.set(deliveryRef, {
        id: deliveryId,
        workspaceId: event.workspaceId,
        webhookId: webhookDoc.id,
        webhookName: webhook.name || null,
        eventId: event.id,
        eventType: event.type,
        environment: event.environment || null,
        status: 'pending',
        attempt: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        nextAttemptAt: nowIso(),
        lastResponseCode: null,
        lastError: null,
        deliveredAt: null,
        latencyMs: null,
      }, { merge: true });
      count += 1;
      if (count >= 400) break;
    }
    if (count) await batch.commit();
    await eventRef.set({ status: 'complete', fannedOutAt: nowIso(), deliveryCount: count, updatedAt: nowIso(), lockedAt: null }, { merge: true });
    return true;
  } catch (error) {
    await eventRef.set({ status: 'pending', lastError: String(error.message || error), updatedAt: nowIso(), lockedAt: null }, { merge: true }).catch(() => {});
    throw error;
  }
}

async function claimDelivery(deliveryDoc) {
  const ref = deliveryDoc.ref;
  return adminDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    const now = Date.now();
    const stale = data.status === 'processing' && data.lockedAt && now - new Date(data.lockedAt).getTime() > STALE_LOCK_MS;
    const eligible = data.status === 'pending' || (data.status === 'retry' && (!data.nextAttemptAt || new Date(data.nextAttemptAt).getTime() <= now)) || stale;
    if (!eligible) return null;
    const attempt = Number(data.attempt || 0) + 1;
    if (attempt > MAX_ATTEMPTS) {
      tx.set(ref, { status: 'failed', updatedAt: nowIso(), lastError: 'Maximum delivery attempts exceeded.' }, { merge: true });
      return null;
    }
    tx.set(ref, { status: 'processing', attempt, lockedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
    return { ...data, id: snapshot.id, attempt };
  });
}

function deliveryBackoff(attempt) {
  return RETRY_DELAYS_MS[Math.min(Math.max(Number(attempt || 1) - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

function deliverHttp({ url, payload, secret, requestId }) {
  return resolveSafeTarget(url).then(({ parsed, ip }) => new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${body}`;
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    const transport = parsed.protocol === 'https:' ? https : http;
    const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'Nexus-Webhooks/1.0',
      'X-Nexus-Event': payload.type,
      'X-Nexus-Delivery': requestId,
      'X-Nexus-Timestamp': String(timestamp),
      'X-Nexus-Signature': `v1=${signature}`,
    };
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: ip,
      port,
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      method: 'POST',
      headers: { ...headers, Host: parsed.host },
      servername: parsed.hostname,
      timeout: DEFAULT_TIMEOUT_MS,
      rejectUnauthorized: true,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (STORE_RESPONSE_BODY && size <= MAX_STORED_RESPONSE_BODY) chunks.push(chunk);
      });
      response.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const statusCode = Number(response.statusCode || 0);
        resolve({ statusCode, responseBody: bodyText.slice(0, 64 * 1024) });
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Webhook delivery timed out after ${DEFAULT_TIMEOUT_MS}ms.`)));
    request.on('error', reject);
    request.write(body);
    request.end();
  }));
}

function storedResponseFields(responseBody) {
  if (!STORE_RESPONSE_BODY) return {};
  return { lastResponseBody: String(responseBody || '').slice(0, MAX_STORED_RESPONSE_BODY) };
}

async function processDelivery(deliveryDoc) {
  const claimed = await claimDelivery(deliveryDoc);
  if (!claimed) return false;
  const webhook = await getWebhook(claimed.workspaceId, claimed.webhookId);
  if (!webhook || webhook.status !== 'active' || webhook.enabled === false) {
    await deliveryDoc.ref.set({ status: 'failed', updatedAt: nowIso(), lastError: 'Webhook is disabled or deleted.', lockedAt: null }, { merge: true });
    return true;
  }

  const eventSnapshot = await adminDb().collection('workspaces').doc(claimed.workspaceId).collection('webhookEvents').doc(claimed.eventId).get();
  if (!eventSnapshot.exists) {
    await deliveryDoc.ref.set({ status: 'failed', updatedAt: nowIso(), lastError: 'Event no longer exists.', lockedAt: null }, { merge: true });
    return true;
  }

  const event = eventSnapshot.data();
  let secret;
  try {
    secret = decryptSecret(webhook);
  } catch (error) {
    await deliveryDoc.ref.set({ status: 'failed', updatedAt: nowIso(), lastError: 'Webhook signing secret could not be decrypted.', lockedAt: null }, { merge: true });
    return true;
  }
  const started = Date.now();
  try {
    const result = await deliverHttp({ url: webhook.url, payload: event, secret, requestId: claimed.id });
    const latencyMs = Date.now() - started;
    const ok = result.statusCode >= 200 && result.statusCode < 300;
    if (ok) {
      await deliveryDoc.ref.set({
        status: 'delivered',
        deliveredAt: nowIso(),
        updatedAt: nowIso(),
        lockedAt: null,
        lastResponseCode: result.statusCode,
        ...storedResponseFields(result.responseBody),
        latencyMs,
      }, { merge: true });
      await webhook.ref.set({ lastDeliveryAt: nowIso(), lastDeliveryStatus: 'delivered', failureCount: 0, updatedAt: nowIso() }, { merge: true }).catch(() => {});
      return true;
    }
    const nextDelay = deliveryBackoff(claimed.attempt);
    const terminal = claimed.attempt >= MAX_ATTEMPTS;
    await deliveryDoc.ref.set({
      status: terminal ? 'failed' : 'retry',
      nextAttemptAt: new Date(Date.now() + nextDelay).toISOString(),
      updatedAt: nowIso(),
      lockedAt: null,
      lastResponseCode: result.statusCode,
      ...storedResponseFields(result.responseBody),
      lastError: `Webhook endpoint returned HTTP ${result.statusCode}.`,
      latencyMs,
    }, { merge: true });
    await webhook.ref.set({ lastDeliveryAt: nowIso(), lastDeliveryStatus: terminal ? 'failed' : 'retrying', failureCount: Number(webhook.failureCount || 0) + 1, updatedAt: nowIso() }, { merge: true }).catch(() => {});
    return true;
  } catch (error) {
    const latencyMs = Date.now() - started;
    const terminal = claimed.attempt >= MAX_ATTEMPTS;
    const nextDelay = deliveryBackoff(claimed.attempt);
    await deliveryDoc.ref.set({
      status: terminal ? 'failed' : 'retry',
      nextAttemptAt: new Date(Date.now() + nextDelay).toISOString(),
      updatedAt: nowIso(),
      lockedAt: null,
      lastError: String(error.message || error),
      latencyMs,
    }, { merge: true });
    await webhook.ref.set({ lastDeliveryAt: nowIso(), lastDeliveryStatus: terminal ? 'failed' : 'retrying', failureCount: Number(webhook.failureCount || 0) + 1, updatedAt: nowIso() }, { merge: true }).catch(() => {});
    return true;
  }
}

async function processWebhookWorkerOnce() {
  const db = adminDb();
  const eventPending = await db.collectionGroup('webhookEvents').where('status', '==', 'pending').limit(20).get();
  const eventProcessing = await db.collectionGroup('webhookEvents').where('status', '==', 'processing').limit(20).get();
  for (const doc of [...eventPending.docs, ...eventProcessing.docs]) {
    try { await fanOutEvent(doc); } catch (error) { console.error('Webhook event fan-out failed:', error.message); }
  }

  const pending = await db.collectionGroup('deliveries').where('status', '==', 'pending').limit(50).get();
  const retry = await db.collectionGroup('deliveries').where('status', '==', 'retry').limit(50).get();
  const processing = await db.collectionGroup('deliveries').where('status', '==', 'processing').limit(50).get();
  const docs = [...pending.docs, ...retry.docs, ...processing.docs];
  for (const doc of docs) {
    try { await processDelivery(doc); } catch (error) { console.error('Webhook delivery processing failed:', error.message); }
  }
}

function startWebhookWorker() {
  const enabled = String(process.env.WEBHOOK_WORKER_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return null;
  const interval = Math.min(Math.max(Number(process.env.WEBHOOK_WORKER_INTERVAL_MS) || 5000, 1000), 60000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processWebhookWorkerOnce(); } catch (error) { console.error('Webhook worker tick failed:', error.message); }
    running = false;
  };
  const timer = setInterval(tick, interval);
  timer.unref?.();
  setImmediate(tick);
  console.log(`🔁 Webhook worker enabled (${interval}ms interval)`);
  return timer;
}

async function listWebhookDeliveries({ workspaceId, webhookId, limit = 50 }) {
  const webhook = await getWebhook(workspaceId, webhookId);
  if (!webhook) throw Object.assign(new Error('Webhook not found.'), { status: 404 });
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const snapshot = await webhook.ref.collection('deliveries').orderBy('createdAt', 'desc').limit(safeLimit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function retryWebhookDelivery({ workspaceId, webhookId, deliveryId }) {
  const webhook = await getWebhook(workspaceId, webhookId);
  if (!webhook) throw Object.assign(new Error('Webhook not found.'), { status: 404 });
  const ref = webhook.ref.collection('deliveries').doc(deliveryId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('Webhook delivery not found.'), { status: 404 });
  const data = snapshot.data();
  if (!['failed', 'retry'].includes(data.status)) {
    throw Object.assign(new Error('Only failed or retrying deliveries can be manually retried.'), { status: 409 });
  }
  await ref.set({ status: 'pending', nextAttemptAt: nowIso(), lastError: null, updatedAt: nowIso(), lockedAt: null }, { merge: true });
  return { id: deliveryId, status: 'pending' };
}

function listSupportedEvents() {
  return Object.entries(EVENT_DEFINITIONS).map(([id, description]) => ({ id, description }));
}

module.exports = {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  queueWebhookEvent,
  queueWebhookEventForOwner,
  listWebhookDeliveries,
  retryWebhookDelivery,
  listSupportedEvents,
  startWebhookWorker,
  getWebhookForAutomation: getWebhook,
};
