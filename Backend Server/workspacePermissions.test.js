const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WORKSPACE_ROLE_PERMISSIONS, workspaceRoleHasPermission, normalizeWorkspaceRole } = require('./workspacePermissions');
const { createApiKey, normalizeEnvironment } = require('./apiKeys');

test('role normalization fails closed and preserves all five roles', () => {
  assert.equal(normalizeWorkspaceRole(' Owner '), 'owner');
  assert.equal(normalizeWorkspaceRole('Moderator'), null);
  assert.equal(normalizeWorkspaceRole(undefined), null);
  for (const role of ['owner', 'admin', 'developer', 'analyst', 'viewer']) {
    assert.equal(workspaceRoleHasPermission(role, 'api_keys.create'), ['owner', 'admin', 'developer'].includes(role));
    assert.equal(workspaceRoleHasPermission(role, 'workspace.delete'), role === 'owner');
    assert.equal(workspaceRoleHasPermission(role, 'billing.manage'), role === 'owner');
  }
});
test('frontend and backend permission tables agree', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/workspacePermissions.js'), 'utf8');
  const json = source.split('export const ROLE_PERMISSIONS = Object.freeze(')[1].split(');')[0];
  assert.deepEqual(JSON.parse(json), WORKSPACE_ROLE_PERMISSIONS);
});
test('API keys are unique, environment-scoped and stored as hashes', () => {
  const keys = Array.from({ length: 100 }, () => createApiKey('test'));
  assert.equal(new Set(keys.map((key) => key.key)).size, 100);
  assert(keys.every((key) => /^nx_test_[A-Za-z0-9_-]{43}$/.test(key.key) && /^[a-f0-9]{64}$/.test(key.keyHash)));
  assert.equal(normalizeEnvironment(' LIVE '), 'live');
  assert.equal(normalizeEnvironment('production'), null);
  assert.throws(() => createApiKey('invalid'));
});
