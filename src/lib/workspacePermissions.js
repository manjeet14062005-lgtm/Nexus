export const PERMISSION_LABELS = Object.freeze({
  "workspace.read": "View workspace", "workspace.update": "Manage workspace settings", "workspace.delete": "Delete workspace", "workspace.export": "Export workspace data",
  "members.read": "View members", "members.invite": "Invite members", "members.update": "Change member roles", "members.remove": "Remove members",
  "billing.read": "View billing", "billing.manage": "Manage billing", "api_keys.read": "View API key metadata", "api_keys.create": "Create API keys", "api_keys.revoke": "Revoke API keys", "api_keys.rotate": "Rotate API keys",
  "webhooks.read": "View webhooks", "webhooks.manage": "Manage webhooks", "logs.read": "View technical logs", "analytics.read": "View analytics", "reports.read": "View reports", "reports.export": "Export reports/data", "reports.schedule": "Schedule reports",
  "workflows.read": "View workflows", "workflows.manage": "Manage workflows", "integrations.read": "View integrations", "integrations.manage": "Manage integrations", "intelligence.use": "Use Nexus Intelligence",
  "verification.read": "View verification activity", "usage.read": "View usage", "security.read": "View security settings", "security.manage": "Manage security policies", "audit.read": "View audit logs", "audit.export": "Export audit logs", "activity.read": "View workspace activity", "branding.manage": "Manage workspace branding",
});

export const WORKSPACE_ROLES = Object.freeze(["owner", "admin", "developer", "analyst", "viewer"]);

export const ROLE_LABELS = Object.freeze({
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  analyst: "Analyst",
  viewer: "Viewer",
});

export const ROLE_PERMISSIONS = Object.freeze({
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

const PERMISSION_SETS = Object.freeze(Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [role, new Set(permissions)])));

export function normalizeWorkspaceRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return WORKSPACE_ROLES.includes(value) ? value : null;
}

export function hasWorkspacePermission(role, permission) {
  const normalized = normalizeWorkspaceRole(role);
  return Boolean(normalized && PERMISSION_SETS[normalized]?.has(String(permission || "").trim()));
}

export function hasAnyWorkspacePermission(role, permissions = []) {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return list.some((permission) => hasWorkspacePermission(role, permission));
}

export function labelWorkspaceRole(role) {
  return ROLE_LABELS[normalizeWorkspaceRole(role)] || "Viewer";
}

export function workspacePermissions(role) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized ? [...ROLE_PERMISSIONS[normalized]] : [];
}

export function permissionLabel(permission) {
  return PERMISSION_LABELS[permission] || permission;
}
