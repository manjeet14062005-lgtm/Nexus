const { adminDb } = require('./supabaseAdmin');
const { getPlan } = require('./plans');

async function getWorkspacePlan(workspaceId) {
  const workspaceSnap = await adminDb().collection('workspaces').doc(workspaceId).get();
  if (!workspaceSnap.exists) return null;
  const workspace = workspaceSnap.data();
  const ownerUid = workspace.ownerUid;
  if (!ownerUid) return getPlan('starter');
  const billingSnap = await adminDb().collection('billing').doc(ownerUid).get();
  if (!billingSnap.exists) return getPlan('starter');
  const billing = billingSnap.data();
  const plan = getPlan(billing.plan) || getPlan('starter');
  if (!['active', 'trialing'].includes(String(billing.status || 'active'))) return getPlan('starter');
  return plan;
}

async function requireWorkspaceFeature(workspaceId, feature) {
  const plan = await getWorkspacePlan(workspaceId);
  if (!plan) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
  if (!plan.featureFlags?.[feature]) {
    const error = new Error(`The current plan does not include ${feature}. Upgrade your plan to continue.`);
    error.code = 'FEATURE_NOT_INCLUDED';
    error.status = 402;
    throw error;
  }
  return plan;
}

module.exports = { getWorkspacePlan, requireWorkspaceFeature };
