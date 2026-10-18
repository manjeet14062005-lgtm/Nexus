// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Nexus — SaaS foundation backend                                     ║
// ║ Phase 1: authentication, authorization, secure billing, CORS,      ║
// ║ webhook idempotency and centralized plan configuration              ║
// ╚══════════════════════════════════════════════════════════════════════╝

require("dotenv").config();

const { issuePhoneProof } = require("./signupProof");
const { beforeUserCreated } = require("./signupHook");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const twilio = require("twilio");
const Razorpay = require("razorpay");
const { adminDb, ensureSupabaseAdmin } = require("./supabaseAdmin");
const {
  authenticate,
  requireWorkspaceRole,
  requireWorkspacePermission,
  getWorkspaceMembership,
  getGlobalRole,
  bootstrapAdmins,
  authenticateApiKey,
  requireApiPermission,
  requireAdmin,
  requireRecentAuth,
} = require("./auth");
const { PLANS, getPlan, getPlanAmount, publicPlans } = require("./plans");
const { createBillingReconciler } = require("./billingReconciliation");
const { readVerificationHistory, historyCsv } = require("./verificationHistory");
const { installAdminRoutes } = require("./adminOperations");
const {
  listWorkspaceApiKeys,
  createWorkspaceApiKey,
  revokeWorkspaceApiKey,
} = require("./apiKeys");
const {
  createVerification,
  completeVerification,
  getVerification,
  listVerificationRequests,
  getUsage,
} = require("./verification");
const {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  queueWebhookEvent,
  queueWebhookEventForOwner,
  listWebhookDeliveries,
  retryWebhookDelivery,
  listSupportedEvents,
  startWebhookWorker,
} = require("./webhooks");
const { getWorkspacePlan, requireWorkspaceFeature } = require("./entitlements");
const { getBillingPreferences, updateBillingPreferences, DEFAULT_PREFERENCES } = require("./billingPreferences");
const { summarizeVerificationUsage } = require("./billingUsage");
const { getWorkspaceBranding, updateWorkspaceBranding } = require("./workspaceBranding");
const { createRateLimiter } = require("./rateLimiter");
const { startRetentionWorker } = require("./retention");
const { checkReadiness, collectConfigStatus } = require("./readiness");
const { listApiLogs } = require("./requestLogs");
const { getWorkspaceAnalytics, buildVerificationCsv, parseRange } = require("./analytics");
const { listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, startAutomationWorker } = require("./automation");
const { listReportSchedules, createReportSchedule, updateReportSchedule, deleteReportSchedule, runReportScheduleNow, startReportScheduler } = require("./reportScheduler");
const { answerWorkspaceQuestion, getAiUsage } = require("./intelligence");
const { sendResendEmail } = require("./automation");
const { getSecurityPolicy, updateSecurityPolicy, RETENTION_OPTIONS } = require("./securityPolicies");
const { listAuditEvents, buildAuditCsv } = require("./auditLog");
const {
  createSupportTicket, listCustomerTickets, listAdminTickets, getTicket, assertTicketAccess,
  addTicketMessage, updateAdminTicket, closeCustomerTicket,
} = require("./support");
const {
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
} = require("./workspaceAdmin");

const app = express();
const { createWorkspaceManagement } = require("./workspaceManagement");
const workspaceManagement = createWorkspaceManagement({ db: adminDb, membership: getWorkspaceMembership, sendEmail: sendResendEmail,
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), frontendUrl: () => process.env.FRONTEND_URL });
const PORT = process.env.PORT || 3001;
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Raw body for Razorpay signature verification MUST come before express.json().
app.use("/razorpay/webhook", express.raw({ type: "application/json", limit: "256kb" }));
app.post("/auth/before-user-created", express.raw({ type: "application/json", limit: "32kb" }), beforeUserCreated);
app.use(express.json({ limit: "32kb", strict: true }));

const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const defaultOrigins = isProduction ? [] : ["http://localhost:3000", "https://localhost:3000"];
const configuredOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

const corsOptions = {
  origin(origin, callback) {
    // Same-origin/server-to-server requests have no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Client-Version"],
};
app.use(cors(corsOptions));

// Baseline security headers. CSP is intentionally omitted here because the
// React application currently loads external assets/scripts; add a CSP after
// the asset policy is finalized rather than shipping a broken one.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (isProduction && (req.secure || req.get("x-forwarded-proto") === "https")) {
    const maxAge = Math.max(300, Number(process.env.NEXUS_HSTS_MAX_AGE_SECONDS) || 31_536_000);
    res.setHeader("Strict-Transport-Security", `max-age=${maxAge}; includeSubDomains`);
  }
  next();
});

const HTTP_REQUEST_TIMEOUT_MS = Math.min(Math.max(Number(process.env.NEXUS_HTTP_REQUEST_TIMEOUT_MS) || 30_000, 5_000), 120_000);
app.use((req, res, next) => {
  res.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
  next();
});

// Request ID ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const supplied = String(req.headers["x-request-id"] || "").trim();
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : `req_${crypto.randomBytes(12).toString("hex")}`;
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
});

// ── Twilio ────────────────────────────────────────────────────────────
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;

function getTwilioClient() {
  if (!accountSid || !authToken || !serviceSid) {
    throw new Error("Nexus phone verification is not configured.");
  }
  return twilio(accountSid, authToken);
}

const phoneRateLimiter = createRateLimiter({ purpose: "phone" });
async function isRateLimited(phone) {
  try {
    return (await phoneRateLimiter.consume(`phone:${phone}`, { limit: 3, windowMs: 60_000 })).limited;
  } catch (error) {
    const failure = new Error('Rate limiting service is temporarily unavailable.');
    failure.status = 503;
    failure.code = 'RATE_LIMITER_UNAVAILABLE';
    failure.cause = error;
    throw failure;
  }
}

function toE164(phone) {
  const value = String(phone || "").replace(/[\s\-\(\)]/g, "");
  if (/^\+[1-9]\d{6,14}$/.test(value)) return value;
  if (/^91\d{10}$/.test(value)) return `+${value}`;
  if (/^\d{10}$/.test(value)) return `+91${value}`;
  if (/^0\d{10}$/.test(value)) return `+91${value.slice(1)}`;
  return null;
}

function maskPhone(e164) {
  if (!e164 || e164.length < 7) return "****";
  return e164.slice(0, 3) + "*".repeat(Math.max(1, e164.length - 7)) + e164.slice(-4);
}

// Bounded in-memory abuse protection for the current single-instance deployment.
// Replace with a shared limiter (e.g. Redis) before horizontal scaling.
const endpointRateLimiter = createRateLimiter({ purpose: "endpoint" });
async function endpointRateLimit(key, max, windowMs) {
  try {
    return (await endpointRateLimiter.consume(key, { limit: max, windowMs })).limited;
  } catch (error) {
    const failure = new Error('Rate limiting service is temporarily unavailable.');
    failure.status = 503;
    failure.code = 'RATE_LIMITER_UNAVAILABLE';
    failure.cause = error;
    throw failure;
  }
}

function clientKey(req, scope) {
  return `${scope}:${req.auth?.uid || req.ip || req.socket.remoteAddress || "unknown"}`;
}

function sameSignature(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── Razorpay ──────────────────────────────────────────────────────────
let razorpayClient = null;
function getRazorpay() {
  if (razorpayClient) return razorpayClient;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Nexus payments are not configured.");
  }
  razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayClient;
}

const PLAN_IDS = Object.freeze({
  pro_monthly: process.env.RAZORPAY_PLAN_PRO_MONTHLY || "",
  pro_annual: process.env.RAZORPAY_PLAN_PRO_ANNUAL || "",
  enterprise_monthly: process.env.RAZORPAY_PLAN_ENT_MONTHLY || "",
  enterprise_annual: process.env.RAZORPAY_PLAN_ENT_ANNUAL || "",
});

function planKeyToParts(planKey) {
  const [planId, cycle] = String(planKey || "").split("_");
  if (!getPlan(planId) || !["monthly", "annual"].includes(cycle)) return null;
  return { planId, cycle, planKey };
}

function calculateNextBilling(cycle, from = new Date()) {
  const date = new Date(from);
  date.setMonth(date.getMonth() + (cycle === "annual" ? 12 : 1));
  return date.toISOString().slice(0, 10);
}

function unixToDate(value) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number * 1000).toISOString().slice(0, 10);
}

async function getCanonicalBilling(uid) {
  const snap = await adminDb().collection("billing").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function ensureBillingState(uid) {
  const db = adminDb();
  const canonicalRef = db.collection("billing").doc(uid);
  const canonicalSnap = await canonicalRef.get();

  if (canonicalSnap.exists) {
    const data = canonicalSnap.data();
    // Only server-verified billing states can grant a paid entitlement.
    if (data.source === "razorpay-webhook" || data.source === "razorpay-provider-check") {
      return { id: canonicalSnap.id, ...data };
    }
    // Legacy records were client-forgeable in the previous build. Preserve them
    // as metadata but reset entitlement to the free/starter tier until a verified
    // provider event establishes paid status.
    const safeState = {
      uid,
      plan: "starter",
      cycle: "monthly",
      status: "active",
      amount: 0,
      nextBilling: null,
      updatedAt: new Date().toISOString(),
      source: "server-migration",
      legacyPlan: data.plan || null,
      legacyStatus: data.status || null,
    };
    await canonicalRef.set(safeState, { merge: false });
    return { id: canonicalSnap.id, ...safeState };
  }

  // We intentionally use a server-created free plan. The browser cannot create
  // or activate billing documents anymore.
  const starter = {
    uid,
    plan: "starter",
    cycle: "monthly",
    status: "active",
    amount: 0,
    nextBilling: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "server-default",
  };
  await canonicalRef.set(starter, { merge: false });
  return { id: canonicalRef.id, ...starter };
}

async function writeVerifiedBilling({ uid, planId, cycle, status = "active", paymentId = null, subId = null, amountPaise = 0, source = "razorpay-webhook", providerEventId = null, nextBilling = null, extra = {} }) {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown plan.");

  const data = {
    uid,
    plan: planId,
    cycle,
    status,
    amount: Number(amountPaise || 0) / 100,
    paymentId: paymentId || null,
    subId: subId || null,
    nextBilling: nextBilling || calculateNextBilling(cycle),
    updatedAt: new Date().toISOString(),
    source,
    ...(providerEventId ? { providerEventId } : {}),
    ...extra,
  };

  await adminDb().collection("billing").doc(uid).set(data, { merge: true });
  await queueWebhookEventForOwner(uid, "subscription.updated", {
    plan: planId,
    cycle,
    status,
    subscription_id: subId,
    payment_id: paymentId,
  });
  return data;
}

async function markWebhookProcessed(eventId, handler) {
  const db = adminDb();
  const processedRef = db.collection("processedRazorpayEvents").doc(eventId);

  const claimed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(processedRef);
    if (existing.exists) return false;
    tx.set(processedRef, {
      eventId,
      status: "processing",
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  });

  if (!claimed) return { duplicate: true };

  try {
    await handler();
    await processedRef.set({ status: "processed", processedAt: new Date().toISOString() }, { merge: true });
    return { duplicate: false };
  } catch (error) {
    // A failed handler should be retryable. Remove the claim so a provider retry
    // can process it again safely.
    try { await processedRef.delete(); } catch (_) {}
    throw error;
  }
}


// ════════════════════════════════════════════════════════════════════════
// Workspace API + developer platform foundation
// These routes use Supabase Auth access-token authentication and never expose raw
// API-key secrets after creation.
// ════════════════════════════════════════════════════════════════════════
app.get("/workspaces", authenticate, async (req, res) => {
  try {
    const workspaces = await listUserWorkspaces(req.auth.uid);
    return res.json({ success: true, workspaces });
  } catch (error) {
    console.error(`[${req.requestId}] workspaces:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load workspaces." });
  }
});

app.post("/workspaces", authenticate, async (req, res) => {
  try {
    const workspace = await createWorkspace({
      uid: req.auth.uid,
      email: req.auth.email,
      displayName: req.auth.token?.name || req.auth.email || req.auth.uid,
      name: req.body?.name,
      description: req.body?.description,
    });
    return res.status(201).json({ success: true, workspace, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] create workspace:`, error.message);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "WORKSPACE_CREATE_FAILED",
      message: error.message || "Unable to create workspace.",
      requestId: req.requestId,
    });
  }
});

app.get("/workspace-invites", authenticate, async (req, res) => {
  try {
    const invites = await listPendingInvites(req.auth.email);
    return res.json({ success: true, invites, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] pending invites:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load invitations.", requestId: req.requestId });
  }
});

app.post("/workspace-invites/:inviteId/accept", authenticate, async (req, res) => {
  try {
    const result = await acceptInvite({
      inviteId: req.params.inviteId,
      uid: req.auth.uid,
      email: req.auth.email,
      displayName: req.auth.token?.name || req.auth.email || req.auth.uid,
    });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] accept invite:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "INVITE_ACCEPT_FAILED", message: error.message || "Unable to accept invitation.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/members", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    return res.json({ success: true, members: await listMembers(req.params.workspaceId), requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] list members:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load workspace members.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/activity", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    return res.json({ success: true, activity: await listActivity(req.params.workspaceId, req.query?.limit), requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] workspace activity:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load workspace activity.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/security-policy", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, 'advancedSecurity');
    const policy = await getSecurityPolicy(req.params.workspaceId);
    return res.json({ success: true, policy, retentionOptions: RETENTION_OPTIONS, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] security policy GET:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'SECURITY_POLICY_LOAD_FAILED', message: error.message || 'Unable to load security policy.', requestId: req.requestId });
  }
});

app.patch("/workspaces/:workspaceId/security-policy", authenticate, requireWorkspaceRole(["owner", "admin"]), requireRecentAuth(), async (req, res) => {
  try {
    const plan = await requireWorkspaceFeature(req.params.workspaceId, 'advancedSecurity');
    const input = req.body && typeof req.body === 'object' ? req.body : {};
    const policy = await updateSecurityPolicy({ workspaceId: req.params.workspaceId, uid: req.auth.uid, input });
    return res.json({ success: true, policy, plan: { id: plan.id }, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] security policy PATCH:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'SECURITY_POLICY_UPDATE_FAILED', message: error.message || 'Unable to update security policy.', requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/audit-log", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst"]), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, 'advancedSecurity');
    const events = await listAuditEvents(req.params.workspaceId, { limit: req.query?.limit, source: req.query?.source || 'all' });
    return res.json({ success: true, events, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] audit log:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'AUDIT_LOG_FAILED', message: error.message || 'Unable to load audit log.', requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/audit-log.csv", authenticate, requireWorkspaceRole(["owner", "admin", "analyst"]), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, 'advancedSecurity');
    const events = await listAuditEvents(req.params.workspaceId, { limit: req.query?.limit || 250, source: req.query?.source || 'all' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexus-audit-${req.params.workspaceId}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buildAuditCsv(events));
  } catch (error) {
    console.error(`[${req.requestId}] audit csv:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'AUDIT_EXPORT_FAILED', message: error.message || 'Unable to export audit log.', requestId: req.requestId });
  }
});

app.post("/workspaces/:workspaceId/invites", authenticate, requireWorkspaceRole(["owner", "admin"]), async (req, res) => {
  try {
    const invitation = await inviteMember({
      workspaceId: req.params.workspaceId,
      actorUid: req.auth.uid,
      invitedEmail: req.body?.email,
      role: req.body?.role,
    });
    const delivery = await workspaceManagement.deliver({ workspaceId: req.params.workspaceId, uid: req.auth.uid, inviteId: invitation.id })
      .catch(() => ({ emailStatus: "failed", message: "Invitation saved in Nexus, but the email could not be requested. Review Invitations to retry." }));
    return res.status(201).json({ success: true, invitation, ...delivery, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] invite member:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "INVITE_FAILED", message: error.message || "Unable to send invitation.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/invites", authenticate, requireWorkspaceRole(["owner","admin"]), async(req,res)=>{
 try{return res.json({invites:await workspaceManagement.list({workspaceId:req.params.workspaceId,uid:req.auth.uid})});}
 catch(err){return res.status(err.status||500).json({message:err.message,code:err.code});}
});
app.post("/workspaces/:workspaceId/invites/:inviteId/email", authenticate, requireWorkspaceRole(["owner","admin"]), async(req,res)=>{
 try{return res.json(await workspaceManagement.deliver({workspaceId:req.params.workspaceId,uid:req.auth.uid,inviteId:req.params.inviteId}));}
 catch(err){return res.status(err.status||500).json({message:err.message,code:err.code});}
});
app.delete("/workspaces/:workspaceId/invites/:inviteId", authenticate, requireWorkspaceRole(["owner","admin"]), async(req,res)=>{
 try{return res.json(await workspaceManagement.revoke({workspaceId:req.params.workspaceId,uid:req.auth.uid,inviteId:req.params.inviteId}));}
 catch(err){return res.status(err.status||500).json({message:err.message,code:err.code});}
});
app.patch("/workspaces/:workspaceId", authenticate, requireWorkspaceRole(["owner","admin"]), async(req,res)=>{
 try{return res.json({workspace:await workspaceManagement.update({workspaceId:req.params.workspaceId,uid:req.auth.uid,input:req.body})});}
 catch(err){return res.status(err.status||500).json({message:err.message,code:err.code});}
});
app.patch("/workspaces/:workspaceId/members/:memberId", authenticate, requireWorkspaceRole(["owner", "admin"]), async (req, res) => {
  try {
    const result = await changeMemberRole({ workspaceId: req.params.workspaceId, memberId: req.params.memberId, actorUid: req.auth.uid, role: req.body?.role });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] change member role:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "MEMBER_ROLE_FAILED", message: error.message || "Unable to change member role.", requestId: req.requestId });
  }
});

app.delete("/workspaces/:workspaceId/members/:memberId", authenticate, requireWorkspaceRole(["owner", "admin"]), async (req, res) => {
  try {
    const result = await removeMember({ workspaceId: req.params.workspaceId, memberId: req.params.memberId, actorUid: req.auth.uid });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] remove member:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "MEMBER_REMOVE_FAILED", message: error.message || "Unable to remove member.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/export.json", authenticate, requireWorkspaceRole(["owner", "admin", "analyst"]), async (req, res) => {
  try {
    const { exportWorkspaceData } = require("./workspaceDataExport");
const { buildPersonalExport, createDeletionRequest, cancelDeletionRequest, startAccountDeletionWorker } = require("./accountLifecycle");
    const payload = await exportWorkspaceData(req.params.workspaceId);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nexus-workspace-${req.params.workspaceId}.json"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(JSON.stringify(payload));
  } catch (error) {
    console.error(`[${req.requestId}] workspace export:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "EXPORT_FAILED", message: error.message || "Unable to export workspace data.", requestId: req.requestId });
  }
});

app.delete("/workspaces/:workspaceId", authenticate, requireRecentAuth(), async (req, res) => {
  try {
    // requireWorkspaceRole is deliberately checked inside deleteWorkspace too so
    // the endpoint remains safe if middleware order changes later.
    const result = await deleteWorkspace({ workspaceId: req.params.workspaceId, actorUid: req.auth.uid });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] delete workspace:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "WORKSPACE_DELETE_FAILED", message: error.message || "Unable to delete workspace.", requestId: req.requestId });
  }
});

app.post("/workspaces/:workspaceId/api-keys", authenticate, requireWorkspacePermission("api_keys.create"), async (req, res) => {
  try {
    const result = await createWorkspaceApiKey({
      workspaceId: req.params.workspaceId,
      uid: req.auth.uid,
      name: req.body?.name,
      environment: req.body?.environment,
      permissions: req.body?.permissions,
      expirationDays: req.body?.expirationDays,
      workspaceRole: req.workspace?.role,
    });
    return res.status(201).json({ success: true, ...result, warning: "Copy the API key now. The secret is shown only once." });
  } catch (error) {
    console.error(`[${req.requestId}] create api key:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to create API key." });
  }
});

app.get("/workspaces/:workspaceId/api-keys", authenticate, requireWorkspacePermission("api_keys.read"), async (req, res) => {
  try {
    const keys = await listWorkspaceApiKeys(req.params.workspaceId);
    return res.json({ success: true, apiKeys: keys });
  } catch (error) {
    console.error(`[${req.requestId}] list api keys:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load API keys." });
  }
});

app.post("/workspaces/:workspaceId/api-keys/:keyId/revoke", authenticate, requireWorkspacePermission("api_keys.revoke"), async (req, res) => {
  try {
    const result = await revokeWorkspaceApiKey({ workspaceId: req.params.workspaceId, keyId: req.params.keyId, uid: req.auth.uid, workspaceRole: req.workspace?.role });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error(`[${req.requestId}] revoke api key:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to revoke API key." });
  }
});

app.get("/workspaces/:workspaceId/usage", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const usage = await getUsage(req.params.workspaceId, req.query?.month);
    const plan = await getWorkspacePlan(req.params.workspaceId);
    if (!plan) return res.status(404).json({ success: false, message: "Workspace not found." });
    const quota = summarizeVerificationUsage({ usage, limit: plan.verificationLimit, monthKey: usage.month });
    return res.json({
      success: true,
      usage,
      quota: {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
        percent: quota.percent,
        unlimited: quota.unlimited,
        reached: quota.reached,
      },
      period: quota.period,
      limit: quota.limit,
      planId: plan.id,
    });
  } catch (error) {
    console.error(`[${req.requestId}] workspace usage:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load workspace usage." });
  }
});

app.get("/workspaces/:workspaceId/verification-requests", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    if (req.query.history === "1") return res.json({ success: true, ...await readVerificationHistory(req.params.workspaceId, req.query) });
    const requests = await listVerificationRequests(req.params.workspaceId, req.query?.limit);
    return res.json({ success: true, verificationRequests: requests });
  } catch (error) {
    console.error(`[${req.requestId}] verification requests:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.status === 400 ? error.message : "Unable to load verification requests." });
  }
});

app.get("/workspaces/:workspaceId/verification-history.csv", authenticate, requireWorkspacePermission("reports.export"), async (req, res) => {
  try {
    const result = await readVerificationHistory(req.params.workspaceId, req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="nexus-verification-page.csv"');
    res.setHeader("Cache-Control", "no-store");
    return res.send(historyCsv(result.verificationRequests));
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status === 400 ? error.message : "Unable to export verification history." });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Customer analytics + reporting
// All metrics are workspace-scoped and derived from server-owned
// verification/usage records. Test and live environments can be viewed
// independently or together.
// ════════════════════════════════════════════════════════════════════════
app.get("/workspaces/:workspaceId/analytics", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const range = parseRange(req.query?.range);
    if ((range === 90 || range === 365) && range !== 30) {
      await requireWorkspaceFeature(req.params.workspaceId, "advancedAnalytics");
    }
    const analytics = await getWorkspaceAnalytics(req.params.workspaceId, {
      range,
      environment: req.query?.environment || "all",
    });
    return res.json({ success: true, analytics, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] analytics:`, error.message);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "ANALYTICS_FAILED",
      message: error.message || "Unable to load analytics.",
      requestId: req.requestId,
    });
  }
});

app.get("/workspaces/:workspaceId/reports/verification.csv", authenticate, requireWorkspacePermission("reports.export"), async (req, res) => {
  try {
    const range = parseRange(req.query?.range);
    if ((range === 90 || range === 365)) {
      await requireWorkspaceFeature(req.params.workspaceId, "advancedAnalytics");
    }
    const analytics = await getWorkspaceAnalytics(req.params.workspaceId, {
      range,
      environment: req.query?.environment || "all",
    });
    const csv = buildVerificationCsv(analytics);
    const filename = `nexus-verification-report-${analytics.environment}-${range}d.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(csv);
  } catch (error) {
    console.error(`[${req.requestId}] verification report:`, error.message);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "REPORT_FAILED",
      message: error.message || "Unable to generate report.",
      requestId: req.requestId,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Automation + scheduled reports + Nexus Intelligence
// These features are workspace-scoped and server-authoritative.
// ════════════════════════════════════════════════════════════════════════
app.get("/workspaces/:workspaceId/security-events", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst"]), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 200);
    const snapshot = await adminDb().collection('workspaces').doc(req.params.workspaceId).collection('securityEvents').orderBy('createdAt', 'desc').limit(limit).get();
    const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, events, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] security events:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'SECURITY_EVENTS_FAILED', message: 'Unable to load security events.', requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/workflows", authenticate, requireWorkspacePermission("workflows.read"), async (req, res) => {
  try {
    const workflows = await listWorkflows(req.params.workspaceId);
    return res.json({ success: true, workflows });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "WORKFLOWS_FAILED", message: error.message || "Unable to load workflows." });
  }
});

app.get("/workspaces/:workspaceId/workflows/events", authenticate, requireWorkspacePermission("workflows.read"), async (req, res) => {
  return res.json({ success: true, events: listSupportedEvents().filter((event) => event.id !== "webhook.test") });
});

app.post("/workspaces/:workspaceId/workflows", authenticate, requireWorkspacePermission("workflows.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "automation");
    const workflow = await createWorkflow({ workspaceId: req.params.workspaceId, uid: req.auth.uid, ...(req.body || {}) });
    return res.status(201).json({ success: true, workflow });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "WORKFLOW_CREATE_FAILED", message: error.message || "Unable to create workflow." });
  }
});

app.patch("/workspaces/:workspaceId/workflows/:workflowId", authenticate, requireWorkspacePermission("workflows.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "automation");
    const workflow = await updateWorkflow({ workspaceId: req.params.workspaceId, workflowId: req.params.workflowId, patch: req.body || {} });
    return res.json({ success: true, workflow });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "WORKFLOW_UPDATE_FAILED", message: error.message || "Unable to update workflow." });
  }
});

app.delete("/workspaces/:workspaceId/workflows/:workflowId", authenticate, requireWorkspacePermission("workflows.manage"), async (req, res) => {
  try {
    const result = await deleteWorkflow({ workspaceId: req.params.workspaceId, workflowId: req.params.workflowId });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "WORKFLOW_DELETE_FAILED", message: error.message || "Unable to delete workflow." });
  }
});

app.get("/workspaces/:workspaceId/report-schedules", authenticate, requireWorkspacePermission("reports.schedule"), async (req, res) => {
  try {
    const schedules = await listReportSchedules(req.params.workspaceId);
    return res.json({ success: true, schedules });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "REPORT_SCHEDULES_FAILED", message: error.message || "Unable to load report schedules." });
  }
});

app.post("/workspaces/:workspaceId/report-schedules", authenticate, requireWorkspacePermission("reports.schedule"), async (req, res) => {
  try {
    const schedule = await createReportSchedule({ workspaceId: req.params.workspaceId, uid: req.auth.uid, input: req.body || {} });
    return res.status(201).json({ success: true, schedule });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "REPORT_SCHEDULE_CREATE_FAILED", message: error.message || "Unable to create report schedule." });
  }
});

app.patch("/workspaces/:workspaceId/report-schedules/:scheduleId", authenticate, requireWorkspacePermission("reports.schedule"), async (req, res) => {
  try {
    const schedule = await updateReportSchedule({ workspaceId: req.params.workspaceId, scheduleId: req.params.scheduleId, input: req.body || {} });
    return res.json({ success: true, schedule });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "REPORT_SCHEDULE_UPDATE_FAILED", message: error.message || "Unable to update report schedule." });
  }
});

app.delete("/workspaces/:workspaceId/report-schedules/:scheduleId", authenticate, requireWorkspacePermission("reports.schedule"), async (req, res) => {
  try {
    const result = await deleteReportSchedule({ workspaceId: req.params.workspaceId, scheduleId: req.params.scheduleId });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "REPORT_SCHEDULE_DELETE_FAILED", message: error.message || "Unable to delete report schedule." });
  }
});

app.post("/workspaces/:workspaceId/report-schedules/:scheduleId/run", authenticate, requireWorkspacePermission("reports.schedule"), async (req, res) => {
  try {
    const result = await runReportScheduleNow({ workspaceId: req.params.workspaceId, scheduleId: req.params.scheduleId });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "REPORT_RUN_FAILED", message: error.message || "Unable to run report." });
  }
});

app.get("/workspaces/:workspaceId/intelligence/usage", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst"]), async (req, res) => {
  try {
    const usage = await getAiUsage(req.params.workspaceId);
    return res.json({ success: true, usage });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || "AI_USAGE_FAILED", message: error.message || "Unable to load AI usage." });
  }
});

app.post("/workspaces/:workspaceId/intelligence", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst"]), async (req, res) => {
  const investigation = new AbortController();
  const disconnect = () => { if (!res.writableEnded) investigation.abort(); };
  res.on("close", disconnect);
  try {
    if (await endpointRateLimit(clientKey(req, "workspace-ai"), 12, 60_000)) return res.status(429).json({ success: false, code: "AI_RATE_LIMITED", message: "Too many AI requests. Please wait a minute." });
    const result = await answerWorkspaceQuestion({
      workspaceId: req.params.workspaceId,
      question: req.body?.question,
      range: req.body?.range ?? 30,
      environment: req.body?.environment || "all",
      mode: req.body?.mode || "standard",
      history: req.body?.history,
      actorId: req.auth.uid,
      signal: investigation.signal,
    });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    if (res.destroyed) return;
    return res.status(error.status || 500).json({ success: false, code: error.code || "AI_FAILED", message: error.message || "Unable to answer the workspace question.", requestId: req.requestId });
  } finally {
    res.off("close", disconnect);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Customer webhook platform
// Durable events are stored in Supabase and delivered by the server worker.
// ════════════════════════════════════════════════════════════════════════
app.get("/workspaces/:workspaceId/webhooks/events", authenticate, requireWorkspacePermission("webhooks.read"), async (req, res) => {
  return res.json({ success: true, events: listSupportedEvents() });
});

app.get("/workspaces/:workspaceId/webhooks", authenticate, requireWorkspacePermission("webhooks.read"), async (req, res) => {
  try {
    const webhooks = await listWebhooks(req.params.workspaceId);
    return res.json({ success: true, webhooks });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks list:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load webhooks." });
  }
});

app.post("/workspaces/:workspaceId/webhooks", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    const plan = await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const current = await listWebhooks(req.params.workspaceId);
    const maxByPlan = plan.id === "enterprise" ? 50 : 10;
    if (current.length >= maxByPlan) {
      return res.status(402).json({ success: false, code: "WEBHOOK_LIMIT_REACHED", message: `Your ${plan.name} plan allows up to ${maxByPlan} webhooks.`, limit: maxByPlan });
    }
    const result = await createWebhook({
      workspaceId: req.params.workspaceId,
      uid: req.auth.uid,
      name: req.body?.name,
      url: req.body?.url,
      events: req.body?.events,
      environment: req.body?.environment,
    });
    return res.status(201).json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks create:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "WEBHOOK_CREATE_FAILED", message: error.message || "Unable to create webhook.", requestId: req.requestId });
  }
});

app.patch("/workspaces/:workspaceId/webhooks/:webhookId", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const webhook = await updateWebhook({ workspaceId: req.params.workspaceId, webhookId: req.params.webhookId, patch: req.body || {} });
    return res.json({ success: true, webhook, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks update:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "WEBHOOK_UPDATE_FAILED", message: error.message || "Unable to update webhook.", requestId: req.requestId });
  }
});

app.post("/workspaces/:workspaceId/webhooks/:webhookId/rotate-secret", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const result = await rotateWebhookSecret({ workspaceId: req.params.workspaceId, webhookId: req.params.webhookId });
    return res.json({ success: true, ...result, warning: "Copy the new signing secret now. It is shown only once.", requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks rotate:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to rotate webhook secret.", requestId: req.requestId });
  }
});

app.post("/workspaces/:workspaceId/webhooks/:webhookId/test", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const result = await queueWebhookEvent({
      workspaceId: req.params.workspaceId,
      type: "webhook.test",
      environment: req.body?.environment || "test",
      targetWebhookId: req.params.webhookId,
      data: {
        webhook_id: req.params.webhookId,
        message: "This is a test event generated from the Nexus Developer Portal.",
      },
    });
    return res.status(202).json({ success: true, eventId: result.id, status: "queued", requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks test:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to queue webhook test.", requestId: req.requestId });
  }
});

app.delete("/workspaces/:workspaceId/webhooks/:webhookId", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const result = await deleteWebhook({ workspaceId: req.params.workspaceId, webhookId: req.params.webhookId });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhooks delete:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to delete webhook.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/webhooks/:webhookId/deliveries", authenticate, requireWorkspacePermission("webhooks.read"), async (req, res) => {
  try {
    const deliveries = await listWebhookDeliveries({ workspaceId: req.params.workspaceId, webhookId: req.params.webhookId, limit: req.query?.limit });
    return res.json({ success: true, deliveries, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhook deliveries:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to load webhook deliveries.", requestId: req.requestId });
  }
});

app.post("/workspaces/:workspaceId/webhooks/:webhookId/deliveries/:deliveryId/retry", authenticate, requireWorkspacePermission("webhooks.manage"), async (req, res) => {
  try {
    await requireWorkspaceFeature(req.params.workspaceId, "webhooks");
    const result = await retryWebhookDelivery({ workspaceId: req.params.workspaceId, webhookId: req.params.webhookId, deliveryId: req.params.deliveryId });
    return res.json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] webhook delivery retry:`, error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to retry webhook delivery.", requestId: req.requestId });
  }
});

app.get("/workspaces/:workspaceId/api-logs", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst"]), async (req, res) => {
  try {
    const logs = await listApiLogs(req.params.workspaceId, req.query?.limit);
    return res.json({ success: true, logs, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] api logs:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load API logs.", requestId: req.requestId });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Public customer Verification API
// Customer applications authenticate with Nexus API keys, not Supabase Auth tokens.
// The API key determines the workspace and environment.
// ════════════════════════════════════════════════════════════════════════
app.post("/v1/verifications", authenticateApiKey, requireApiPermission("verification:write"), async (req, res) => {
  try {
    if (await endpointRateLimit(`${req.apiAuth.keyId}:verification`, 30, 60_000)) {
      return res.status(429).json({ success: false, message: "Too many verification requests. Please try again later.", requestId: req.requestId });
    }

    const body = req.body || {};
    const method = String(body.method || "").toLowerCase();
    const workspaceSnap = await adminDb().collection("workspaces").doc(req.apiAuth.workspaceId).get();
    if (!workspaceSnap.exists) return res.status(404).json({ success: false, message: "Workspace not found." });

    const result = await createVerification({
      workspaceId: req.apiAuth.workspaceId,
      workspace: workspaceSnap.data(),
      environment: req.apiAuth.environment,
      method,
      externalUserId: body.external_user_id,
      email: body.email,
      phone: body.phone,
      metadata: body.metadata,
    });

    return res.status(201).json({ success: true, verification: result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] create verification:`, error.message);
    if (error.code === "QUOTA_EXCEEDED") {
      return res.status(402).json({ success: false, code: error.code, message: error.message, used: error.used, limit: error.limit, requestId: req.requestId });
    }
    const status = error.status || (String(error.code || "").endsWith("NOT_CONFIGURED") ? 503 : 500);
    return res.status(status).json({ success: false, code: error.code || "VERIFICATION_FAILED", message: error.message || "Unable to create verification request.", requestId: req.requestId });
  }
});

app.get("/v1/verifications/:id", authenticateApiKey, requireApiPermission("verification:read"), async (req, res) => {
  try {
    const verification = await getVerification(req.apiAuth.workspaceId, req.params.id);
    if (!verification) return res.status(404).json({ success: false, message: "Verification request not found.", requestId: req.requestId });
    if (verification.environment !== req.apiAuth.environment) return res.status(404).json({ success: false, message: "Verification request not found.", requestId: req.requestId });
    return res.json({ success: true, verification, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] get verification:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load verification request.", requestId: req.requestId });
  }
});

app.post("/v1/verifications/:id/verify", authenticateApiKey, requireApiPermission("verification:write"), async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: "A 6-digit verification code is required.", requestId: req.requestId });
    const verification = await completeVerification({
      workspaceId: req.apiAuth.workspaceId,
      id: req.params.id,
      code,
      environment: req.apiAuth.environment,
    });
    return res.json({ success: true, verification, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] complete verification:`, error.message);
    const statusMap = { NOT_FOUND: 404, EXPIRED: 400, MAX_ATTEMPTS: 429, INVALID_CODE: 400, ENVIRONMENT_MISMATCH: 404 };
    return res.status(statusMap[error.code] || error.status || 500).json({ success: false, code: error.code || "VERIFICATION_FAILED", message: error.message || "Unable to verify code.", requestId: req.requestId });
  }
});

app.get("/v1/usage", authenticateApiKey, requireApiPermission("verification:read"), async (req, res) => {
  try {
    const usage = await getUsage(req.apiAuth.workspaceId, req.query?.month);
    return res.json({ success: true, usage, environment: req.apiAuth.environment, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] v1 usage:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load usage.", requestId: req.requestId });
  }
});

// ── Customer support center ──────────────────────────────────────────
app.get("/support/tickets", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const tickets = await listCustomerTickets(req.workspace.workspaceId, req.auth.uid);
    return res.json({ success: true, tickets, workspaceId: req.workspace.workspaceId, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] support list:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load support tickets.", requestId: req.requestId });
  }
});

app.post("/support/tickets", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const ticket = await createSupportTicket({
      workspaceId: req.workspace.workspaceId,
      uid: req.auth.uid,
      email: req.auth.email,
      subject: req.body?.subject,
      description: req.body?.description,
      category: req.body?.category,
      priority: req.body?.priority,
    });
    const supportEmail = String(process.env.SUPPORT_EMAIL || "").trim();
    if (supportEmail && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        await sendResendEmail({
          recipients: [supportEmail],
          subject: `[Nexus Support] ${ticket.id} — ${ticket.subject}`,
          text: `New Nexus support ticket\\n\\nTicket: ${ticket.id}\\nWorkspace: ${ticket.workspaceId}\\nRequester: ${req.auth.email || req.auth.uid}\\nCategory: ${ticket.category}\\nPriority: ${ticket.priority}\\n\\n${String(req.body?.description || "").trim()}`,
        });
      } catch (emailError) {
        console.warn(`[${req.requestId}] support notification email failed:`, emailError.message);
      }
    }
    return res.status(201).json({ success: true, ticket, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(`[${req.requestId}] support create:`, error.message);
    return res.status(status).json({ success: false, message: status < 500 ? error.message : "Unable to create support ticket.", requestId: req.requestId });
  }
});

app.get("/support/tickets/:ticketId", authenticate, async (req, res) => {
  try {
    const ticket = await getTicket(req.params.ticketId);
    assertTicketAccess(ticket, {
      uid: req.auth.uid,
      workspaceId: req.query?.workspaceId,
      isAdmin: req.auth.globalRole === "admin",
    });
    if (req.auth.globalRole !== "admin") {
      const membership = await getWorkspaceMembership(req.auth.uid, ticket.workspaceId);
      if (!membership) return res.status(403).json({ success: false, message: "Support ticket access denied.", requestId: req.requestId });
    }
    return res.json({ success: true, ticket, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ success: false, message: status < 500 ? error.message : "Unable to load support ticket.", requestId: req.requestId });
  }
});

app.post("/support/tickets/:ticketId/replies", authenticate, async (req, res) => {
  try {
    const ticket = await getTicket(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found.", requestId: req.requestId });
    const isAdmin = req.auth.globalRole === "admin";
    if (!isAdmin) {
      const membership = await getWorkspaceMembership(req.auth.uid, ticket.workspaceId);
      if (!membership) return res.status(403).json({ success: false, message: "Support ticket access denied.", requestId: req.requestId });
    }
    const result = await addTicketMessage(req.params.ticketId, {
      uid: req.auth.uid,
      authorType: isAdmin ? "admin" : "customer",
      body: req.body?.body,
      status: isAdmin ? "pending_customer" : "pending_nexus",
    });
    if (isAdmin && ticket.requesterEmail && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        await sendResendEmail({
          recipients: [ticket.requesterEmail],
          subject: `[Nexus Support] Reply on ${ticket.id}`,
          text: `Nexus Support replied to ${ticket.id}.\\n\\n${String(req.body?.body || "").trim()}\\n\\nOpen Nexus → Support to continue the conversation.`,
        });
      } catch (emailError) {
        console.warn(`[${req.requestId}] customer support reply email failed:`, emailError.message);
      }
    }
    return res.status(201).json({ success: true, ...result, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ success: false, message: status < 500 ? error.message : "Unable to add reply.", requestId: req.requestId });
  }
});

app.post("/support/tickets/:ticketId/close", authenticate, async (req, res) => {
  try {
    const ticket = await getTicket(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found.", requestId: req.requestId });
    if (req.auth.globalRole !== "admin") {
      const membership = await getWorkspaceMembership(req.auth.uid, ticket.workspaceId);
      if (!membership) return res.status(403).json({ success: false, message: "Support ticket access denied.", requestId: req.requestId });
    }
    const result = await closeCustomerTicket(req.params.ticketId);
    return res.json({ success: true, ticket: result, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ success: false, message: status < 500 ? error.message : "Unable to close ticket.", requestId: req.requestId });
  }
});

// Internal support queue. Customer workspaces never receive this endpoint.
installAdminRoutes(app, { authenticate, requireAdmin, requireRecentAuth });
require("./eventCenter").installEventRoutes(app, { authenticate, requireAdmin });
require("./globeAnalytics").installGlobeRoutes(app, { authenticate, requireAdmin });
app.get("/admin/support/tickets", authenticate, requireAdmin, async (req, res) => {
  try {
    const tickets = await listAdminTickets();
    return res.json({ success: true, tickets, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] admin support list:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load support queue.", requestId: req.requestId });
  }
});

app.patch("/admin/support/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  try {
    const ticket = await updateAdminTicket(req.params.ticketId, { status: req.body?.status, priority: req.body?.priority });
    return res.json({ success: true, ticket, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ success: false, message: status < 500 ? error.message : "Unable to update ticket.", requestId: req.requestId });
  }
});

app.get("/admin/account-deletion-requests", authenticate, requireAdmin, async (req, res) => {
  try {
    const result=await require('./deletionQueue').readDeletionQueue(ensureSupabaseAdmin(),req.query);
    return res.json({...result,requestId:req.requestId});
  } catch (error) {
    if(error.status===400)return res.status(400).json({message:error.message});
    console.error(`[${req.requestId}] admin deletion requests:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load account deletion requests.", requestId: req.requestId });
  }
});

// ── Public health/readiness ───────────────────────────────────────────
app.get("/health", (req, res) => {
  // Liveness only: this endpoint intentionally does not claim dependency readiness.
  return res.json({
    status: "ok",
    service: "Nexus SaaS Server",
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.get("/readyz", async (req, res) => {
  const readiness = await checkReadiness();
  return res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? "ready" : "not_ready",
    database: readiness.database,
    config: readiness.config,
    blocking: readiness.blocking,
    warnings: readiness.warnings,
    requestId: req.requestId,
  });
});

app.get("/admin/system/health", authenticate, requireAdmin, async (req, res) => {
  const readiness = await checkReadiness();
  const services = readiness.config;
  return res.json({
    success: true,
    requestId: req.requestId,
    readiness: {
      ready: readiness.ready,
      database: readiness.database,
      blocking: readiness.blocking,
      warnings: readiness.warnings,
    },
    services,
    workers: {
      webhook: services.webhookWorker,
      automation: process.env.AUTOMATION_WORKER_ENABLED === "true",
      reports: services.reportScheduler,
    },
    timestamp: new Date().toISOString(),
  });
});

// Public plan catalog. It contains no secrets and is the backend source of truth
// for prices/limits used by the billing UI.
app.get("/billing/plans", (req, res) => {
  const plans = publicPlans().map((plan) => {
    const availableCycles = plan.id === "starter"
      ? ["monthly"]
      : ["monthly", "annual"].filter((cycle) => Boolean(PLAN_IDS[`${plan.id}_${cycle}`]));
    return { ...plan, availableCycles };
  });
  return res.json({ success: true, plans });
});

// ── Authentication context ───────────────────────────────────────────
app.get("/auth/context", authenticate, async (req, res) => {
  return res.json({
    success: true,
    user: {
      uid: req.auth.uid,
      email: req.auth.email,
      role: req.auth.globalRole,
    },
  });
});

// ── Billing state ────────────────────────────────────────────────────
app.get("/billing/state", authenticate, async (req, res) => {
  try {
    const billing = await ensureBillingState(req.auth.uid);
    const checkout = await adminDb().collection('billing_checkouts').doc(req.auth.uid).get();
    return res.json({ success: true, billing, checkout: checkout.exists ? { subscriptionId: checkout.data().subscriptionId, planKey: checkout.data().planKey, status: checkout.data().status } : null });
  } catch (error) {
    console.error(`[${req.requestId}] billing/state:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load billing state." });
  }
});

app.get("/billing/invoices", authenticate, async (req, res) => {
  try {
    const snapshot = await adminDb().collection("billing_invoices")
      .where("uid", "==", req.auth.uid)
      .limit(100)
      .get();
    const invoices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((invoice) => ["razorpay-webhook", "razorpay-provider-check"].includes(invoice.source))
      .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    return res.json({ success: true, invoices, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] billing/invoices:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load invoices.", requestId: req.requestId });
  }
});

app.get("/billing/invoices.csv", authenticate, async (req, res) => {
  try {
    const snapshot = await adminDb().collection("billing_invoices")
      .where("uid", "==", req.auth.uid)
      .limit(500)
      .get();
    const invoices = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((invoice) => ["razorpay-webhook", "razorpay-provider-check"].includes(invoice.source))
      .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    const rows = [
      ["invoice_id", "date", "description", "amount_inr", "currency", "status", "plan", "payment_id"],
      ...invoices.map((invoice) => [
        invoice.invoiceId || invoice.id,
        invoice.date || "",
        invoice.description || invoice.plan || "",
        Number(invoice.amount || 0).toFixed(2),
        invoice.currency || "INR",
        invoice.status || "",
        invoice.plan || "",
        invoice.paymentId || "",
      ]),
    ];
    const csvEscape = (value) => {
      const text = value == null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nexus-invoices-${new Date().toISOString().slice(0, 7)}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error(`[${req.requestId}] billing/invoices.csv:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to export invoices.", requestId: req.requestId });
  }
});

app.get("/billing/invoices/:invoiceId.csv", authenticate, async (req, res) => {
  try {
    const ref = adminDb().collection("billing_invoices").doc(req.params.invoiceId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.uid !== req.auth.uid || !["razorpay-webhook", "razorpay-provider-check"].includes(snapshot.data()?.source)) {
      return res.status(404).json({ success: false, message: "Invoice not found.", requestId: req.requestId });
    }
    const invoice = { id: snapshot.id, ...snapshot.data() };
    const rows = [
      ["invoice_id", "date", "description", "amount_inr", "currency", "status", "plan", "payment_id"],
      [invoice.invoiceId || invoice.id, invoice.date || "", invoice.description || invoice.plan || "", Number(invoice.amount || 0).toFixed(2), invoice.currency || "INR", invoice.status || "", invoice.plan || "", invoice.paymentId || ""],
    ];
    const csvEscape = (value) => {
      const text = value == null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${(invoice.invoiceId || invoice.id).replace(/[^A-Za-z0-9._-]/g, "_")}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error(`[${req.requestId}] billing/invoices/:id.csv:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to export invoice.", requestId: req.requestId });
  }
});

app.get("/billing/preferences", authenticate, async (req, res) => {
  try {
    const preferences = await getBillingPreferences(req.auth.uid);
    return res.json({ success: true, preferences, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] billing/preferences GET:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load billing preferences.", requestId: req.requestId });
  }
});

app.patch("/billing/preferences", authenticate, async (req, res) => {
  try {
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const allowed = {};
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (typeof input[key] === "boolean") allowed[key] = input[key];
    }
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ success: false, message: "At least one billing preference must be a boolean.", requestId: req.requestId });
    }
    const preferences = await updateBillingPreferences(req.auth.uid, allowed);
    return res.json({ success: true, preferences, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] billing/preferences PATCH:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to save billing preferences.", requestId: req.requestId });
  }
});

// ── Account security ──────────────────────────────────────────────────

app.get("/account/data-export.json", authenticate, requireRecentAuth(), async (req, res) => {
  try {
    const data = await buildPersonalExport(req.auth.uid);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nexus-account-${req.auth.uid}.json"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`[${req.requestId}] account export:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to export account data.", requestId: req.requestId });
  }
});

app.get("/account/deletion-request", authenticate, async (req, res) => {
  try {
    const snap = await adminDb().collection("accountDeletionRequests").doc(req.auth.uid).get();
    const request=snap.exists ? snap.data() : null;
    if(request){delete request.leaseToken;delete request.leaseUntil;delete request.error;request.canCancel=['pending','blocked'].includes(request.status);}
    return res.json({ success: true, request, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] deletion request read:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load account deletion status.", requestId: req.requestId });
  }
});

app.post("/account/deletion-request", authenticate, requireRecentAuth(), async (req, res) => {
  try {
    const request = await createDeletionRequest(req.auth.uid, req.auth.email);
    return res.status(202).json({ success: true, request, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({
      success: false,
      code: error.code,
      message: status < 500 ? error.message : "Unable to schedule account deletion.",
      workspaces: error.workspaces,
      requestId: req.requestId,
    });
  }
});

app.post("/account/deletion-request/cancel", authenticate, requireRecentAuth(), async (req, res) => {
  try {
    const request = await cancelDeletionRequest(req.auth.uid);
    return res.json({ success: true, request, requestId: req.requestId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ success: false, code: error.code, message: status < 500 ? error.message : "Unable to cancel account deletion.", requestId: req.requestId });
  }
});

app.post("/account/security/revoke-all-sessions", authenticate, requireRecentAuth(), async (req, res) => {
  try {
    const auth = require("./supabaseAdmin").adminAuth();
    await auth.revokeRefreshTokens(req.headers.authorization.replace(/^Bearer\s+/i, ''));
    await ensureSupabaseAdmin().from('nexus_account_events').insert({user_id:req.auth.uid,type:'sessions_revoked'}).then(()=>{}).catch(()=>{});
    return res.json({ success: true, revokedAt: new Date().toISOString(), message: "All refresh tokens have been revoked. Sign in again on devices you still use.", requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] revoke sessions:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to revoke active sessions.", requestId: req.requestId });
  }
});

app.get('/account/security-events',authenticate,async(req,res)=>{
 const page=Number(req.query.page || 0);
 if(!Number.isInteger(page) || page<0 || page>10000)return res.status(400).json({message:'Invalid activity page.'});
 const {data,error,count}=await ensureSupabaseAdmin().from('nexus_account_events').select('id,type,created_at,metadata',{count:'exact'}).eq('user_id',req.auth.uid).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*30,page*30+29);
 if(error)return res.status(503).json({message:'Account history is unavailable. Please retry.'});
 return res.json({events:data || [],page,total:count,hasMore:(page+1)*30<count});
});

// ════════════════════════════════════════════════════════════════════════
// Registration phone OTP endpoints
// These are intentionally public because the user has not created a
// Nexus account yet. They are protected by provider checks plus
// IP/phone rate limiting and never accept a userId/uid authority claim.
// ════════════════════════════════════════════════════════════════════════
app.post("/auth/check-registration-email", require("./registrationEmail").registrationEmailHandler({ client: ensureSupabaseAdmin, rateLimit: endpointRateLimit }));
app.post("/auth/check-email-verification", require("./emailVerificationStatus").emailVerificationStatusHandler({ client: ensureSupabaseAdmin, rateLimit: endpointRateLimit }));

const accountPhone = require("./accountPhone").accountPhoneHandlers({ client: ensureSupabaseAdmin, rateLimit: endpointRateLimit, service: () => getTwilioClient().verify.v2.services(serviceSid) });
app.post("/account/phone/send-otp", authenticate, accountPhone.send);
app.post("/account/phone/verify-otp", authenticate, accountPhone.verify);

app.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: "Phone required." });
    const e164 = toE164(phone);
    if (!e164) return res.status(400).json({ success: false, message: "Invalid phone." });
    if (await isRateLimited(`${req.ip}:${e164}`)) {
      return res.status(429).json({ success: false, message: "Too many OTP requests. Wait 1 min." });
    }

    await getTwilioClient().verify.v2.services(serviceSid).verifications.create({ to: e164, channel: "sms" });
    return res.json({ success: true, message: `OTP sent to ${maskPhone(e164)}` });
  } catch (error) {
    console.error(`[${req.requestId}] send-otp:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "OTP_SEND_FAILED", message: error.status === 503 ? error.message : "Unable to send OTP.", requestId: req.requestId });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code, email } = req.body || {};
    if (!phone || !code) return res.status(400).json({ success: false, message: "Phone and code required." });
    const e164 = toE164(phone);
    if (!e164) return res.status(400).json({ success: false, message: "Invalid phone." });

    const check = await getTwilioClient().verify.v2.services(serviceSid).verificationChecks.create({ to: e164, code: String(code).trim() });
    const verified = check.status === "approved";
    const proof = verified && email ? issuePhoneProof(e164, email) : null;
    return res.json({ success: true, verified, proof, message: verified ? "Phone verified! ✅" : "Incorrect OTP." });
  } catch (error) {
    if (error.status === 404 || error.code === 20404) {
      return res.status(404).json({ success: false, message: "OTP expired. Request a new one." });
    }
    console.error(`[${req.requestId}] verify-otp:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to verify OTP." });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Protected AI endpoint
// ════════════════════════════════════════════════════════════════════════
app.post("/claude-ai", authenticate, (_req, res) => res.status(410).json({success:false,message:"Use the authorized workspace intelligence endpoint."}));

// ════════════════════════════════════════════════════════════════════════
// Razorpay — create one-time order
// ════════════════════════════════════════════════════════════════════════
app.post("/razorpay/create-order", authenticate, async (req, res) => {
  try {
    const { planId, cycle = "monthly" } = req.body || {};
    const amount = getPlanAmount(planId, cycle);
    if (!getPlan(planId) || !amount || amount <= 0 || !["monthly", "annual"].includes(cycle)) {
      return res.status(400).json({ success: false, message: "Invalid paid plan or billing cycle." });
    }
    if (await endpointRateLimit(clientKey(req, "order"), 10, 60_000)) {
      return res.status(429).json({ success: false, message: "Too many payment requests. Please wait a minute." });
    }

    const uid = req.auth.uid;
    const order = await getRazorpay().orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${uid.slice(0, 8)}_${Date.now()}`,
      notes: { userId: uid, planId, cycle },
    });

    console.log(`[${req.requestId}] ✅ Order created: ${order.id} user=${uid} plan=${planId}`);
    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(`[${req.requestId}] create-order:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to create payment order." });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Razorpay — create recurring subscription
// ════════════════════════════════════════════════════════════════════════
app.post("/razorpay/create-sub", authenticate, async (req, res) => {
  try {
    const { planKey } = req.body || {};
    const parts = planKeyToParts(planKey);
    if (!parts || !PLAN_IDS[planKey]) {
      return res.status(400).json({ success: false, message: "Invalid or unconfigured subscription plan." });
    }
    if (await endpointRateLimit(clientKey(req, "subscription"), 5, 60_000)) {
      return res.status(429).json({ success: false, message: "Too many subscription requests. Please wait a minute." });
    }

    const uid = req.auth.uid;
    const previousCheckout = await adminDb().collection('billing_checkouts').doc(uid).get();
    if (previousCheckout.exists && previousCheckout.data().subscriptionId) {
      const previous = await getRazorpay().subscriptions.fetch(previousCheckout.data().subscriptionId);
      if (previous.notes?.userId !== uid) return res.status(403).json({ message: 'Subscription ownership could not be verified.' });
      if (['created', 'authenticated'].includes(previous.status)) {
        if (previous.notes.planKey !== planKey) return res.status(409).json({ message: 'Check your existing payment status before changing plans.' });
        if (previous.status === 'authenticated') return res.status(409).json({ message: 'Your existing subscription is awaiting activation. Check its payment status; do not pay again.' });
        return res.json({ success: true, subscriptionId: previous.id, keyId: process.env.RAZORPAY_KEY_ID, status: previous.status, shortUrl: previous.short_url || null, reused: true });
      }
      if (previous.status === 'active' && previous.notes.planKey === planKey) return res.status(409).json({ message: 'This subscription is already active. Check payment status to synchronize your plan.' });
    }
    const sub = await getRazorpay().subscriptions.create({
      plan_id: PLAN_IDS[planKey],
      total_count: parts.cycle === "annual" ? 3 : 12,
      quantity: 1,
      customer_notify: true,
      notes: {
        userId: uid,
        email: req.auth.email || "",
        name: req.auth.token?.name || "",
        planKey,
        planId: parts.planId,
        cycle: parts.cycle,
      },
    });

    console.log(`[${req.requestId}] ✅ Subscription created: ${sub.id} user=${uid} plan=${planKey} status=${sub.status || "created"}`);
    await adminDb().collection('billing_checkouts').doc(uid).set({ uid, subscriptionId: sub.id, planKey, status: 'created', createdAt: new Date().toISOString() });
    return res.json({
      success: true,
      subscriptionId: sub.id,
      planKey,
      keyId: process.env.RAZORPAY_KEY_ID,
      status: sub.status || "created",
      shortUrl: sub.short_url || null,
      requestId: req.requestId,
    });
  } catch (error) {
    const provider = error?.error || {};
    console.error(`[${req.requestId}] create-sub:`, JSON.stringify({
      message: error?.message || "",
      code: provider.code || error?.code || null,
      description: provider.description || null,
      source: provider.source || null,
      step: provider.step || null,
      reason: provider.reason || null,
      statusCode: error?.statusCode || null,
    }));
    return res.status(error?.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500).json({
      success: false,
      code: provider.code || error?.code || "RAZORPAY_SUBSCRIPTION_ERROR",
      message: provider.description || "Unable to create subscription.",
      reason: provider.reason || null,
      step: provider.step || null,
      source: provider.source || null,
      requestId: req.requestId,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Razorpay — fetch subscription status for the authenticated owner.
// The subscription must belong to the current user via server-side notes.
// ════════════════════════════════════════════════════════════════════════
app.get("/razorpay/subscription-status/:subscriptionId", authenticate, async (req, res) => {
  try {
    const subscriptionId = String(req.params.subscriptionId || "").trim();
    if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
      return res.status(400).json({ success: false, message: "Invalid subscription ID." });
    }

    const subscription = await getRazorpay().subscriptions.fetch(subscriptionId);
    if (subscription?.notes?.userId !== req.auth.uid) {
      return res.status(403).json({ success: false, message: "Subscription ownership could not be verified." });
    }

    return res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status || null,
        planId: subscription.plan_id || null,
        paymentMethod: subscription.payment_method || null,
        customerId: subscription.customer_id || null,
        authAttempts: Number(subscription.auth_attempts || 0),
        paidCount: Number(subscription.paid_count || 0),
        totalCount: Number(subscription.total_count || 0),
        expireBy: subscription.expire_by || null,
        shortUrl: subscription.short_url || null,
      },
      requestId: req.requestId,
    });
  } catch (error) {
    const provider = error?.error || {};
    console.error(`[${req.requestId}] subscription-status:`, JSON.stringify({
      message: error?.message || "",
      code: provider.code || error?.code || null,
      description: provider.description || null,
      source: provider.source || null,
      step: provider.step || null,
      reason: provider.reason || null,
      statusCode: error?.statusCode || null,
    }));
    return res.status(error?.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500).json({
      success: false,
      code: provider.code || error?.code || "RAZORPAY_SUBSCRIPTION_STATUS_ERROR",
      message: provider.description || "Unable to read subscription status.",
      requestId: req.requestId,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Razorpay — verify checkout signature, but NEVER activate billing here.
// The provider webhook remains the authoritative subscription source of truth.
// ════════════════════════════════════════════════════════════════════════
app.post('/razorpay/reconcile', authenticate, async (req, res) => {
  try {
    if (await endpointRateLimit(clientKey(req, 'billing-reconcile'), 30, 60_000)) return res.status(429).json({ message: 'Please wait before checking again.' });
    const reconcile = createBillingReconciler({ db: adminDb(), provider: getRazorpay(), planIds: PLAN_IDS, planParts: planKeyToParts,
      planAmount: getPlanAmount, getPlan, notify: queueWebhookEventForOwner });
    const result = await reconcile({ uid: req.auth.uid, subscriptionId: req.body?.subscriptionId, paymentId: req.body?.paymentId });
    return res.json({ ...result, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] billing reconcile failed:`, error.status || error.statusCode || 'provider-error');
    return res.status(error.status || 502).json({ success: false, message: error.status ? error.message : 'Nexus payment status is temporarily unavailable. Your payment has not been retried. Check again shortly.', requestId: req.requestId });
  }
});

app.post("/razorpay/verify", authenticate, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_subscription_id,
      planId,
      cycle,
    } = req.body || {};

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: "Payment verification is not configured." });

    if (await endpointRateLimit(clientKey(req, "verify"), 20, 60_000)) {
      return res.status(429).json({ success: false, message: "Too many verification requests. Please wait a minute." });
    }

    let valid = false;
    if (razorpay_order_id && razorpay_payment_id) {
      const expected = crypto.createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
      valid = sameSignature(expected, razorpay_signature);
    } else if (razorpay_subscription_id && razorpay_payment_id) {
      const expected = crypto.createHmac("sha256", secret).update(`${razorpay_payment_id}|${razorpay_subscription_id}`).digest("hex");
      valid = sameSignature(expected, razorpay_signature);
    }

    if (!valid) return res.status(400).json({ success: false, message: "Payment verification failed — invalid signature." });

    const razorpay = getRazorpay();
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const uid = req.auth.uid;

    if (razorpay_order_id) {
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const notes = order.notes || {};
      const expectedAmount = getPlanAmount(planId, cycle);
      if (
        notes.userId !== uid ||
        notes.planId !== planId ||
        notes.cycle !== cycle ||
        expectedAmount === null ||
        Number(payment.amount) !== Number(expectedAmount)
      ) {
        return res.status(400).json({ success: false, message: "Payment details do not match the selected plan." });
      }
    } else if (razorpay_subscription_id) {
      const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);
      const notes = subscription.notes || {};
      const expectedPlanKey = `${planId}_${cycle}`;
      if (notes.userId !== uid || notes.planKey !== expectedPlanKey) {
        return res.status(400).json({ success: false, message: "Subscription details do not match the selected plan." });
      }
    }

    return res.json({
      success: true,
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id || null,
      subId: razorpay_subscription_id || null,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      planId,
      cycle,
      requestId: req.requestId,
      activation: "pending_webhook",
    });
  } catch (error) {
    console.error(`[${req.requestId}] verify:`, error.message);
    return res.status(500).json({ success: false, message: "Payment verification failed." });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Razorpay — cancellation request. Billing state changes only via webhook.
// ════════════════════════════════════════════════════════════════════════
app.post("/razorpay/cancel-sub", authenticate, async (req, res) => {
  try {
    if (await endpointRateLimit(clientKey(req, "cancel"), 5, 60_000)) {
      return res.status(429).json({ success: false, message: "Too many cancellation requests. Please wait a minute." });
    }

    const billing = await getCanonicalBilling(req.auth.uid);
    const subscriptionId = billing?.subId;
    if (!subscriptionId) return res.status(409).json({ success: false, message: "No active Nexus subscription is associated with this account." });

    const razorpay = getRazorpay();
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    if (subscription.notes?.userId !== req.auth.uid) {
      return res.status(403).json({ success: false, message: "Subscription ownership could not be verified." });
    }

    const result = await razorpay.subscriptions.cancel(subscriptionId, true);
    return res.json({
      success: true,
      status: result.status,
      message: "Cancellation requested. Your billing status will update when the payment processor confirms cancellation.",
    });
  } catch (error) {
    console.error(`[${req.requestId}] cancel-sub:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to cancel subscription." });
  }
});

// ════════════════════════════════════════════════════════════════════════
// Razorpay webhook — public endpoint protected by provider signature.
// ════════════════════════════════════════════════════════════════════════
app.post("/razorpay/webhook", async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const signature = req.headers["x-razorpay-signature"] || "";
    const rawBody = req.body;

    if (!secret) return res.status(503).json({ success: false, message: "Webhook secret is not configured." });
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ success: false, message: "Invalid webhook body." });

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!sameSignature(expected, signature)) {
      console.warn("❌ Razorpay webhook signature mismatch");
      return res.status(400).json({ success: false });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch (_) {
      return res.status(400).json({ success: false, message: "Invalid webhook JSON." });
    }

    const eventId = String(event.id || crypto.createHash("sha256").update(rawBody).digest("hex"));
    const result = await markWebhookProcessed(eventId, async () => {
      const db = adminDb();

      switch (event.event) {
        case "payment.captured": {
          const payment = event.payload?.payment?.entity;
          if (!payment) throw new Error("Missing payment entity.");

          let notes = payment.notes || {};
          if ((!notes.userId || !notes.planId || !notes.cycle) && payment.order_id) {
            const order = await getRazorpay().orders.fetch(payment.order_id);
            notes = order.notes || notes;
          }

          const { userId, planId, cycle } = notes;
          const amountPaise = Number(payment.amount);
          const expectedAmount = getPlanAmount(planId, cycle);
          if (!userId || !getPlan(planId) || expectedAmount === null || amountPaise !== Number(expectedAmount)) {
            console.warn(`⚠️ Ignoring payment.captured with invalid billing notes: ${payment.id}`);
            return;
          }

          const existing = await ensureBillingState(userId);
          // If an already-processed trusted subscription exists, this event can still
          // safely refresh the billing record because the provider event is authoritative.
          await db.collection("billing").doc(userId).set({
            uid: userId,
            plan: planId,
            cycle,
            status: "active",
            amount: amountPaise / 100,
            paymentId: payment.id,
            subId: existing.subId || null,
            nextBilling: calculateNextBilling(cycle),
            updatedAt: new Date().toISOString(),
            source: "razorpay-webhook",
            providerEventId: eventId,
            verifiedAt: new Date().toISOString(),
          }, { merge: true });

          const invoiceRef = db.collection("billing_invoices").doc(`rp_${payment.id}`);
          await invoiceRef.set({
            uid: userId,
            invoiceId: `INV-${payment.id}`,
            date: new Date().toISOString().slice(0, 10),
            amount: amountPaise / 100,
            currency: payment.currency || "INR",
            status: "paid",
            plan: `${getPlan(planId).name} ${cycle === "annual" ? "Annual" : "Monthly"}`,
            description: `Payment for ${getPlan(planId).name}`,
            paymentId: payment.id,
            orderId: payment.order_id || null,
            providerEventId: eventId,
            source: "razorpay-webhook",
            createdAt: new Date().toISOString(),
          }, { merge: true });
          await queueWebhookEventForOwner(userId, "subscription.updated", {
            plan: planId,
            cycle,
            status: "active",
            payment_id: payment.id,
          });
          break;
        }

        case "subscription.activated": {
          const subscription = event.payload?.subscription?.entity;
          if (!subscription) throw new Error("Missing subscription entity.");
          const notes = subscription.notes || {};
          const parts = planKeyToParts(notes.planKey || `${notes.planId}_${notes.cycle}`);
          if (!notes.userId || !parts) return;

          await writeVerifiedBilling({
            uid: notes.userId,
            planId: parts.planId,
            cycle: parts.cycle,
            status: "active",
            subId: subscription.id,
            amountPaise: getPlanAmount(parts.planId, parts.cycle),
            providerEventId: eventId,
            nextBilling: unixToDate(subscription.current_end) || unixToDate(subscription.end_at) || null,
          });
          break;
        }

        case "subscription.charged": {
          const subscription = event.payload?.subscription?.entity;
          if (!subscription) throw new Error("Missing subscription entity.");
          const notes = subscription.notes || {};
          const parts = planKeyToParts(notes.planKey || `${notes.planId}_${notes.cycle}`);
          if (!notes.userId || !parts) return;

          const amountPaise = getPlanAmount(parts.planId, parts.cycle);
          await writeVerifiedBilling({
            uid: notes.userId,
            planId: parts.planId,
            cycle: parts.cycle,
            status: "active",
            subId: subscription.id,
            amountPaise,
            providerEventId: eventId,
            nextBilling: unixToDate(subscription.current_end) || unixToDate(subscription.end_at) || null,
            extra: { lastChargedAt: new Date().toISOString() },
          });
          break;
        }

        case "subscription.cancelled": {
          const subscription = event.payload?.subscription?.entity;
          if (!subscription) throw new Error("Missing subscription entity.");
          const userId = subscription.notes?.userId;
          if (!userId) return;

          await db.collection("billing").doc(userId).set({
            uid: userId,
            subId: subscription.id,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "razorpay-webhook",
            providerEventId: eventId,
          }, { merge: true });
          await queueWebhookEventForOwner(userId, "subscription.updated", {
            status: "cancelled",
            subscription_id: subscription.id,
          });
          break;
        }

        case "payment.failed": {
          const payment = event.payload?.payment?.entity;
          if (!payment) throw new Error("Missing payment entity.");
          let notes = payment.notes || {};
          if ((!notes.userId || !notes.planId) && payment.order_id) {
            const order = await getRazorpay().orders.fetch(payment.order_id);
            notes = order.notes || notes;
          }
          if (!notes.userId) return;

          await db.collection("billing").doc(notes.userId).set({
            uid: notes.userId,
            status: "past_due",
            lastPaymentFailure: payment.error_description || "Payment failed",
            lastPaymentFailureAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "razorpay-webhook",
            providerEventId: eventId,
          }, { merge: true });
          await queueWebhookEventForOwner(notes.userId, "subscription.updated", {
            status: "past_due",
            payment_id: payment.id,
          });
          break;
        }

        default:
          console.log(`ℹ️ Unhandled Razorpay event: ${event.event}`);
      }
    });

    return res.json({ success: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("❌ Razorpay webhook error:", error.message);
    return res.status(500).json({ success: false });
  }
});

// ── Workspace branding ───────────────────────────────────────────────
app.get("/workspaces/:workspaceId/branding", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const branding = await getWorkspaceBranding(req.params.workspaceId);
    return res.json({ success: true, branding, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] branding GET:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "BRANDING_LOAD_FAILED", message: error.message || "Unable to load workspace branding.", requestId: req.requestId });
  }
});

app.patch("/workspaces/:workspaceId/branding", authenticate, requireWorkspaceRole(["owner", "admin"]), async (req, res) => {
  try {
    const branding = await updateWorkspaceBranding({ workspaceId: req.params.workspaceId, input: req.body || {} });
    return res.json({ success: true, branding, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] branding PATCH:`, error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || "BRANDING_UPDATE_FAILED", message: error.message || "Unable to update workspace branding.", requestId: req.requestId });
  }
});

// ── Workspace authorization helper endpoint for later phases ─────────
// This establishes the server-side authorization primitive without exposing
// new Verification API functionality in Phase 1.
app.get("/workspaces/:workspaceId/access", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  return res.json({
    success: true,
    workspace: {
      id: req.workspace.workspaceId,
      role: req.workspace.role,
      owner: Boolean(req.workspace.owner),
      globalAdmin: Boolean(req.workspace.globalAdmin),
    },
  });
});

app.get("/workspaces/:workspaceId/entitlements", authenticate, requireWorkspaceRole(["owner", "admin", "developer", "analyst", "viewer"]), async (req, res) => {
  try {
    const plan = await getWorkspacePlan(req.params.workspaceId);
    if (!plan) return res.status(404).json({ success: false, message: "Workspace not found.", requestId: req.requestId });
    return res.json({ success: true, plan: { id: plan.id, name: plan.name, featureFlags: plan.featureFlags, verificationLimit: plan.verificationLimit, workspaceLimit: plan.workspaceLimit, teamMemberLimit: plan.teamMemberLimit, apiLimit: plan.apiLimit }, requestId: req.requestId });
  } catch (error) {
    console.error(`[${req.requestId}] entitlements:`, error.message);
    return res.status(500).json({ success: false, message: "Unable to load workspace entitlements.", requestId: req.requestId });
  }
});

// ── Route and operational errors ───────────────────────────────────────
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "Route not found.",
    requestId: req.requestId || null,
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.message === "Origin not allowed by CORS.") {
    return res.status(403).json({ success: false, code: "CORS_DENIED", message: "Origin is not allowed.", requestId: req.requestId || null });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, code: "INVALID_JSON", message: "Request body contains invalid JSON.", requestId: req.requestId || null });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, code: "PAYLOAD_TOO_LARGE", message: "Request payload is too large.", requestId: req.requestId || null });
  }
  return next(error);
});

app.use((error, req, res, _next) => {
  if (res.headersSent) return;
  console.error(`[${req.requestId || "unknown"}] Unhandled server error:`, error?.message || error);
  return res.status(Number(error?.status) >= 400 && Number(error?.status) < 500 ? Number(error.status) : 500).json({
    success: false,
    code: error?.code || "INTERNAL_SERVER_ERROR",
    message: Number(error?.status) >= 400 && Number(error?.status) < 500 ? (error.message || "Request failed.") : "Internal server error.",
    requestId: req.requestId || null,
  });
});

const processRole = String(process.env.NEXUS_PROCESS_ROLE || (isProduction ? "api" : "all")).toLowerCase();

async function start() {
  const strictStartup = String(process.env.NEXUS_STRICT_STARTUP || "").toLowerCase() === "true";
  const configStatus = collectConfigStatus();
  if (!['api', 'all'].includes(processRole)) {
    console.error(`❌ Invalid NEXUS_PROCESS_ROLE=${processRole}. server.js supports api or all; use worker.js for the worker process.`);
    process.exit(1);
    return;
  }
  if (isProduction && !configuredOrigins.length) {
    console.error("❌ Production requires FRONTEND_URL to be configured.");
    if (strictStartup) { process.exit(1); return; }
  }
  if (isProduction && configuredOrigins.some((origin) => !origin.startsWith("https://"))) {
    console.error("❌ Production FRONTEND_URL must contain only HTTPS origins.");
    if (strictStartup) { process.exit(1); return; }
  }
  if (isProduction && String(process.env.WEBHOOK_ALLOW_HTTP || "").toLowerCase() === "true") {
    console.error("❌ WEBHOOK_ALLOW_HTTP must be false in production.");
    if (strictStartup) { process.exit(1); return; }
  }

  if (strictStartup) {
    const readiness = await checkReadiness();
    if (!readiness.ready) {
      console.error("❌ NEXUS_STRICT_STARTUP is enabled and the server is not ready:");
      for (const problem of readiness.blocking) console.error(`   - ${problem}`);
      process.exit(1);
      return;
    }
  }

  if (configStatus.config.supabase) {
    try {
      ensureSupabaseAdmin();
      await bootstrapAdmins();
    } catch (error) {
      if (strictStartup) {
        console.error(`❌ Supabase bootstrap failed: ${error.message}`);
        process.exit(1);
        return;
      }
      console.warn(`⚠️ Supabase bootstrap skipped: ${error.message}`);
    }
  } else {
    console.warn("⚠️ Supabase credentials are not configured. Protected endpoints will return 401/503 until configured.");
  }

  const workerTimers = [];
  const server = app.listen(PORT, () => {
    if (processRole !== "api") {
      for (const timer of [startWebhookWorker(), startAutomationWorker(), startReportScheduler(), startRetentionWorker(), startAccountDeletionWorker()]) {
        if (timer) workerTimers.push(timer);
      }
    } else if ([
      String(process.env.WEBHOOK_WORKER_ENABLED || "").toLowerCase(),
      String(process.env.AUTOMATION_WORKER_ENABLED || "").toLowerCase(),
      String(process.env.REPORT_SCHEDULER_ENABLED || "").toLowerCase(),
    ].includes("true")) {
      console.warn("⚠️ NEXUS_PROCESS_ROLE=api: background workers are disabled in this API process. Deploy the dedicated worker entrypoint separately.");
    }
    server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
    server.headersTimeout = Math.min(15_000, Math.max(10_000, HTTP_REQUEST_TIMEOUT_MS - 5_000));
    server.keepAliveTimeout = 5_000;
    console.log(`🚀 Nexus Server on port ${PORT}`);
    console.log(`   CORS origins: ${Array.from(allowedOrigins).join(", ") || "none"}`);
    console.log(`   Supabase: ${configStatus.config.supabase ? "✅" : "❌ NOT SET"}`);
    console.log(`   Frontend URL: ${configStatus.config.frontendUrl ? "✅" : "❌ NOT SET"}`);
    console.log(`   Razorpay: ${configStatus.config.razorpay ? "✅" : "❌ NOT SET"}`);
    console.log(`   Twilio: ${configStatus.config.twilio ? "✅" : "❌ NOT SET"}`);
    console.log(`   Resend: ${configStatus.config.resend ? "✅" : "❌ NOT SET"}`);
    console.log(`   Intelligence (${configStatus.config.aiProvider}): ${configStatus.config.intelligence ? "✅" : "❌ NOT SET"}`);
    console.log(`   Process role: ${processRole}`);
    console.log(`   Plans: ${Object.keys(PLANS).join(", ")}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 ${signal} received; shutting down gracefully.`);
    for (const timer of workerTimers) clearInterval(timer);
    phoneRateLimiter.stop();
    endpointRateLimiter.stop();
    server.close((error) => {
      if (error) {
        console.error("Graceful shutdown failed:", error.message);
        process.exitCode = 1;
      }
      process.exit();
    });
    setTimeout(() => process.exit(1), 10_000).unref?.();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  server.on("error", (error) => {
    console.error(`❌ Server listen error: ${error.message}`);
    process.exitCode = 1;
  });
}

start();
