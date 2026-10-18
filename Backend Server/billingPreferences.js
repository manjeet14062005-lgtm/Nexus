const { adminDb } = require('./supabaseAdmin');

const DEFAULT_PREFERENCES = Object.freeze({
  emailInvoices: true,
  usageAlerts: true,
  renewalReminders: true,
  failedRetries: false,
});

function normalizePreferences(input = {}) {
  const output = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (typeof input[key] === 'boolean') output[key] = input[key];
  }
  return output;
}

async function getBillingPreferences(uid) {
  const ref = adminDb().collection('billing_preferences').doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return { uid, ...DEFAULT_PREFERENCES };
  }
  return { uid, ...normalizePreferences(snapshot.data()) };
}

async function updateBillingPreferences(uid, patch) {
  const ref = adminDb().collection('billing_preferences').doc(uid);
  const existingSnapshot = await ref.get();
  const existing = existingSnapshot.exists ? normalizePreferences(existingSnapshot.data()) : DEFAULT_PREFERENCES;
  const preferences = normalizePreferences({ ...existing, ...(patch || {}) });
  const now = new Date().toISOString();
  await ref.set({
    uid,
    ...preferences,
    updatedAt: now,
  }, { merge: true });
  return { uid, ...preferences, updatedAt: now };
}

module.exports = { DEFAULT_PREFERENCES, getBillingPreferences, updateBillingPreferences, normalizePreferences };
