const { adminAuth, adminDb, supabaseAdmin } = require("./supabaseAdmin");
const { MemoryRateLimiter } = require("./rateLimiter");
const {
  WORKSPACE_ROLES,
  ROLE_LABELS,
  WORKSPACE_ROLE_PERMISSIONS,
  normalizeWorkspaceRole,
  permissionsForWorkspaceRole,
  workspaceRoleHasPermission,
  workspaceRoleHasAnyPermission,
} = require("./workspacePermissions");

function bootstrapAdminUids() {
  return String(process.env.NEXUS_BOOTSTRAP_ADMIN_UIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isBootstrapAdmin(uid) {
  return bootstrapAdminUids().includes(uid);
}

// Backward-compatible export name used by older server modules.
const normalizeRole = normalizeWorkspaceRole;

async function getGlobalRole(uid, decodedToken = {}) {
  if (isBootstrapAdmin(uid)) {
    return "admin";
  }

  try {
    const { data, error } = await supabaseAdmin.from('nexus_user_roles').select('role').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    const platformRole = String(data?.role || "user").trim().toLowerCase();
    if (["admin", "moderator", "user"].includes(platformRole)) return platformRole;
  } catch (error) {
    console.warn("Role lookup failed:", error.message);
  }

  return "user";
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    // Both checks stay fresh on every request, but need not wait for each other.
    const [{ data: access, error: accessError }, globalRole] = await Promise.all([
      supabaseAdmin.from('nexus_account_controls').select('status').eq('user_id', decoded.uid).maybeSingle(),
      getGlobalRole(decoded.uid, decoded),
    ]);
    // Keep the existing installation usable while the reviewed migration is pending.
    // Administrative mutations remain unavailable until its RPC is installed.
    if (accessError && (process.env.NODE_ENV === 'production' || !['42P01','PGRST205'].includes(accessError.code))) {
      return res.status(503).json({ success: false, message: 'Account access checks are temporarily unavailable.' });
    }
    if (access && access.status !== 'active') {
      return res.status(403).json({ success: false, code: 'ACCOUNT_SUSPENDED', message: 'Account access is restricted. Contact Nexus support.' });
    }
    req.auth = {
      uid: decoded.uid,
      email: decoded.email || null,
      token: decoded,
      globalRole,
    };
    return next();
  } catch (error) {
    console.warn("Authentication failed:", error.code || error.message);
    if (String(error.message || "").includes("Supabase is not configured")) {
      return res.status(503).json({ success: false, message: "Authentication service is not configured." });
    }
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
  }
}

const apiKeyAttemptLimiter = new MemoryRateLimiter({ maxEntries: 50_000 });

function apiKeyAttemptLimited(key) {
  return apiKeyAttemptLimiter.consume(`apikey:${key}`, { limit: 20, windowMs: 60_000 }).limited;
}

async function authenticateApiKey(req, res, next) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({ success: false, message: "API key required." });
  }
  const abuseKey = `${req.ip || req.socket.remoteAddress || "unknown"}:${match[1].slice(0, 16)}`;
  if (apiKeyAttemptLimited(abuseKey)) {
    return res.status(429).json({ success: false, message: "Too many API authentication attempts. Try again later." });
  }

  try {
    const { resolveApiKey, touchApiKeyUsage } = require("./apiKeys");
    const { registerApiRequestLog } = require("./requestLogs");
    const key = await resolveApiKey(match[1]);
    if (!key) return res.status(401).json({ success: false, message: "Invalid or revoked API key." });

    req.apiKey = key;
    req.apiAuth = {
      workspaceId: key.workspaceId,
      environment: key.environment,
      permissions: Array.isArray(key.permissions) ? key.permissions : [],
      keyId: key.id,
    };
    touchApiKeyUsage(key);
    registerApiRequestLog(req, res);
    return next();
  } catch (error) {
    console.error("API key authentication failed:", error.message);
    return res.status(500).json({ success: false, message: "API authentication failed." });
  }
}

function requireApiPermission(permission) {
  return (req, res, next) => {
    if (!req.apiAuth) return res.status(401).json({ success: false, message: "API authentication required." });
    if (req.apiAuth.permissions.includes(permission)) return next();
    return res.status(403).json({ success: false, message: `Missing API permission: ${permission}.` });
  };
}

function requireAdmin(req, res, next) {
  if (req.auth?.globalRole === "admin") return next();
  return res.status(403).json({ success: false, message: "Administrator access required." });
}

function requireRecentAuth(maxAgeSeconds = Math.max(60, Number(process.env.NEXUS_RECENT_AUTH_MAX_AGE_SECONDS) || 10 * 60)) {
  return (req, res, next) => {
    const authTime = Number(req.auth?.token?.auth_time || 0);
    const age = authTime ? (Date.now() / 1000) - authTime : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(age) || age > maxAgeSeconds) {
      return res.status(401).json({
        success: false,
        code: "RECENT_AUTH_REQUIRED",
        message: "Re-authenticate and try again.",
      });
    }
    return next();
  };
}

async function getWorkspaceMembership(uid, workspaceId) {
  if (!uid || !workspaceId) return null;

  // Authorization source of truth: normalized workspace membership rows.
  // The compatibility document store remains a fallback for older records,
  // but it is never preferred when a normalized membership exists.
  const [workspaceResult, workspaceSnap, memberResult] = await Promise.all([
    supabaseAdmin.from("nexus_workspaces")
      .select("id, owner_id, name, member_count, created_at, updated_at")
      .eq("id", String(workspaceId)).maybeSingle(),
    adminDb().collection("workspaces").doc(workspaceId).get(),
    supabaseAdmin.from("nexus_workspace_members")
      .select("workspace_id, user_id, role, created_at, updated_at")
      .eq("workspace_id", String(workspaceId)).eq("user_id", uid).maybeSingle(),
  ]);
  const { data: workspaceRow, error: workspaceError } = workspaceResult;
  const { data: memberRow, error: memberError } = memberResult;
  if (workspaceError) throw workspaceError;
  if (memberError) throw memberError;
  if (!workspaceRow && !workspaceSnap.exists) return null;

  const workspaceDoc = workspaceSnap.exists ? workspaceSnap.data() || {} : {};
  const workspace = {
    ...workspaceDoc,
    id: String(workspaceId),
    name: workspaceDoc.name || workspaceRow?.name || "Workspace",
    ownerUid: workspaceRow ? workspaceRow.owner_id : workspaceDoc.ownerUid || null,
    memberCount: Number(workspaceDoc.memberCount ?? workspaceRow?.member_count ?? 0),
  };

  if (memberRow) {
    const role = normalizeWorkspaceRole(memberRow.role);
    if (!role) return null;
    return {
      workspaceId: String(workspaceId),
      uid,
      role,
      owner: role === "owner" || workspace.ownerUid === uid,
      workspace,
      member: {
        id: `${workspaceId}_${uid}`,
        uid,
        workspaceId: String(workspaceId),
        role,
        status: "active",
        createdAt: memberRow.created_at || null,
        updatedAt: memberRow.updated_at || null,
      },
    };
  }

  if (workspace.ownerUid === uid) {
    return { workspaceId: String(workspaceId), uid, role: "owner", owner: true, workspace };
  }

  // Compatibility fallback for pre-normalization records. If a normalized
  // workspace exists but has no membership row, do not invent a role from
  // the document store; only an explicit legacy membership can grant access.
  if (!workspaceRow) {
    const snapshot = await adminDb().collection("workspaceMembers")
      .where("workspaceId", "==", workspaceId)
      .where("uid", "==", uid)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const member = snapshot.docs[0].data() || {};
      const role = normalizeWorkspaceRole(member.role);
      if (!role) return null;
      return {
        workspaceId: String(workspaceId),
        uid,
        role,
        owner: role === "owner",
        workspace,
        member: { id: snapshot.docs[0].id, ...member },
      };
    }
  }

  return null;
}

function requireWorkspacePermission(permission) {
  const requiredPermission = String(permission || "").trim();
  return async (req, res, next) => {
    const workspaceId = req.params.workspaceId || req.body?.workspaceId || req.query?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, message: "workspaceId is required." });
    }

    try {
      const membership = await getWorkspaceMembership(req.auth.uid, workspaceId);
      if (membership) {
        if (!workspaceRoleHasPermission(membership.role, requiredPermission)) {
          return res.status(403).json({
            success: false,
            code: "WORKSPACE_PERMISSION_DENIED",
            message: "Insufficient workspace permissions.",
          });
        }
        req.workspace = membership;
        return next();
      }

      return res.status(403).json({ success: false, code: "WORKSPACE_ACCESS_DENIED", message: "Workspace access denied." });
    } catch (error) {
      console.error("Workspace permission lookup failed:", error.message);
      return res.status(500).json({ success: false, message: "Workspace authorization failed." });
    }
  };
}

function requireWorkspaceRole(allowedRoles = []) {
  const normalized = new Set((Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map(normalizeWorkspaceRole)
    .filter(Boolean));
  return async (req, res, next) => {
    const workspaceId = req.params.workspaceId || req.body?.workspaceId || req.query?.workspaceId;
    if (!workspaceId) return res.status(400).json({ success: false, message: "workspaceId is required." });
    try {
      const membership = await getWorkspaceMembership(req.auth.uid, workspaceId);
      if (membership) {
        if (normalized.size && !normalized.has(membership.role)) return res.status(403).json({ success: false, message: "Insufficient workspace permissions." });
        req.workspace = membership;
        return next();
      }
      return res.status(403).json({ success: false, message: "Workspace access denied." });
    } catch (error) {
      console.error("Workspace authorization failed:", error.message);
      return res.status(500).json({ success: false, message: "Workspace authorization failed." });
    }
  };
}

async function bootstrapAdmins() {
  const uids = bootstrapAdminUids();
  if (!uids.length) return;

  const db = adminDb();
  const auth = adminAuth();

  for (const uid of uids) {
    try {
      const record = await auth.getUser(uid);
      await auth.setCustomUserClaims(uid, { ...(record.customClaims || {}), admin: true, role: "admin" });
      await db.collection("roles").doc(uid).set({
        role: "admin",
        source: "server-bootstrap",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      console.log(`✅ Bootstrap admin synchronized: ${uid}`);
    } catch (error) {
      console.warn(`⚠️ Could not bootstrap admin ${uid}: ${error.message}`);
    }
  }
}

module.exports = {
  authenticate,
  authenticateApiKey,
  requireApiPermission,
  requireAdmin,
  requireRecentAuth,
  requireWorkspaceRole,
  getWorkspaceMembership,
  getGlobalRole,
  bootstrapAdmins,
  normalizeRole,
  WORKSPACE_ROLES,
  ROLE_LABELS,
  WORKSPACE_ROLE_PERMISSIONS,
  permissionsForWorkspaceRole,
  roleHasPermission: workspaceRoleHasPermission,
  workspaceRoleHasPermission,
  workspaceRoleHasAnyPermission,
  requireWorkspacePermission,
};
