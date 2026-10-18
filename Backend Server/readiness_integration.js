// Uses an isolated temporary workspace. Never sends email, SMS, or webhooks.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { adminDb, supabaseAdmin } = require('./supabaseAdmin');
const { FieldValue } = require('./supabaseDocumentStore');
const { getWorkspaceMembership, requireWorkspaceRole, requireWorkspacePermission } = require('./auth');
const { createWorkspaceApiKey, revokeWorkspaceApiKey, resolveApiKey, listWorkspaceApiKeys } = require('./apiKeys');
const { createVerification, completeVerification, getVerification } = require('./verification');

async function main() {
  const { data: owners, error } = await supabaseAdmin.from('nexus_workspaces').select('owner_id').limit(1);
  if (error) throw error;
  assert(owners?.length, 'An existing workspace owner is needed for this isolated test.');
  const uid = owners[0].owner_id;
  const id = `readiness_${crypto.randomUUID()}`;
  const db = adminDb();
  const workspace = db.collection('workspaces').doc(id);
  const member = db.collection('workspaceMembers').doc(id);
  const counter = workspace.collection('readinessChecks').doc('counter');
  try {
    const batch = db.batch();
    batch.set(workspace, { name: 'Temporary readiness test', ownerUid: uid, memberCount: 1 });
    batch.set(member, { workspaceId: id, uid, role: 'owner' });
    await batch.commit();
    for (const role of ['owner', 'admin', 'developer', 'analyst', 'viewer']) {
      await member.set({ role }, { merge: true });
      assert.equal((await getWorkspaceMembership(uid, id)).role, role);
      if (['analyst', 'viewer'].includes(role)) {
        await assert.rejects(createWorkspaceApiKey({ workspaceId: id, uid, name: 'Denied test', environment: 'test' }), { status: 403 });
      } else {
        const key = await createWorkspaceApiKey({ workspaceId: id, uid, name: 'Readiness test', environment: 'test' });
        const resolved = await resolveApiKey(key.apiKey);
        assert.equal(resolved.workspaceId, id);
        assert.equal(typeof resolved.ref.set, 'function');
        const listed = await listWorkspaceApiKeys(id);
        assert(listed.every((row) => !row.keyHash && !row.apiKey));
        await revokeWorkspaceApiKey({ workspaceId: id, uid, keyId: key.id });
        assert.equal(await resolveApiKey(key.apiKey), null);
      }
      console.log(`PASS: ${role} API-key authorization and normalized membership`);
    }
    for (const guard of [requireWorkspaceRole(['owner','admin','developer']), requireWorkspacePermission('api_keys.create')]) {
      let status;
      let next = false;
      await guard({ params: { workspaceId: id }, auth: { uid: '00000000-0000-0000-0000-000000000000', globalRole: 'admin' } },
        { status(code) { status = code; return this; }, json() {} }, () => { next = true; });
      assert.equal(status, 403); assert.equal(next, false);
    }
    console.log('PASS: platform admin cannot bypass workspace membership');
    await counter.set({ count: 0 });
    await Promise.all(Array.from({ length: 12 }, () => counter.set({ count: FieldValue.increment(1) }, { merge: true })));
    assert.equal((await counter.get()).data().count, 12);
    const claim = () => db.runTransaction(async (tx) => {
      const snapshot = await tx.get(counter);
      if (snapshot.data().claimed) return false;
      tx.set(counter, { claimed: true }, { merge: true });
      return true;
    });
    assert.equal((await Promise.all([claim(), claim(), claim()])).filter(Boolean).length, 1);
    console.log('PASS: atomic concurrent increments and single transaction claimant');
    const broken = db.batch();
    broken.set(counter, { shouldRollBack: true }, { merge: true });
    broken.update(workspace.collection('readinessChecks').doc('missing'), { invalid: true });
    await assert.rejects(broken.commit());
    assert.equal((await counter.get()).data().shouldRollBack, undefined);
    console.log('PASS: failed batch rolls back every write');
    const verification = await createVerification({ workspaceId: id, workspace: { ownerUid: uid }, environment: 'test', method: 'email', email: 'readiness@example.com' });
    await assert.rejects(completeVerification({ workspaceId: id, id: verification.id, code: '000000', environment: 'test' }), { code: 'INVALID_CODE' });
    assert.equal((await getVerification(id, verification.id)).attempts, 1);
    await assert.rejects(completeVerification({ workspaceId: id, id: verification.id, code: '123456', environment: 'live' }), { code: 'ENVIRONMENT_MISMATCH' });
    const verified = await completeVerification({ workspaceId: id, id: verification.id, code: '123456', environment: 'test' });
    assert.equal(verified.status, 'verified');
    assert.equal(verified.codeHash, undefined);
    console.log('PASS: test verification, persisted failed attempts, and test/live isolation');
    const query = await workspace.collection('readinessChecks').get();
    assert.equal(query.size, 1); assert.equal(query.docs[0].ref.path, counter.path);
    await member.delete();
    const removed = await supabaseAdmin.from('nexus_workspace_members').select('user_id').eq('workspace_id', id);
    if (removed.error) throw removed.error;
    assert.equal(removed.data.length, 0);
    console.log('PASS: member deletion removes normalized authorization record');
  } finally {
    await member.delete();
    await db.recursiveDelete(workspace);
    const removed = await supabaseAdmin.from('nexus_workspaces').select('id').eq('id', id);
    if (removed.error) throw removed.error;
    assert.equal(removed.data.length, 0);
    console.log('PASS: temporary workspace and records cleaned up');
  }
}
main().catch((error) => { console.error('READINESS_INTEGRATION: FAIL', error.message); process.exitCode = 1; });
