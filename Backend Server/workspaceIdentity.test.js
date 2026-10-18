const test = require('node:test'), assert = require('node:assert/strict');
const { listMembers } = require('./workspaceAdmin');
test('workspace members use current profile names and photos without exposing other profile fields', async () => {
  const member = { uid: 'one', name: 'one@example.test', email: 'one@example.test', role: 'owner', avatar: 'old.png' };
  const profile = { submitterUid: 'one', name: 'Current name', photoUrl: 'current.png', phone: '+123456789', bio: 'Private biography' };
  const db = { collection: name => ({ where: (field, operator, value) => ({ get: async () => {
    if (name === 'workspaceMembers') { assert.equal(field, 'workspaceId'); assert.equal(value, 'team'); return { docs: [{ id: 'member', data: () => member }] }; }
    assert.equal(name, 'users'); assert.equal(field, 'submitterUid'); assert.equal(operator, 'in'); assert.deepEqual(value, ['one']);
    return { docs: [{ id: 'one', data: () => profile }] };
  } }) }) };
  const [result] = await listMembers('team', db);
  assert.equal(result.name, 'Current name'); assert.equal(result.avatar, 'current.png'); assert.equal(result.email, member.email); assert.equal(result.phone, undefined); assert.equal(result.bio, undefined);
  profile.photoUrl = ''; const [cleared] = await listMembers('team', db); assert.equal(cleared.avatar, '');
});
