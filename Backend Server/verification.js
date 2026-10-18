const crypto = require('crypto');
const twilio = require('twilio');
const { FieldValue } = require('./supabaseDocumentStore');
const { adminDb } = require('./supabaseAdmin');
const { getPlan } = require('./plans');
const { queueWebhookEvent } = require('./webhooks');
const { recordVerificationCreated, recordVerificationStatus } = require('./analytics');
const { queueAutomationEvent } = require('./automation');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const disposableDomains = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com',
  'temp-mail.org', 'yopmail.com', 'getnada.com', 'throwawaymail.com',
  'dispostable.com', 'sharklasers.com', 'guerrillamailblock.com',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return null;
  return value;
}

function normalizePhone(phone) {
  const value = String(phone || '').replace(/[\s\-()]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(value)) return value;
  if (/^91\d{10}$/.test(value)) return `+${value}`;
  if (/^\d{10}$/.test(value)) return `+91${value}`;
  if (/^0\d{10}$/.test(value)) return `+91${value.slice(1)}`;
  return null;
}

function nowIso() { return new Date().toISOString(); }

function maskPhone(phone) {
  if (!phone || phone.length < 7) return '****';
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(1, phone.length - 7))}${phone.slice(-4)}`;
}

function getRisk(email) {
  const domain = email.split('@')[1];
  const disposable = disposableDomains.has(domain);
  return {
    score: disposable ? 90 : 5,
    disposable,
    signals: disposable ? ['disposable_email_domain'] : [],
  };
}

function verificationId() {
  return `ver_${crypto.randomBytes(12).toString('hex')}`;
}

function customerUserId(externalUserId, identifier) {
  return sha256(externalUserId ? `external:${externalUserId}` : `identifier:${identifier}`).slice(0, 40);
}

async function getWorkspacePlan(workspace) {
  const ownerUid = workspace?.ownerUid;
  if (!ownerUid) return getPlan('starter');
  const billingSnap = await adminDb().collection('billing').doc(ownerUid).get();
  if (!billingSnap.exists) return getPlan('starter');
  const billing = billingSnap.data();
  const plan = getPlan(billing.plan);
  if (!plan) return getPlan('starter');
  if (!['active', 'trialing'].includes(String(billing.status || 'active'))) return getPlan('starter');
  return plan;
}

async function reserveUsage({ workspaceId, workspace, environment, method }) {
  if (environment === 'test') {
    return { counted: false, used: null, limit: null, month: new Date().toISOString().slice(0, 7) };
  }

  const plan = await getWorkspacePlan(workspace);
  const limit = plan.verificationLimit;
  const month = new Date().toISOString().slice(0, 7);
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(month);

  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const used = Number(data.verificationRequests || 0);
    if (limit !== null && Number.isFinite(limit) && used >= Number(limit)) {
      const error = new Error('Monthly verification quota exceeded.');
      error.code = 'QUOTA_EXCEEDED';
      error.used = used;
      error.limit = Number(limit);
      throw error;
    }

    const base = {
      workspaceId,
      month,
      planId: plan.id,
      verificationRequests: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    };
    if (method === 'email') base.emailRequests = FieldValue.increment(1);
    if (method === 'phone') base.phoneRequests = FieldValue.increment(1);
    if (!snap.exists) {
      tx.set(ref, { ...data, ...base, createdAt: new Date().toISOString() }, { merge: true });
    } else {
      tx.set(ref, base, { merge: true });
    }
    return { used: used + 1, limit: limit === null ? null : Number(limit), month };
  });

  return { counted: true, ...result };
}

async function updateCustomerUser(workspaceId, externalUserId, identifier, patch) {
  const id = customerUserId(externalUserId, identifier);
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('customerUsers').doc(id);
  await ref.set({
    workspaceId,
    externalUserId: externalUserId || null,
    ...patch,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return id;
}

async function sendEmailCode({ email, code }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    const error = new Error('Email verification provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
    error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Nexus verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Nexus verification</h2><p>Your verification code is:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes.</p></div>`,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Email provider rejected the verification email.');
    error.code = 'EMAIL_PROVIDER_ERROR';
    throw error;
  }
  return { providerMessageId: data.id || null };
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) {
    const error = new Error('Phone verification provider is not configured.');
    error.code = 'PHONE_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  return {
    client: twilio(accountSid, authToken),
    serviceSid,
  };
}

async function emitVerificationEvent(workspaceId, type, verification, extra = {}) {
  try {
    await queueWebhookEvent({
      workspaceId,
      type,
      environment: verification.environment || null,
      data: {
        verification_id: verification.id,
        external_user_id: verification.externalUserId || null,
        method: verification.method,
        status: verification.status,
        email: verification.email || null,
        destination: verification.email || verification.phoneMasked || null,
        risk_score: Number(verification.riskScore || 0),
        disposable: Boolean(verification.disposable),
        created_at: verification.createdAt || null,
        expires_at: verification.expiresAt || null,
        ...extra,
      },
    });
    await queueAutomationEvent({
      workspaceId,
      type,
      environment: verification.environment || null,
      data: {
        verification_id: verification.id,
        external_user_id: verification.externalUserId || null,
        method: verification.method,
        status: verification.status,
        risk_score: Number(verification.riskScore || 0),
        disposable: Boolean(verification.disposable),
        created_at: verification.createdAt || null,
        expires_at: verification.expiresAt || null,
      },
    });
  } catch (error) {
    // Verification itself must not fail just because webhook/automation enqueue is unavailable.
    console.error(`Event enqueue failed for ${type}:`, error.message);
  }
}

async function createVerification({ workspaceId, workspace, environment, method, externalUserId, email, phone, metadata }) {
  const now = new Date();
  const id = verificationId();
  const external = String(externalUserId || '').trim().slice(0, 200) || null;
  const methodName = String(method || '').trim().toLowerCase();
  if (!['email', 'phone'].includes(methodName)) {
    const error = new Error('method must be email or phone.');
    error.status = 400;
    throw error;
  }

  const normalizedEmail = methodName === 'email' ? normalizeEmail(email) : null;
  const normalizedPhone = methodName === 'phone' ? normalizePhone(phone) : null;
  if (methodName === 'email' && !normalizedEmail) {
    const error = new Error('A valid email is required.');
    error.status = 400;
    throw error;
  }
  if (methodName === 'phone' && !normalizedPhone) {
    const error = new Error('A valid phone number is required.');
    error.status = 400;
    throw error;
  }

  if (environment === 'live') {
    if (methodName === 'email' && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
      const error = new Error('Email verification provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
      error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
      throw error;
    }
    if (methodName === 'phone' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_SERVICE_SID)) {
      const error = new Error('Phone verification provider is not configured.');
      error.code = 'PHONE_PROVIDER_NOT_CONFIGURED';
      throw error;
    }
  }

  const risk = normalizedEmail ? getRisk(normalizedEmail) : { score: 5, disposable: false, signals: [] };
  const usage = await reserveUsage({ workspaceId, workspace, environment, method: methodName });
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const docRef = adminDb().collection('workspaces').doc(workspaceId).collection('verificationRequests').doc(id);

  const record = {
    id,
    workspaceId,
    environment,
    method: methodName,
    status: 'pending',
    externalUserId: external,
    email: normalizedEmail || null,
    phoneMasked: normalizedPhone ? maskPhone(normalizedPhone) : null,
    phoneHash: normalizedPhone ? sha256(normalizedPhone) : null,
    phone: normalizedPhone || null,
    riskScore: risk.score,
    riskSignals: risk.signals,
    disposable: risk.disposable,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    usageMonth: usage.month,
  };

  if (environment === 'test') {
    const code = '123456';
    const salt = crypto.randomBytes(16).toString('hex');
    record.codeSalt = salt;
    record.codeHash = sha256(`${salt}:${code}`);
    record.testCode = code;
    record.delivery = 'test';
    await docRef.set(record);
    await recordVerificationCreated(record);
    await updateCustomerUser(workspaceId, external, normalizedEmail || normalizedPhone, {
      email: normalizedEmail || null,
      phoneMasked: normalizedPhone ? maskPhone(normalizedPhone) : null,
      verificationStatus: 'pending',
      riskStatus: risk.score >= 80 ? 'high' : 'low',
      createdAt: now.toISOString(),
    });
    await emitVerificationEvent(workspaceId, 'verification.created', record);
    if (risk.score >= 80) await emitVerificationEvent(workspaceId, 'risk.detected', record);
    return {
      id,
      status: 'pending',
      environment,
      method: methodName,
      expiresAt: record.expiresAt,
      delivery: 'test',
      testCode: code,
      riskScore: risk.score,
      usage,
    };
  }

  if (methodName === 'email') {
    const code = randomCode();
    const salt = crypto.randomBytes(16).toString('hex');
    record.codeSalt = salt;
    record.codeHash = sha256(`${salt}:${code}`);
    const delivery = await sendEmailCode({ email: normalizedEmail, code });
    record.delivery = 'email';
    record.providerMessageId = delivery.providerMessageId;
  } else {
    const { client, serviceSid } = getTwilioClient();
    const verification = await client.verify.v2.services(serviceSid).verifications.create({ to: normalizedPhone, channel: 'sms' });
    record.delivery = 'sms';
    record.providerVerificationSid = verification.sid;
  }

  await docRef.set(record);
  await recordVerificationCreated(record);
  await updateCustomerUser(workspaceId, external, normalizedEmail || normalizedPhone, {
    email: normalizedEmail || null,
    phoneMasked: normalizedPhone ? maskPhone(normalizedPhone) : null,
    phoneHash: normalizedPhone ? sha256(normalizedPhone) : null,
    phone: normalizedPhone || null,
    verificationStatus: 'pending',
    riskStatus: risk.score >= 80 ? 'high' : 'low',
    createdAt: now.toISOString(),
  });
  await emitVerificationEvent(workspaceId, 'verification.created', record);
  if (risk.score >= 80) await emitVerificationEvent(workspaceId, 'risk.detected', record);

  return {
    id,
    status: 'pending',
    environment,
    method: methodName,
    expiresAt: record.expiresAt,
    delivery: record.delivery,
    destination: normalizedEmail || maskPhone(normalizedPhone),
    riskScore: risk.score,
    usage,
  };
}

async function getVerification(workspaceId, id) {
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('verificationRequests').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const safe = { ...data };
  delete safe.codeHash;
  delete safe.codeSalt;
  delete safe.testCode;
  delete safe.phone;
  delete safe.phoneHash;
  delete safe.providerVerificationSid;
  delete safe.providerMessageId;
  return safe;
}

async function completeVerification({ workspaceId, id, code, environment }) {
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('verificationRequests').doc(id);
  let result;
  try {
    result = await adminDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      const error = new Error('Verification request not found.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    const data = snapshot.data();
    if (data.environment !== environment) {
      const error = new Error('Verification environment mismatch.');
      error.code = 'ENVIRONMENT_MISMATCH';
      throw error;
    }
    if (data.status === 'verified') return { status: 'verified', data, alreadyVerified: true };
    if (new Date(data.expiresAt).getTime() < Date.now()) {
      tx.set(ref, { status: 'expired', updatedAt: new Date().toISOString() }, { merge: true });
      const error = new Error('Verification code has expired.');
      error.code = 'EXPIRED';
      return { verificationError: error };
    }
    if (Number(data.attempts || 0) >= MAX_ATTEMPTS) {
      const error = new Error('Maximum verification attempts exceeded.');
      error.code = 'MAX_ATTEMPTS';
      throw error;
    }

    if (data.method === 'phone' && environment === 'live') {
      return { status: 'phone_provider', data };
    }

    const supplied = String(code || '').trim();
    const hash = sha256(`${data.codeSalt}:${supplied}`);
    if (hash !== data.codeHash) {
      const attempts = Number(data.attempts || 0) + 1;
      tx.set(ref, {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      const error = new Error('Incorrect verification code.');
      error.code = 'INVALID_CODE';
      return { verificationError: error };
    }

    tx.set(ref, {
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { status: 'verified', data };
    });
    // Commit attempt/expiry state before returning an API error. Throwing
    // inside the transaction would roll back the brute-force protection.
    if (result.verificationError) throw result.verificationError;
  } catch (error) {
    try {
      const failedSnapshot = await ref.get();
      if (failedSnapshot.exists) {
        const failedData = failedSnapshot.data();
        const shouldQueueExpired = error.code === 'EXPIRED' && failedData.status === 'expired' && !failedData.expiredEventQueuedAt;
        const shouldQueueFailed = error.code === 'INVALID_CODE' && failedData.status === 'failed' && !failedData.failedEventQueuedAt;
        if (shouldQueueExpired || shouldQueueFailed) {
          const marker = shouldQueueExpired ? { expiredEventQueuedAt: nowIso() } : { failedEventQueuedAt: nowIso() };
          await ref.set(marker, { merge: true });
          await emitVerificationEvent(workspaceId, shouldQueueExpired ? 'verification.expired' : 'verification.failed', { ...failedData, id });
          await recordVerificationStatus({ ...failedData, id }, shouldQueueExpired ? 'expired' : 'failed', new Date());
        }
      }
    } catch (eventError) {
      console.error('Verification failure event enqueue failed:', eventError.message);
    }
    throw error;
  }

  if (result.alreadyVerified) return getVerification(workspaceId, id);

  if (result.status === 'phone_provider') {
    const { client, serviceSid } = getTwilioClient();
    const verification = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: result.data.phone, code: String(code || '').trim() });
    if (verification.status !== 'approved') {
      const attemptsSnapshot = await ref.get();
      const attempts = Number(attemptsSnapshot.data()?.attempts || 0) + 1;
      await ref.set({
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (attempts >= MAX_ATTEMPTS) {
        await recordVerificationStatus({ ...attemptsSnapshot.data(), id }, 'failed', new Date());
      }
      const error = new Error(attempts >= MAX_ATTEMPTS ? 'Maximum verification attempts exceeded.' : 'Incorrect verification code.');
      error.code = attempts >= MAX_ATTEMPTS ? 'MAX_ATTEMPTS' : 'INVALID_CODE';
      throw error;
    }
    await ref.set({ status: 'verified', verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    result.status = 'verified';
  }

  const latest = await ref.get();
  const data = latest.data();
  await updateCustomerUser(workspaceId, data.externalUserId, data.email || data.phoneMasked, {
    verificationStatus: 'verified',
    riskStatus: Number(data.riskScore || 0) >= 80 ? 'high' : 'low',
    lastVerifiedAt: new Date().toISOString(),
    email: data.email || null,
    phoneMasked: data.phoneMasked || null,
  });
  await recordVerificationStatus({ ...data, id }, 'verified', new Date());
  await emitVerificationEvent(workspaceId, 'verification.completed', { ...data, id });

  return getVerification(workspaceId, id);
}

async function listVerificationRequests(workspaceId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('verificationRequests')
    .orderBy('createdAt', 'desc').limit(safeLimit).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    delete data.codeHash;
    delete data.codeSalt;
    delete data.testCode;
    delete data.phone;
    delete data.phoneHash;
    return { id: doc.id, ...data };
  });
}

async function getUsage(workspaceId, month) {
  const monthKey = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : new Date().toISOString().slice(0, 7);
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(monthKey).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : {
    id: monthKey,
    month: monthKey,
    verificationRequests: 0,
    emailRequests: 0,
    phoneRequests: 0,
  };
}

module.exports = {
  createVerification,
  completeVerification,
  getVerification,
  listVerificationRequests,
  getUsage,
  normalizeEmail,
  normalizePhone,
};
