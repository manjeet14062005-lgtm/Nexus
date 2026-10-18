const { adminAuth, adminDb, supabaseAdmin } = require('./supabaseAdmin');
const { randomUUID } = require('crypto');

const DELETION_GRACE_DAYS = Math.max(1, Number(process.env.ACCOUNT_DELETION_GRACE_DAYS) || 7);
const DELETION_INTERVAL_MS = Math.max(60_000, Number(process.env.ACCOUNT_DELETION_SWEEP_INTERVAL_MS) || 15 * 60_000);
const PAGE_SIZE = 400;

function cleanString(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function deletionExecuteAt() {
  return new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function findOwnedWorkspaces(uid) {
  const snap = await adminDb().collection('workspaces').where('ownerUid', '==', uid).limit(25).get();
  return snap.docs.map((doc) => ({ id: doc.id, name: doc.data()?.name || doc.id }));
}

async function getBillingState(uid) {
  const snap = await adminDb().collection('billing').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function hasBlockingSubscription(billing) {
  if (!billing) return false;
  const state = String(billing.status || '').toLowerCase();
  return ['active', 'trialing', 'past_due', 'paused', 'authenticated', 'created'].includes(state) && Boolean(billing.subId || billing.subscriptionId);
}

async function buildPersonalExport(uid) {
  const db = adminDb();
  const profileSnap = await db.collection('users').where('submitterUid', '==', uid).limit(10).get();
  const profile = profileSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const identity = await adminAuth().getUser(uid);
  const {data:roleRow,error:roleError}=await supabaseAdmin.from('nexus_user_roles').select('role').eq('user_id',uid).maybeSingle();
  if(roleError) throw roleError;
  const membershipsSnap = await db.collection('workspaceMembers').where('uid', '==', uid).limit(500).get();
  const owned = await findOwnedWorkspaces(uid);
  const billing = await getBillingState(uid);
  const prefsSnap = await db.collection('billing_preferences').doc(uid).get();
  const supportSnap = await db.collection('supportTickets').where('requesterUid', '==', uid).limit(200).get();
  const deletionSnap = await db.collection('accountDeletionRequests').doc(uid).get();
  const securitySnap = await db.collection('securityEvents').where('uid', '==', uid).limit(500).get();
  const {data:accountEvents,error:eventError}=await supabaseAdmin.from('nexus_account_events').select('id,type,created_at,metadata').eq('user_id',uid).order('created_at',{ascending:false}).limit(500);
  if(eventError)throw eventError;
  const formsSnap = await db.collection('forms').where('uid', '==', uid).limit(500).get();

  return {
    schemaVersion: '14.0',
    exportedAt: new Date().toISOString(),
    account: {
      uid,
      email: identity.email || null,
      emailVerified: Boolean(identity.email_confirmed_at),
      role: ['admin','moderator','user'].includes(roleRow?.role) ? roleRow.role : 'user',
    },
    profile:profile.map(p=>Object.fromEntries(['id','name','country','state','bio','photoUrl','phone','phoneVerified','createdAt','updatedAt','marketingEmails','weeklyDigest','securityAlerts'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))),
    workspaceMemberships: membershipsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ownedWorkspaces: owned,
    billing: billing ? {
      status: billing.status || null,
      plan: billing.plan || null,
      subscriptionId: billing.subId || billing.subscriptionId || null,
      currentPeriodEnd: billing.currentPeriodEnd || null,
    } : null,
    billingPreferences: prefsSnap.exists ? prefsSnap.data() : null,
    supportTickets: supportSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    securityEvents: securitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    accountEvents,
    legacyForms: formsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    deletionRequest: deletionSnap.exists ? Object.fromEntries(Object.entries(deletionSnap.data()).filter(([key])=>!["leaseToken","leaseUntil","error"].includes(key))) : null,
    limits: {profile:10,workspaceMemberships:500,ownedWorkspaces:25,supportTickets:200,securityEvents:500,accountEvents:500,legacyForms:500},
    note: 'This bounded personal export excludes workspace-owned operational data, support conversation messages, and provider logs. Collections reaching a stated limit may be incomplete; contact support for a larger export. Legal/accounting records may be retained.',
  };
}

async function createDeletionRequest(uid, email = null) {
  return lifecycle(uid,'request');
}

async function cancelDeletionRequest(uid) {
  return lifecycle(uid,'cancel');
}

async function lifecycle(uid,operation,token=null,extra={}) {
 const {data,error}=await supabaseAdmin.rpc('nexus_account_lifecycle',{target:uid,operation,lease_token:token,protected_uids:String(process.env.NEXUS_BOOTSTRAP_ADMIN_UIDS || '').split(',').map(v=>v.trim()).filter(Boolean),grace_days:DELETION_GRACE_DAYS,...extra});
 if(error){const err=new Error(['23505','22023','42501','40001'].includes(error.code)?error.message:'Account service is unavailable. Please retry.');err.status=({'23505':409,'22023':400,'42501':403,'40001':409})[error.code] || 503;throw err;}
 return data;
}

async function deleteDocsQuery(queryRef,guard) {
  let deleted = 0;
  while (true) {
    const snap = await queryRef.limit(PAGE_SIZE).get();
    if (snap.empty) break;
    const batch = adminDb().batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await guard(); await batch.commit();
    if (snap.size < PAGE_SIZE) break;
  }
  return deleted;
}

async function processOneDeletionRequest(doc) {
  const data = doc.data();
  const uid = data.uid || doc.id;
  const token=randomUUID(); const claimed=await lifecycle(uid,'claim',token); if(!claimed)return false;
  const guard=()=>lifecycle(uid,'renew',token);
  try {
  const db = adminDb();
  const accountEmail = claimed.email || null;
  await deleteDocsQuery(db.collection('users').where('submitterUid', '==', uid),guard);
  await deleteDocsQuery(db.collection('workspaceMembers').where('uid', '==', uid),guard);
  if (accountEmail) await deleteDocsQuery(db.collection('workspaceInvites').where('email', '==', accountEmail),guard);
  await deleteDocsQuery(db.collection('messages').where('toUid', '==', uid),guard);
  await deleteDocsQuery(db.collection('messages').where('fromUid', '==', uid),guard);
  await deleteDocsQuery(db.collection('forms').where('uid', '==', uid),guard);
  await deleteDocsQuery(db.collection('report_schedules').where('createdBy', '==', uid),guard);
  while (true) {
    const ticketSnap = await db.collection('supportTickets').where('requesterUid', '==', uid).limit(PAGE_SIZE).get();
    if (ticketSnap.empty) break;
    for (const ticketDoc of ticketSnap.docs) {
      while (true) {
        const messageSnap = await ticketDoc.ref.collection('messages').limit(PAGE_SIZE).get();
        if (messageSnap.empty) break;
        const batch = db.batch();
        messageSnap.docs.forEach((message) => batch.delete(message.ref));
        await guard(); await batch.commit();
        if (messageSnap.size < PAGE_SIZE) break;
      }
      await guard(); await ticketDoc.ref.delete();
    }
    if (ticketSnap.size < PAGE_SIZE) break;
  }
  await deleteDocsQuery(db.collection('securityEvents').where('uid', '==', uid),guard);

  await guard(); await db.collection('roles').doc(uid).delete();
  await guard(); await db.collection('billing_preferences').doc(uid).delete();

  // Billing invoices are not automatically deleted: accounting/legal retention may apply.
  try {
    await guard(); await adminAuth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found' && error?.code !== 'user_not_found' && error?.status !== 404) throw error;
  }
  await lifecycle(uid,'finish',token);
  return true;
  } catch(error) {await lifecycle(uid,'fail',token).catch(()=>{});throw error;}
}

async function processDeletionRequests() {
  const {data:requests,error}=await supabaseAdmin.rpc('nexus_account_deletion_candidates');
  if(error)throw error;
  const docs=(requests || []).map(row=>({id:row.doc_id,data:()=>row.data}));
  let processed = 0;
  for (const doc of docs) {
    try {
      if (await processOneDeletionRequest(doc)) processed += 1;
    } catch (error) {
      console.error(`Account deletion failed for ${doc.id}:`, error.message);
    }
  }
  return { scanned: docs.length, processed };
}

function startAccountDeletionWorker() {
  if (String(process.env.ACCOUNT_DELETION_WORKER_ENABLED || 'true').toLowerCase() === 'false') return null;
  const run = () => processDeletionRequests().catch((error) => console.error('Account deletion sweep failed:', error.message));
  run();
  return setInterval(run, DELETION_INTERVAL_MS);
}

module.exports = {
  buildPersonalExport,
  createDeletionRequest,
  cancelDeletionRequest,
  processDeletionRequests,
  startAccountDeletionWorker,
  DELETION_GRACE_DAYS,
  lifecycle,
};
