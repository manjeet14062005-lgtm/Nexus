const crypto = require('crypto');
const { adminDb, supabaseAdmin } = require('./supabaseAdmin');
const { getWorkspaceMembership } = require('./auth');
const { getPlan } = require('./plans');

const WORKSPACE_ROLES = Object.freeze(['owner', 'admin', 'developer', 'analyst', 'viewer']);
const MANAGEABLE_ROLES = Object.freeze(['admin', 'developer', 'analyst', 'viewer']);

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return WORKSPACE_ROLES.includes(value) ? value : null;
}

async function getOwnerPlan(uid) {
  const billing = await adminDb().collection('billing').doc(uid).get();
  if (!billing.exists) return getPlan('starter');
  const data = billing.data() || {};
  if (!['active', 'trialing'].includes(String(data.status || 'active'))) return getPlan('starter');
  return getPlan(data.plan) || getPlan('starter');
}

async function listUserWorkspaces(uid) {
  const db = adminDb();
  const [ownedSnap, memberSnap] = await Promise.all([
    db.collection('workspaces').where('ownerUid', '==', uid).get(),
    db.collection('workspaceMembers').where('uid', '==', uid).get(),
  ]);
  const byId = new Map();
  ownedSnap.docs.forEach((doc) => byId.set(doc.id, { id: doc.id, ...doc.data(), role: 'owner' }));
  memberSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (!data.workspaceId || byId.has(data.workspaceId)) return;
    byId.set(data.workspaceId, { id: data.workspaceId, role: normalizeRole(data.role) || 'viewer' });
  });
  await Promise.all([...byId.keys()].map(async (workspaceId) => {
    const current = byId.get(workspaceId);
    if (current?.name) return;
    const snap = await db.collection('workspaces').doc(workspaceId).get();
    if (snap.exists) byId.set(workspaceId, { ...current, ...snap.data(), id: workspaceId });
  }));
  // Include normalized records, then resolve every candidate through the same
  // authority used by mutations. Stale legacy documents never confer access.
  const [owned, memberships] = await Promise.all([
    supabaseAdmin.from('nexus_workspaces').select('id').eq('owner_id', uid),
    supabaseAdmin.from('nexus_workspace_members').select('workspace_id').eq('user_id', uid),
  ]);
  if (owned.error) throw owned.error;
  if (memberships.error) throw memberships.error;
  for (const row of owned.data || []) if (!byId.has(row.id)) byId.set(row.id, { id: row.id });
  for (const row of memberships.data || []) if (!byId.has(row.workspace_id)) byId.set(row.workspace_id, { id: row.workspace_id });
  const resolved = await Promise.all([...byId.keys()].map(async (id) => {
    const membership = await getWorkspaceMembership(uid, id);
    return membership ? { ...membership.workspace, id, role: membership.role } : null;
  }));
  return resolved.filter(Boolean)
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

async function createWorkspace({ uid, email, displayName, name, description }) {
  const cleanName = cleanText(name, 80);
  const cleanDescription = cleanText(description, 300);
  if (!cleanName) {
    throw Object.assign(new Error('Workspace name is required.'), { status: 400, code: 'INVALID_WORKSPACE_NAME' });
  }

  const plan = await getOwnerPlan(uid);
  if (plan.workspaceLimit != null) {
    const countSnap = await adminDb().collection('workspaces').where('ownerUid', '==', uid).get();
    if (countSnap.size >= plan.workspaceLimit) {
      throw Object.assign(new Error(`Your ${plan.name} plan allows ${plan.workspaceLimit} workspace${plan.workspaceLimit === 1 ? '' : 's'}. Upgrade your plan to create another workspace.`), { status: 402, code: 'WORKSPACE_LIMIT_REACHED' });
    }
  }

  const db = adminDb();
  const workspaceRef = db.collection('workspaces').doc();
  const now = new Date().toISOString();
  const workspace = {
    name: cleanName,
    description: cleanDescription,
    ownerUid: uid,
    ownerEmail: email || null,
    ownerName: displayName || email || uid,
    status: 'active',
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  };
  const memberRef = db.collection('workspaceMembers').doc();
  const activityRef = db.collection('workspaceActivity').doc();
  const batch = db.batch();
  batch.set(workspaceRef, workspace);
  batch.set(memberRef, {
    workspaceId: workspaceRef.id,
    uid,
    email: email || null,
    name: displayName || email || uid,
    role: 'owner',
    joinedAt: now,
    status: 'active',
  });
  batch.set(activityRef, {
    workspaceId: workspaceRef.id,
    message: `Workspace "${cleanName}" created`,
    actor: email || uid,
    actorUid: uid,
    action: 'workspace.created',
    ts: Date.now(),
    createdAt: now,
  });
  await batch.commit();
  return { id: workspaceRef.id, ...workspace, role: 'owner' };
}

async function listMembers(workspaceId, db = adminDb()) {
  const snapshot = await db.collection('workspaceMembers')
    .where('workspaceId', '==', workspaceId)
    .get();
  const members = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const uids = [...new Set(members.map(member => member.uid).filter(Boolean))];
  const profiles = new Map();
  for (let offset = 0; offset < uids.length; offset += 100) {
    const result = await db.collection('users').where('submitterUid', 'in', uids.slice(offset, offset + 100)).get();
    for (const doc of result.docs) {
      const profile = doc.data(), previous = profiles.get(profile.submitterUid);
      if (!previous || doc.id === profile.submitterUid || (previous.id !== profile.submitterUid && String(profile.updatedAt || '') > String(previous.updatedAt || ''))) profiles.set(profile.submitterUid, { ...profile, id: doc.id });
    }
  }
  return members.map(member => {
    const profile = profiles.get(member.uid);
    return { ...member, name: profile?.name || member.name, avatar: profile ? (profile.photoUrl ?? '') : (member.avatar || '') };
  })
    .sort((a, b) => {
      if (String(a.role).toLowerCase() === 'owner') return -1;
      if (String(b.role).toLowerCase() === 'owner') return 1;
      return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
    });
}

async function listActivity(workspaceId, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const snapshot = await adminDb().collection('workspaceActivity')
    .where('workspaceId', '==', workspaceId)
    .orderBy('ts', 'desc')
    .limit(safeLimit)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function inviteMember({ workspaceId, actorUid, invitedEmail, role }) {
  const email = cleanText(invitedEmail, 180).toLowerCase();
  const normalizedRole = normalizeRole(role);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw Object.assign(new Error('A valid invitation email is required.'), { status: 400, code: 'INVALID_INVITE_EMAIL' });
  }
  if (!MANAGEABLE_ROLES.includes(normalizedRole)) {
    throw Object.assign(new Error('Invite role must be Admin, Developer, Analyst, or Viewer.'), { status: 400, code: 'INVALID_INVITE_ROLE' });
  }

  const membership = await getMembershipForManagement(actorUid, workspaceId);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw Object.assign(new Error('Owner or Admin permission required.'), { status: 403, code: 'FORBIDDEN' });
  }

  const existing = await adminDb().collection('workspaceMembers')
    .where('workspaceId', '==', workspaceId)
    .where('email', '==', email)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw Object.assign(new Error('That email is already a workspace member.'), { status: 409, code: 'ALREADY_MEMBER' });
  }

  const workspaceSnap = await adminDb().collection('workspaces').doc(workspaceId).get();
  if (!workspaceSnap.exists) throw Object.assign(new Error('Workspace not found.'), { status: 404, code: 'NOT_FOUND' });
  const workspace = workspaceSnap.data() || {};
  const plan = await getOwnerPlan(workspace.ownerUid);
  const { getSecurityPolicy, isInviteDomainAllowed } = require('./securityPolicies');
  const securityPolicy = await getSecurityPolicy(workspaceId);
  if (!isInviteDomainAllowed(email, securityPolicy)) {
    throw Object.assign(new Error('This workspace only accepts invitations from approved email domains.'), { status: 403, code: 'INVITE_DOMAIN_NOT_ALLOWED' });
  }
  if (plan.teamMemberLimit != null) {
    const memberCount = await adminDb().collection('workspaceMembers').where('workspaceId', '==', workspaceId).get();
    if (memberCount.size >= plan.teamMemberLimit) {
      throw Object.assign(new Error(`Your ${plan.name} plan allows ${plan.teamMemberLimit} team member${plan.teamMemberLimit === 1 ? '' : 's'}. Upgrade your plan to invite another member.`), { status: 402, code: 'TEAM_MEMBER_LIMIT_REACHED' });
    }
  }
  const now = new Date().toISOString();
  const ref = adminDb().collection('workspaceInvites').doc(crypto.randomBytes(12).toString('hex'));
  const pending = await adminDb().collection('workspaceInvites').where('workspaceId', '==', workspaceId).where('invitedEmail', '==', email).where('status', '==', 'pending').limit(1).get();
  if (!pending.empty) throw Object.assign(new Error('A pending invitation already exists for this email. Review Invitations to request its email again.'), { status: 409, code: 'INVITE_ALREADY_PENDING' });
  const inviteBatch = adminDb().batch();
  inviteBatch.set(ref, {
    workspaceId,
    workspaceName: workspace.name || workspaceId,
    invitedBy: membership.member?.email || actorUid,
    invitedByUid: actorUid,
    invitedEmail: email,
    role: normalizedRole,
    status: 'pending',
    createdAt: now,
    ts: Date.now(),
  });
  queueActivity(inviteBatch, workspaceId, actorUid, `Invitation created for ${email} as ${normalizedRole}`, "workspace.invitation_created");
  await inviteBatch.commit();
  return { id: ref.id, workspaceId, invitedEmail: email, role: normalizedRole, status: 'pending', createdAt: now };
}

async function getMembershipForManagement(uid, workspaceId) {
  return getWorkspaceMembership(uid, workspaceId);
}

async function listPendingInvites(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return [];
  const snapshot = await adminDb().collection('workspaceInvites')
    .where('invitedEmail', '==', value)
    .where('status', '==', 'pending')
    .limit(50)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function acceptInvite({ inviteId, uid, email, displayName }) {
  const db = adminDb();
  const inviteRef = db.collection('workspaceInvites').doc(inviteId);
  const invitePreflight = await inviteRef.get();
  if (!invitePreflight.exists) throw Object.assign(new Error('Invitation not found.'), { status: 404, code: 'NOT_FOUND' });
  const preflightInvite = invitePreflight.data() || {};
  const workspacePreflight = await db.collection('workspaces').doc(preflightInvite.workspaceId).get();
  if (!workspacePreflight.exists) throw Object.assign(new Error('Workspace no longer exists.'), { status: 404, code: 'WORKSPACE_NOT_FOUND' });
  const ownerPlan = await getOwnerPlan(workspacePreflight.data()?.ownerUid);
  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw Object.assign(new Error('Invitation not found.'), { status: 404, code: 'NOT_FOUND' });
    const invite = inviteSnap.data() || {};
    if (String(invite.status || '').toLowerCase() !== 'pending') throw Object.assign(new Error('This invitation is no longer pending.'), { status: 409, code: 'INVITE_NOT_PENDING' });
    if (String(invite.invitedEmail || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) throw Object.assign(new Error('This invitation belongs to a different email address.'), { status: 403, code: 'INVITE_EMAIL_MISMATCH' });
    const workspaceRef = db.collection('workspaces').doc(invite.workspaceId);
    const workspaceSnap = await tx.get(workspaceRef);
    if (!workspaceSnap.exists) throw Object.assign(new Error('Workspace no longer exists.'), { status: 404, code: 'WORKSPACE_NOT_FOUND' });
    if (ownerPlan.teamMemberLimit != null && Number(workspaceSnap.data()?.memberCount || 0) >= ownerPlan.teamMemberLimit) {
      throw Object.assign(new Error(`The workspace has reached its ${ownerPlan.name} team-member limit.`), { status: 402, code: 'TEAM_MEMBER_LIMIT_REACHED' });
    }

    const memberRef = db.collection('workspaceMembers').doc(`${invite.workspaceId}_${uid}`);
    const memberSnap = await tx.get(memberRef);
    const now = new Date().toISOString();
    if (!memberSnap.exists) {
      tx.set(memberRef, {
        workspaceId: invite.workspaceId,
        uid,
        email: String(email || '').trim().toLowerCase(),
        name: displayName || email || uid,
        role: normalizeRole(invite.role) || 'viewer',
        joinedAt: now,
        status: 'active',
      });
      tx.set(workspaceRef, { memberCount: Number(workspaceSnap.data()?.memberCount || 0) + 1, updatedAt: now }, { merge: true });
    }
    tx.set(inviteRef, { status: 'accepted', acceptedAt: now, acceptedByUid: uid }, { merge: true });
    queueActivity(tx, invite.workspaceId, uid, `Workspace invitation accepted as ${normalizeRole(invite.role) || "viewer"}`, "workspace.invitation_accepted");
    return { workspaceId: invite.workspaceId, role: normalizeRole(invite.role) || 'viewer' };
  });


  return result;
}

async function changeMemberRole({ workspaceId, memberId, actorUid, role }) {
  const newRole = normalizeRole(role);
  if (!MANAGEABLE_ROLES.includes(newRole)) {
    throw Object.assign(new Error('Members can only be assigned Admin, Developer, Analyst, or Viewer.'), { status: 400, code: 'INVALID_ROLE' });
  }
  const actor = await getMembershipForManagement(actorUid, workspaceId);
  if (!actor || !['owner', 'admin'].includes(actor.role)) throw Object.assign(new Error('Owner or Admin permission required.'), { status: 403, code: 'FORBIDDEN' });
  const ref = adminDb().collection('workspaceMembers').doc(memberId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.workspaceId !== workspaceId) throw Object.assign(new Error('Member not found.'), { status: 404, code: 'NOT_FOUND' });
  const member = snap.data() || {};
  if (normalizeRole(member.role) === 'owner' || member.uid === actor.workspace.ownerUid) throw Object.assign(new Error('The workspace owner role cannot be changed.'), { status: 400, code: 'OWNER_IMMUTABLE' });
  await adminDb().runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data()?.workspaceId !== workspaceId || fresh.data()?.role === 'owner' || fresh.data()?.uid === actor.workspace.ownerUid) throw Object.assign(new Error('Refresh this member before changing its role.'), {status:409});
    tx.set(ref, {role:newRole,updatedAt:new Date().toISOString()}, {merge:true});
    queueActivity(tx,workspaceId,actorUid,`Member ${member.email || member.uid} role changed to ${newRole}`,'workspace.member_role_changed');
  });
  return { id: memberId, role: newRole };
}

async function removeMember({ workspaceId, memberId, actorUid }) {
  const actor = await getMembershipForManagement(actorUid, workspaceId);
  if (!actor || !['owner', 'admin'].includes(actor.role)) throw Object.assign(new Error('Owner or Admin permission required.'), { status: 403, code: 'FORBIDDEN' });
  const ref = adminDb().collection('workspaceMembers').doc(memberId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.workspaceId !== workspaceId) throw Object.assign(new Error('Member not found.'), { status: 404, code: 'NOT_FOUND' });
  const member = snap.data() || {};
  if (String(member.role || '').toLowerCase() === 'owner' || member.uid === actor.workspace?.ownerUid) {
    throw Object.assign(new Error('The workspace owner cannot be removed.'), { status: 400, code: 'OWNER_IMMUTABLE' });
  }
  await adminDb().runTransaction(async tx => {
    const fresh = await tx.get(ref);
    const workspaceRef = adminDb().collection('workspaces').doc(workspaceId);
    const workspace = await tx.get(workspaceRef);
    if (!workspace.exists || !fresh.exists || fresh.data()?.workspaceId !== workspaceId || fresh.data()?.role === 'owner' || fresh.data()?.uid === workspace.data()?.ownerUid) throw Object.assign(new Error('Refresh this member before removal.'), {status:409});
    tx.delete(ref);
    tx.set(workspaceRef,{memberCount:Math.max(1,Number(workspace.data()?.memberCount || 1)-1),updatedAt:new Date().toISOString()},{merge:true});
    queueActivity(tx,workspaceId,actorUid,`${member.email || member.uid} was removed from the workspace`,'workspace.member_removed');
  });
  return { id: memberId, removed: true };
}

function queueActivity(writer,workspaceId,actorUid,message,action) {
 writer.set(adminDb().collection('workspaceActivity').doc(), {workspaceId,message,actor:actorUid || 'system',actorUid:actorUid || null,action,ts:Date.now(),createdAt:new Date().toISOString()});
}
async function deleteFlatDocs(collectionName, workspaceId) {
  const db = adminDb();
  while (true) {
    const snap = await db.collection(collectionName).where('workspaceId', '==', workspaceId).limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function deleteWorkspace({ workspaceId, actorUid }) {
  const membership = await getMembershipForManagement(actorUid, workspaceId);
  if (!membership || membership.role !== 'owner') throw Object.assign(new Error('Only the workspace owner can delete the workspace.'), { status: 403, code: 'OWNER_REQUIRED' });
  const workspaceRef = adminDb().collection('workspaces').doc(workspaceId);
  const workspaceSnap = await workspaceRef.get();
  if (!workspaceSnap.exists) throw Object.assign(new Error('Workspace not found.'), { status: 404, code: 'NOT_FOUND' });

  await adminDb().collection('workspaceDeletionAudit').doc().set({
    workspaceId,
    ownerUid: actorUid,
    workspaceName: workspaceSnap.data()?.name || workspaceId,
    createdAt: new Date().toISOString(),
  });

  await Promise.all([
    deleteFlatDocs('workspaceMembers', workspaceId),
    deleteFlatDocs('workspaceInvites', workspaceId),
    deleteFlatDocs('workspaceActivity', workspaceId),
  ]);

  const recursiveDelete = adminDb().recursiveDelete;
  if (typeof recursiveDelete === 'function') {
    await recursiveDelete.call(adminDb(), workspaceRef);
  } else {
    // Fallback for SDK versions without recursiveDelete: remove known nested collections.
    const nestedCollections = ['apiKeys', 'verificationRequests', 'customerUsers', 'usage', 'webhookEvents', 'apiLogs', 'analyticsDaily', 'reportRuns', 'reportSchedules', 'automationWorkflows', 'automationJobs', 'securityEvents'];
    for (const name of nestedCollections) {
      const snap = await workspaceRef.collection(name).limit(400).get();
      if (!snap.empty) {
        const batch = adminDb().batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
    const webhooks = await workspaceRef.collection('webhooks').get();
    for (const webhook of webhooks.docs) {
      const deliveries = await webhook.ref.collection('deliveries').get();
      const batch = adminDb().batch();
      deliveries.docs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(webhook.ref);
      await batch.commit();
    }
    await workspaceRef.delete();
  }
  return { workspaceId, deleted: true };
}

module.exports = {
  WORKSPACE_ROLES,
  MANAGEABLE_ROLES,
  listUserWorkspaces,
  createWorkspace,
  listMembers,
  listActivity,
  inviteMember,
  listPendingInvites,
  acceptInvite,
  changeMemberRole,
  removeMember,
  deleteWorkspace,
  getMembershipForManagement,
};
