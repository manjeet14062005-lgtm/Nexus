const WORKSPACE_ROLES = Object.freeze(['owner', 'admin', 'developer', 'analyst', 'viewer']);

const ROLE_LABELS = Object.freeze({
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  analyst: 'Analyst',
  viewer: 'Viewer',
});

const WORKSPACE_ROLE_PERMISSIONS = Object.freeze({
  "owner": [
    "workspace.read",
    "workspace.update",
    "workspace.delete",
    "workspace.export",
    "members.read",
    "members.invite",
    "members.update",
    "members.remove",
    "billing.read",
    "billing.manage",
    "api_keys.read",
    "api_keys.create",
    "api_keys.revoke",
    "api_keys.rotate",
    "webhooks.read",
    "webhooks.manage",
    "logs.read",
    "analytics.read",
    "reports.read",
    "reports.export",
    "reports.schedule",
    "workflows.read",
    "workflows.manage",
    "integrations.read",
    "integrations.manage",
    "intelligence.use",
    "verification.read",
    "usage.read",
    "security.read",
    "security.manage",
    "audit.read",
    "audit.export",
    "activity.read",
    "branding.manage"
  ],
  "admin": [
    "workspace.read",
    "workspace.update",
    "workspace.export",
    "members.read",
    "members.invite",
    "members.update",
    "members.remove",
    "billing.read",
    "api_keys.read",
    "api_keys.create",
    "api_keys.revoke",
    "api_keys.rotate",
    "webhooks.read",
    "webhooks.manage",
    "logs.read",
    "analytics.read",
    "reports.read",
    "reports.export",
    "reports.schedule",
    "workflows.read",
    "workflows.manage",
    "integrations.read",
    "integrations.manage",
    "intelligence.use",
    "verification.read",
    "usage.read",
    "security.read",
    "security.manage",
    "audit.read",
    "audit.export",
    "activity.read",
    "branding.manage"
  ],
  "developer": [
    "workspace.read",
    "api_keys.read",
    "api_keys.create",
    "api_keys.revoke",
    "api_keys.rotate",
    "webhooks.read",
    "webhooks.manage",
    "logs.read",
    "analytics.read",
    "reports.read",
    "verification.read",
    "usage.read",
    "security.read",
    "activity.read",
    "reports.export",
    "integrations.read",
    "integrations.manage",
    "workflows.read",
    "workflows.manage"
  ],
  "analyst": [
    "workspace.read",
    "members.read",
    "billing.read",
    "logs.read",
    "analytics.read",
    "reports.read",
    "reports.export",
    "reports.schedule",
    "verification.read",
    "usage.read",
    "security.read",
    "audit.read",
    "audit.export",
    "activity.read",
    "webhooks.read",
    "workflows.read"
  ],
  "viewer": [
    "workspace.read",
    "members.read",
    "logs.read",
    "analytics.read",
    "reports.read",
    "verification.read",
    "usage.read",
    "security.read",
    "activity.read"
  ]
});

const PERMISSIONS_BY_ROLE = Object.freeze(
  Object.fromEntries(Object.entries(WORKSPACE_ROLE_PERMISSIONS).map(([role, permissions]) => [role, new Set(permissions)])),
);

function normalizeWorkspaceRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return WORKSPACE_ROLES.includes(value) ? value : null;
}

function workspaceRoleHasPermission(role, permission) {
  const normalized = normalizeWorkspaceRole(role);
  return Boolean(normalized && PERMISSIONS_BY_ROLE[normalized]?.has(String(permission || '').trim()));
}

function workspaceRoleHasAnyPermission(role, permissions = []) {
  return (Array.isArray(permissions) ? permissions : [permissions]).some((permission) => workspaceRoleHasPermission(role, permission));
}

function permissionsForWorkspaceRole(role) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized ? [...WORKSPACE_ROLE_PERMISSIONS[normalized]] : [];
}

module.exports = {
  WORKSPACE_ROLES,
  ROLE_LABELS,
  WORKSPACE_ROLE_PERMISSIONS,
  normalizeWorkspaceRole,
  permissionsForWorkspaceRole,
  workspaceRoleHasPermission,
  workspaceRoleHasAnyPermission,
};
