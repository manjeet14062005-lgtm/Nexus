const { FieldValue } = require('./supabaseDocumentStore');
const { adminDb } = require('./supabaseAdmin');
const { getWorkspacePlan } = require('./entitlements');

const MAX_DETAIL_ROWS = 5000;
const ALLOWED_RANGES = new Set([7, 30, 90, 365]);

function isoMonth() {
  return new Date().toISOString().slice(0, 7);
}

function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function parseRange(value) {
  const parsed = Number(value || 30);
  return ALLOWED_RANGES.has(parsed) ? parsed : 30;
}

function rangeBounds(rangeDays) {
  const days = parseRange(rangeDays);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  previousEnd.setUTCHours(23, 59, 59, 999);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));
  previousStart.setUTCHours(0, 0, 0, 0);
  return { days, start, end, previousStart, previousEnd };
}

function selectedEnvironments(value) {
  const env = String(value || 'all').toLowerCase();
  return env === 'test' || env === 'live' ? [env] : ['live', 'test'];
}

function emptyDay(day, environment = 'all') {
  return {
    day,
    environment,
    requests: 0,
    emailRequests: 0,
    phoneRequests: 0,
    verified: 0,
    failed: 0,
    expired: 0,
    emailVerified: 0,
    phoneVerified: 0,
    emailFailed: 0,
    phoneFailed: 0,
    emailExpired: 0,
    phoneExpired: 0,
    highRisk: 0,
    disposable: 0,
  };
}

async function incrementDailyStats(workspaceId, occurredAt, environment, increments = {}) {
  if (!workspaceId) return;
  const env = environment === 'test' ? 'test' : 'live';
  const day = dayKey(occurredAt);
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('analyticsDaily').doc(`${day}_${env}`);
  const payload = {
    workspaceId,
    day,
    environment: env,
    updatedAt: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(increments)) {
    if (Number(value) !== 0) payload[key] = FieldValue.increment(Number(value));
  }
  await ref.set(payload, { merge: true });
}

async function recordVerificationCreated(record) {
  return incrementDailyStats(record.workspaceId, record.createdAt, record.environment, {
    requests: 1,
    emailRequests: record.method === 'email' ? 1 : 0,
    phoneRequests: record.method === 'phone' ? 1 : 0,
    highRisk: Number(record.riskScore || 0) >= 80 ? 1 : 0,
    disposable: record.disposable ? 1 : 0,
  });
}

async function recordVerificationStatus(record, status, occurredAt = new Date()) {
  const suffix = record.method === 'phone' ? 'phone' : 'email';
  const increments = {};
  if (status === 'verified') {
    increments.verified = 1;
    increments[`${suffix}Verified`] = 1;
  } else if (status === 'failed') {
    increments.failed = 1;
    increments[`${suffix}Failed`] = 1;
  } else if (status === 'expired') {
    increments.expired = 1;
    increments[`${suffix}Expired`] = 1;
  } else {
    return null;
  }
  return incrementDailyStats(record.workspaceId, occurredAt, record.environment, increments);
}

function detailFallbackRows(details) {
  const byDay = new Map();
  for (const row of details) {
    const day = dayKey(row.createdAt);
    const env = row.environment === 'test' ? 'test' : 'live';
    const current = byDay.get(`${day}_${env}`) || emptyDay(day, env);
    current.requests += 1;
    if (row.method === 'email') current.emailRequests += 1;
    if (row.method === 'phone') current.phoneRequests += 1;
    if (row.status === 'verified') {
      current.verified += 1;
      if (row.method === 'email') current.emailVerified += 1;
      if (row.method === 'phone') current.phoneVerified += 1;
    } else if (row.status === 'failed') {
      current.failed += 1;
      if (row.method === 'email') current.emailFailed += 1;
      if (row.method === 'phone') current.phoneFailed += 1;
    } else if (row.status === 'expired') {
      current.expired += 1;
      if (row.method === 'email') current.emailExpired += 1;
      if (row.method === 'phone') current.phoneExpired += 1;
    }
    if (Number(row.riskScore || 0) >= 80) current.highRisk += 1;
    if (row.disposable) current.disposable += 1;
    byDay.set(`${day}_${env}`, current);
  }
  return [...byDay.values()];
}

function sumRows(rows) {
  return rows.reduce((acc, row) => {
    for (const key of [
      'requests', 'emailRequests', 'phoneRequests', 'verified', 'failed', 'expired',
      'emailVerified', 'phoneVerified', 'emailFailed', 'phoneFailed', 'emailExpired',
      'phoneExpired', 'highRisk', 'disposable'
    ]) acc[key] += Number(row[key] || 0);
    return acc;
  }, {
    requests: 0, emailRequests: 0, phoneRequests: 0, verified: 0, failed: 0, expired: 0,
    emailVerified: 0, phoneVerified: 0, emailFailed: 0, phoneFailed: 0, emailExpired: 0,
    phoneExpired: 0, highRisk: 0, disposable: 0,
  });
}

function percentChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function dateKeys(start, end) {
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

async function readDailyStats(workspaceId, start, end) {
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('analyticsDaily')
    .where('day', '>=', startKey)
    .where('day', '<=', endKey)
    .orderBy('day', 'asc')
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function readVerificationDetails(workspaceId, start, end, environment = 'all') {
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('verificationRequests')
    .orderBy('createdAt', 'desc')
    .limit(MAX_DETAIL_ROWS)
    .get();

  const startMs = start.getTime();
  const endMs = end.getTime();
  const allowed = selectedEnvironments(environment);
  const rows = [];

  for (const doc of snapshot.docs) {
    const raw = doc.data();
    const timestamp = new Date(raw.createdAt || 0).getTime();
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) continue;
    if (!allowed.includes(raw.environment || 'live')) continue;
    const row = { id: doc.id, ...raw };
    delete row.codeHash;
    delete row.codeSalt;
    delete row.testCode;
    delete row.phone;
    delete row.phoneHash;
    delete row.providerVerificationSid;
    delete row.providerMessageId;
    rows.push(row);
  }

  return { rows, truncated: snapshot.size >= MAX_DETAIL_ROWS };
}

async function getWorkspaceAnalytics(workspaceId, options = {}) {
  const environment = String(options.environment || 'all').toLowerCase();
  const { days, start, end, previousStart, previousEnd } = rangeBounds(options.range);
  const allowed = selectedEnvironments(environment);

  const [dailyRows, previousDailyRows, detailResult, plan] = await Promise.all([
    readDailyStats(workspaceId, start, end),
    readDailyStats(workspaceId, previousStart, previousEnd),
    readVerificationDetails(workspaceId, start, end, environment),
    getWorkspacePlan(workspaceId),
  ]);

  const filterEnv = (rows) => rows.filter((row) => allowed.includes(row.environment || 'live'));
  let filteredDaily = filterEnv(dailyRows);
  const filteredPrevious = filterEnv(previousDailyRows);
  let analyticsSource = 'daily-rollup';
  if (filteredDaily.length === 0 && detailResult.rows.length > 0) {
    filteredDaily = detailFallbackRows(detailResult.rows).filter((row) => allowed.includes(row.environment || 'live'));
    analyticsSource = 'legacy-detail-fallback';
  }
  const totals = sumRows(filteredDaily);
  const previousTotals = sumRows(filteredPrevious);

  const dailyMap = new Map();
  for (const row of filteredDaily) {
    const key = row.day;
    const current = dailyMap.get(key) || emptyDay(key, environment);
    for (const field of Object.keys(current)) {
      if (['day', 'environment'].includes(field)) continue;
      current[field] = Number(current[field] || 0) + Number(row[field] || 0);
    }
    dailyMap.set(key, current);
  }

  const series = dateKeys(start, end).map((day) => dailyMap.get(day) || emptyDay(day, environment));
  const details = detailResult.rows;

  const statusCounts = new Map();
  const methodCounts = new Map();
  const riskBuckets = new Map([
    ['Low (0–39)', 0],
    ['Medium (40–79)', 0],
    ['High (80–100)', 0],
  ]);
  const riskSignals = new Map();
  let pending = 0;

  for (const row of details) {
    const status = String(row.status || 'unknown');
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    const method = String(row.method || 'unknown');
    methodCounts.set(method, (methodCounts.get(method) || 0) + 1);
    const score = Number(row.riskScore || 0);
    const bucket = score >= 80 ? 'High (80–100)' : score >= 40 ? 'Medium (40–79)' : 'Low (0–39)';
    riskBuckets.set(bucket, (riskBuckets.get(bucket) || 0) + 1);
    for (const signal of Array.isArray(row.riskSignals) ? row.riskSignals : []) {
      riskSignals.set(signal, (riskSignals.get(signal) || 0) + 1);
    }
    if (status === 'pending') pending++;
  }

  const terminal = totals.verified + totals.failed + totals.expired;
  const verificationRate = terminal > 0 ? Math.round((totals.verified / terminal) * 1000) / 10 : 0;
  const previousTerminal = previousTotals.verified + previousTotals.failed + previousTotals.expired;
  const previousRate = previousTerminal > 0 ? Math.round((previousTotals.verified / previousTerminal) * 1000) / 10 : 0;

  const currentMonthUsage = await (async () => {
    const ref = adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(isoMonth());
    const snap = await ref.get();
    return snap.exists ? { id: snap.id, ...snap.data() } : { id: isoMonth(), month: isoMonth(), verificationRequests: 0, emailRequests: 0, phoneRequests: 0 };
  })();

  const limit = plan?.verificationLimit == null ? null : Number(plan.verificationLimit);
  const used = Number(currentMonthUsage.verificationRequests || 0);
  const remaining = limit == null ? null : Math.max(0, limit - used);
  const usagePercent = limit == null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 1000) / 10);

  return {
    range: { days, start: start.toISOString(), end: end.toISOString(), previousStart: previousStart.toISOString(), previousEnd: previousEnd.toISOString() },
    environment,
    analyticsSource,
    plan: plan ? { id: plan.id, name: plan.name, verificationLimit: plan.verificationLimit, featureFlags: plan.featureFlags } : null,
    totals: {
      ...totals,
      pending,
      verificationRate,
      highRiskRate: totals.requests > 0 ? Math.round((totals.highRisk / totals.requests) * 1000) / 10 : 0,
      disposableRate: totals.requests > 0 ? Math.round((totals.disposable / totals.requests) * 1000) / 10 : 0,
    },
    comparison: {
      requests: percentChange(totals.requests, previousTotals.requests),
      verified: percentChange(totals.verified, previousTotals.verified),
      failed: percentChange(totals.failed, previousTotals.failed),
      verificationRatePoints: Math.round((verificationRate - previousRate) * 10) / 10,
    },
    previousTotals,
    methodOutcomes: ['email','phone'].map(method => {
      const cohort=details.filter(row=>row.method===method);
      return {method,requests:cohort.length,verified:cohort.filter(row=>row.status==='verified').length,failed:cohort.filter(row=>row.status==='failed').length,expired:cohort.filter(row=>row.status==='expired').length,pending:cohort.filter(row=>row.status==='pending').length};
    }),
    usage: {
      month: isoMonth(),
      used,
      limit,
      remaining,
      percent: usagePercent,
      emailRequests: Number(currentMonthUsage.emailRequests || 0),
      phoneRequests: Number(currentMonthUsage.phoneRequests || 0),
    },
    series,
    methodBreakdown: [...methodCounts.entries()].map(([label, value]) => ({ label, value })),
    statusBreakdown: [...statusCounts.entries()].map(([label, value]) => ({ label, value })),
    riskBreakdown: [...riskBuckets.entries()].map(([label, value]) => ({ label, value })),
    topRiskSignals: [...riskSignals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })),
    recentRequests: details.slice(0, 20),
    detailTruncated: detailResult.truncated,
  };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildVerificationCsv(analytics) {
  const rows = [
    ['date', 'environment', 'requests', 'email_requests', 'phone_requests', 'verified', 'failed', 'expired', 'high_risk', 'disposable'],
  ];
  for (const row of analytics.series) {
    rows.push([
      row.day,
      analytics.environment,
      row.requests,
      row.emailRequests,
      row.phoneRequests,
      row.verified,
      row.failed,
      row.expired,
      row.highRisk,
      row.disposable,
    ]);
  }
  rows.push([]);
  rows.push(['metric', 'value']);
  rows.push(['verification_rate_percent', analytics.totals.verificationRate]);
  rows.push(['high_risk_rate_percent', analytics.totals.highRiskRate]);
  rows.push(['disposable_rate_percent', analytics.totals.disposableRate]);
  rows.push(['quota_used', analytics.usage.used]);
  rows.push(['quota_limit', analytics.usage.limit == null ? 'unlimited' : analytics.usage.limit]);
  rows.push(['quota_remaining', analytics.usage.remaining == null ? 'unlimited' : analytics.usage.remaining]);
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

module.exports = {
  incrementDailyStats,
  recordVerificationCreated,
  recordVerificationStatus,
  getWorkspaceAnalytics,
  buildVerificationCsv,
  parseRange,
};
