const { adminDb } = require('./supabaseAdmin');
const { requireWorkspaceFeature, getWorkspacePlan } = require('./entitlements');

const DEFAULT_BRANDING = Object.freeze({
  enabled: false,
  brandName: '',
  logoUrl: '',
  accentColor: '#6366F1',
});

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeAccentColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : DEFAULT_BRANDING.accentColor;
}

function validateHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw Object.assign(new Error('Logo URL must be a valid HTTPS URL.'), { status: 400, code: 'INVALID_LOGO_URL' });
  }
  if (url.protocol !== 'https:') {
    throw Object.assign(new Error('Logo URL must use HTTPS.'), { status: 400, code: 'HTTPS_LOGO_REQUIRED' });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error('Logo URL must not contain credentials.'), { status: 400, code: 'INVALID_LOGO_URL' });
  }
  return url.toString().slice(0, 2048);
}

function safeBranding(data = {}, plan = null) {
  return {
    enabled: Boolean(data.enabled) && Boolean(plan?.featureFlags?.whiteLabel),
    brandName: cleanText(data.brandName, 80),
    logoUrl: cleanText(data.logoUrl, 2048),
    accentColor: normalizeAccentColor(data.accentColor),
    available: Boolean(plan?.featureFlags?.whiteLabel),
    planId: plan?.id || null,
  };
}

async function getWorkspaceBranding(workspaceId) {
  const [snapshot, plan] = await Promise.all([
    adminDb().collection('workspaces').doc(workspaceId).collection('settings').doc('branding').get(),
    getWorkspacePlan(workspaceId),
  ]);
  return safeBranding(snapshot.exists ? snapshot.data() : DEFAULT_BRANDING, plan);
}

async function updateWorkspaceBranding({ workspaceId, input }) {
  const plan = await requireWorkspaceFeature(workspaceId, 'whiteLabel');
  const branding = {
    enabled: input?.enabled !== false,
    brandName: cleanText(input?.brandName, 80),
    logoUrl: validateHttpsUrl(input?.logoUrl),
    accentColor: normalizeAccentColor(input?.accentColor),
    updatedAt: new Date().toISOString(),
  };

  if (!branding.brandName && !branding.logoUrl) {
    branding.enabled = false;
  }

  await adminDb().collection('workspaces').doc(workspaceId).collection('settings').doc('branding').set(branding, { merge: true });
  return safeBranding(branding, plan);
}

module.exports = { DEFAULT_BRANDING, getWorkspaceBranding, updateWorkspaceBranding, validateHttpsUrl, normalizeAccentColor };
