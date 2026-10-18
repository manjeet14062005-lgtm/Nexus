const crypto = require('crypto');
const { adminDb } = require('./supabaseAdmin');
const { getWorkspaceMembership } = require('./auth');
const { workspaceRoleHasPermission } = require('./workspacePermissions');

const KEY_PREFIX = Object.freeze({ test: 'nx_test_', live: 'nx_live_' });
const DEFAULT_PERMISSIONS = Object.freeze(['verification:read', 'verification:write']);
const ALLOWED_PERMISSIONS = new Set(DEFAULT_PERMISSIONS);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function constantTimeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function createApiKey(environment = 'test') {
  if (!(environment in KEY_PREFIX)) throw new Error('Invalid API key environment.');
  const secret = crypto.randomBytes(32).toString('base64url');
  const key = `${KEY_PREFIX[environment]}${secret}`;
  return {
    key,
    environment,
    keyHash: sha256(key),
    prefix: key.slice(0, KEY_PREFIX[environment].length + 8),
    last4: key.slice(-4),
  };
}

function safeApiKey(record) {
  const expiresAt = record.expiresAt || null;
  return {
    id: record.id,
    name: record.name,
    environment: record.environment,
    prefix: record.prefix,
    last4: record.last4,
    permissions: Array.isArray(record.permissions) ? record.permissions : [],
    status: record.status || 'active',
    createdAt: record.createdAt || null,
    lastUsedAt: record.lastUsedAt || null,
    expiresAt,
    createdBy: record.createdBy || null,
  };
}

function normalizeEnvironment(value) {
  const env = String(value || 'test').trim().toLowerCase();
  return env === 'live' ? 'live' : env === 'test' ? 'test' : null;
}

function normalizePermissions(value) {
  if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_PERMISSIONS];
  const permissions = [...new Set(value.map((v) => String(v).trim()).filter((v) => ALLOWED_PERMISSIONS.has(v)))];
  if (!permissions.length) return [...DEFAULT_PERMISSIONS];
  return permissions;
}

async function resolveApiKey(rawKey) {
  const value = String(rawKey || '').trim();
  if (!/^nx_(test|live)_[A-Za-z0-9_-]{32,}$/.test(value)) return null;

  const environment = value.startsWith(KEY_PREFIX.live) ? 'live' : 'test';
  const hash = sha256(value);
  const snapshot = await adminDb().collectionGroup('apiKeys').where('keyHash', '==', hash).limit(1).get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const record = doc.data();
  if (record.status !== 'active') return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    await doc.ref.set({ status: 'expired', expiredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    return null;
  }
  if (record.environment !== environment) return null;
  if (!constantTimeEqualHex(record.keyHash, hash)) return null;

  const workspaceSnap = await adminDb().collection('workspaces').doc(record.workspaceId).get();
  if (!workspaceSnap.exists) return null;
  const workspace = workspaceSnap.data();
  if (String(workspace.status || 'active').toLowerCase() === 'suspended') return null;

  return {
    id: doc.id,
    ...record,
    workspace: { id: record.workspaceId, ...workspace },
    ref: doc.ref,
  };
}

async function listWorkspaceApiKeys(workspaceId) {
  const snapshot = await adminDb()
    .collection('workspaces').doc(workspaceId).collection('apiKeys')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((doc) => safeApiKey({ id: doc.id, ...doc.data() }));
}

async function createWorkspaceApiKey({ workspaceId, uid, name, environment, permissions, expirationDays }) {
  const membership = await getWorkspaceMembership(uid, workspaceId);
  if (!membership || !workspaceRoleHasPermission(membership.role, 'api_keys.create')) {
    const error = new Error('Developer permission required.');
    error.status = 403;
    throw error;
  }

  const env = normalizeEnvironment(environment);
  if (!env) {
    const error = new Error('Environment must be test or live.');
    error.status = 400;
    throw error;
  }

  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) {
    const error = new Error('API key name is required.');
    error.status = 400;
    throw error;
  }

  const generated = createApiKey(env);
  const expiration = String(expirationDays || 'never').toLowerCase();
  const allowedExpirations = new Set(['never', '30', '90', '180', '365']);
  if (!allowedExpirations.has(expiration)) {
    const error = new Error('API key expiration must be never, 30, 90, 180, or 365 days.');
    error.status = 400;
    throw error;
  }
  const expiresAt = expiration === 'never' ? null : new Date(Date.now() + Number(expiration) * 24 * 60 * 60 * 1000).toISOString();
  const id = `key_${crypto.randomBytes(10).toString('hex')}`;
  const now = new Date().toISOString();
  const record = {
    workspaceId,
    keyHash: generated.keyHash,
    prefix: generated.prefix,
    last4: generated.last4,
    name: cleanName,
    environment: env,
    permissions: normalizePermissions(permissions),
    status: 'active',
    createdBy: uid,
    createdAt: now,
    lastUsedAt: null,
    expiresAt,
    updatedAt: now,
  };

  await adminDb().collection('workspaces').doc(workspaceId).collection('apiKeys').doc(id).set(record);

  return {
    apiKey: generated.key,
    ...safeApiKey({ id, ...record }),
    secretShownOnce: true,
  };
}

async function revokeWorkspaceApiKey({ workspaceId, keyId, uid }) {
  const membership = await getWorkspaceMembership(uid, workspaceId);
  if (!membership || !workspaceRoleHasPermission(membership.role, 'api_keys.revoke')) {
    const error = new Error('Developer permission required.');
    error.status = 403;
    throw error;
  }

  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('apiKeys').doc(keyId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const error = new Error('API key not found.');
    error.status = 404;
    throw error;
  }

  await ref.set({
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    revokedBy: uid,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return { id: keyId, status: 'revoked' };
}

async function touchApiKeyUsage(record) {
  if (!record?.ref) return;
  const lastUsed = record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
  if (lastUsed && Date.now() - lastUsed < 5 * 60 * 1000) return;
  await record.ref.set({
    lastUsedAt: new Date().toISOString(),
  }, { merge: true }).catch(() => {});
}

module.exports = {
  DEFAULT_PERMISSIONS,
  createApiKey,
  listWorkspaceApiKeys,
  createWorkspaceApiKey,
  revokeWorkspaceApiKey,
  resolveApiKey,
  touchApiKeyUsage,
  normalizeEnvironment,
};
