function currentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function normalizeMonthKey(value, now = new Date()) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : currentMonthKey(now);
}

function buildMonthlyPeriod(monthKey, now = new Date()) {
  const key = normalizeMonthKey(monthKey, now);
  const [year, month] = key.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const resetsAt = new Date(Date.UTC(year, month, 1));
  const currentKey = currentMonthKey(now);
  const status = key === currentKey ? "current" : resetsAt <= now ? "expired" : "upcoming";

  return {
    key,
    start: start.toISOString(),
    resetsAt: resetsAt.toISOString(),
    status,
    isCurrent: status === "current",
  };
}

function summarizeVerificationUsage({ usage = {}, limit = null, monthKey, now = new Date() } = {}) {
  const used = Math.max(0, Number(usage?.verificationRequests || 0));
  const parsedLimit = limit == null ? null : Number(limit);
  const normalizedLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : null;
  const unlimited = normalizedLimit == null;
  const remaining = unlimited ? null : Math.max(0, normalizedLimit - used);
  const percent = unlimited || normalizedLimit === 0
    ? null
    : Math.min(100, Math.round((used / normalizedLimit) * 1000) / 10);

  return {
    used,
    limit: normalizedLimit,
    remaining,
    percent,
    unlimited,
    reached: !unlimited && used >= normalizedLimit,
    period: buildMonthlyPeriod(monthKey || usage?.month, now),
  };
}

module.exports = {
  currentMonthKey,
  normalizeMonthKey,
  buildMonthlyPeriod,
  summarizeVerificationUsage,
};
