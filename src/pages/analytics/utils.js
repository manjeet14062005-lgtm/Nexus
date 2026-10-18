export function clamp(value, min, max) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : min;
  return Math.min(max, Math.max(min, safe));
}

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function formatCompact(value) {
  const number = finiteNumber(value, 0);
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(number) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(number) >= 1000 ? 1 : 0,
  }).format(number);
}

export function formatInteger(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(finiteNumber(value, 0));
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(digits)}%`;
}

export function formatDelta(value, suffix = "%") {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1)}${suffix}`;
}

export function safeRate(numerator, denominator) {
  const top = finiteNumber(numerator, 0);
  const bottom = finiteNumber(denominator, 0);
  if (bottom <= 0) return null;
  return (top / bottom) * 100;
}

export function quotaPercent(used, limit) {
  if (limit === null || limit === undefined) return null;
  const safeLimit = finiteNumber(limit, 0);
  if (safeLimit <= 0) return null;
  return clamp((finiteNumber(used, 0) / safeLimit) * 100, 0, 100);
}

export function quotaTone(percent) {
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) return "unlimited";
  const value = Number(percent);
  if (value >= 90) return "danger";
  if (value >= 70) return "warning";
  return "success";
}

// Returns a semantic interpolation recipe rather than a display color so the
// component can resolve the recipe against theme CSS variables in OKLCH.
// 0→70% blends success→warning, 70→90% warning→danger, then holds danger.
export function thresholdColorInterpolation(percent) {
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) {
    return { from: "primary", to: "primary", mix: 0 };
  }
  const value = clamp(Number(percent), 0, 100);
  if (value <= 70) {
    return { from: "success", to: "warning", mix: (value / 70) * 100 };
  }
  if (value <= 90) {
    return { from: "warning", to: "danger", mix: ((value - 70) / 20) * 100 };
  }
  return { from: "danger", to: "danger", mix: 100 };
}

export function paceProjection(usage, now = new Date()) {
  if (!usage || !usage.month) return null;
  const match = String(usage.month).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year !== now.getFullYear() || monthIndex !== now.getMonth()) return null;
  const day = Math.max(1, now.getDate());
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const projected = Math.round((finiteNumber(usage.used, 0) / day) * daysInMonth);
  return Number.isFinite(projected) ? Math.max(0, projected) : null;
}

export function normalizeBreakdown(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === null || item === undefined) return { label: `Item ${index + 1}`, value: 0 };
      if (typeof item !== "object") return { label: String(item), value: 0 };
      const label = item.label ?? item.name ?? item.key ?? item.signal ?? item.status ?? item.method ?? item.risk ?? item.bucket ?? `Item ${index + 1}`;
      const amount = item.value ?? item.count ?? item.requests ?? item.total ?? 0;
      return { ...item, label: String(label), value: Math.max(0, finiteNumber(amount, 0)) };
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([label, amount]) => ({ label, value: Math.max(0, finiteNumber(amount, 0)) }));
  }
  return [];
}

export function linearScale(domain, range) {
  const d0 = finiteNumber(domain?.[0], 0);
  const d1 = finiteNumber(domain?.[1], 1);
  const r0 = finiteNumber(range?.[0], 0);
  const r1 = finiteNumber(range?.[1], 1);
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  const factor = (r1 - r0) / span;
  return (value) => r0 + (finiteNumber(value, d0) - d0) * factor;
}

function niceStep(span, targetCount) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, targetCount);
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  const factor = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
  return factor * power;
}

export function niceTicks(min, max, count = 5) {
  let low = finiteNumber(min, 0);
  let high = finiteNumber(max, 0);
  if (high < low) [low, high] = [high, low];
  if (high === low) {
    if (high === 0) return [0];
    low = Math.min(0, high);
  }
  const step = niceStep(high - low, Math.max(2, count - 1));
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(12)));
    if (ticks.length > 50) break;
  }
  return ticks;
}

function slope3(p0, p1, p2) {
  const h0 = p1.x - p0.x;
  const h1 = p2.x - p1.x;
  if (h0 === 0 || h1 === 0) return 0;
  const s0 = (p1.y - p0.y) / h0;
  const s1 = (p2.y - p1.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  const sign = (s0 < 0 ? -1 : 1) + (s1 < 0 ? -1 : 1);
  if (sign === 0 || s0 === 0 || s1 === 0) return 0;
  return sign * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
}

function slope2(p0, p1, tangent) {
  const h = p1.x - p0.x;
  if (h === 0) return 0;
  const slope = (p1.y - p0.y) / h;
  return (3 * slope - tangent) / 2;
}

export function monotonePath(points) {
  const rows = Array.isArray(points) ? points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : [];
  if (!rows.length) return "";
  if (rows.length === 1) return `M${rows[0].x},${rows[0].y}`;
  if (rows.length === 2) return `M${rows[0].x},${rows[0].y}L${rows[1].x},${rows[1].y}`;

  let tangent = slope2(rows[0], rows[1], slope3(rows[0], rows[1], rows[2]));
  let path = `M${rows[0].x},${rows[0].y}`;
  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    const nextTangent = index === rows.length - 2
      ? slope2(next, current, tangent)
      : slope3(current, next, rows[index + 2]);
    const dx = (next.x - current.x) / 3;
    path += `C${current.x + dx},${current.y + dx * tangent},${next.x - dx},${next.y - dx * nextTangent},${next.x},${next.y}`;
    tangent = nextTangent;
  }
  return path;
}

export function areaPath(points, baseline) {
  if (!Array.isArray(points) || !points.length) return "";
  const line = monotonePath(points);
  if (!line) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${line}L${last.x},${baseline}L${first.x},${baseline}Z`;
}

export function findZScoreOutliers(series, key = "requests", threshold = 2) {
  const rows = Array.isArray(series) ? series : [];
  if (rows.length < 3) return [];
  const values = rows.map((row) => finiteNumber(row?.[key], 0));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  if (!Number.isFinite(deviation) || deviation === 0) return [];
  return rows.reduce((outliers, row, index) => {
    const value = values[index];
    const zScore = (value - mean) / deviation;
    if (Math.abs(zScore) > threshold) outliers.push({ index, day: row?.day, value, zScore });
    return outliers;
  }, []);
}

export function methodVerificationRate(totals, method) {
  const prefix = String(method || "").toLowerCase() === "phone" ? "phone" : "email";
  const verified = finiteNumber(totals?.[`${prefix}Verified`], 0);
  const failed = finiteNumber(totals?.[`${prefix}Failed`], 0);
  const expired = finiteNumber(totals?.[`${prefix}Expired`], 0);
  return safeRate(verified, verified + failed + expired);
}

export function aggregateSeries(series, startIndex = 0, endIndex = null) {
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) {
    return {
      rows: [], requests: 0, verified: 0, failed: 0, expired: 0,
      emailRequests: 0, phoneRequests: 0, verificationRate: null,
    };
  }
  const start = clamp(startIndex, 0, rows.length - 1);
  const end = clamp(endIndex === null || endIndex === undefined ? rows.length - 1 : endIndex, start, rows.length - 1);
  const selected = rows.slice(start, end + 1);
  const totals = selected.reduce((acc, row) => {
    acc.requests += finiteNumber(row?.requests, 0);
    acc.verified += finiteNumber(row?.verified, 0);
    acc.failed += finiteNumber(row?.failed, 0);
    acc.expired += finiteNumber(row?.expired, 0);
    acc.emailRequests += finiteNumber(row?.emailRequests, 0);
    acc.phoneRequests += finiteNumber(row?.phoneRequests, 0);
    return acc;
  }, { requests: 0, verified: 0, failed: 0, expired: 0, emailRequests: 0, phoneRequests: 0 });
  return {
    ...totals,
    verificationRate: safeRate(totals.verified, totals.verified + totals.failed + totals.expired),
    rows: selected,
    startIndex: start,
    endIndex: end,
  };
}

export function normalizeBrushRange(range, length) {
  if (!Number.isFinite(length) || length <= 0) return null;
  if (!range) return { start: 0, end: length - 1 };
  const a = clamp(range.start, 0, length - 1);
  const b = clamp(range.end, 0, length - 1);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function brushRangeFromPixels(startX, endX, width, length) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(length) || length <= 0) return null;
  const toIndex = (x) => Math.round(clamp(x / width, 0, 1) * Math.max(0, length - 1));
  const start = toIndex(startX);
  const end = toIndex(endX);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function isFullRange(range, length) {
  const normalized = normalizeBrushRange(range, length);
  return Boolean(normalized && normalized.start === 0 && normalized.end === Math.max(0, length - 1));
}

export function resampleValues(values, count = 96) {
  const rows = Array.isArray(values) ? values.map((value) => finiteNumber(value, 0)) : [];
  if (!rows.length || count <= 0) return [];
  if (rows.length === 1) return Array.from({ length: count }, () => rows[0]);
  if (count === 1) return [rows[0]];
  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (rows.length - 1);
    const left = Math.floor(position);
    const right = Math.min(rows.length - 1, Math.ceil(position));
    const t = position - left;
    return rows[left] + (rows[right] - rows[left]) * t;
  });
}

export function buildHeadline(analytics) {
  const totals = analytics?.totals;
  if (!totals || finiteNumber(totals.requests, 0) === 0) return "No verification requests were recorded for the selected period.";
  const rate = formatPercent(totals.verificationRate, 1);
  const requests = formatInteger(totals.requests);
  const rawPoints = analytics?.comparison?.verificationRatePoints;
  const points = rawPoints === null || rawPoints === undefined ? null : Number(rawPoints);
  if (Number.isFinite(points) && points !== 0) {
    const direction = points > 0 ? "up" : "down";
    return `Verification rate is ${rate} across ${requests} requests, ${direction} ${Math.abs(points).toFixed(1)} points versus the previous period.`;
  }
  return `${rate} of completed verification outcomes were verified across ${requests} requests in this period.`;
}

function formatInsightDay(day) {
  if (!day) return "Unknown day";
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(day);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function deriveSignalDays(series) {
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) return { bestDay: null, failureDay: null, peakDay: null };
  const peakDay = rows.reduce((best, row) => finiteNumber(row?.requests, 0) > finiteNumber(best?.requests, -1) ? row : best, null);
  const failureDay = rows.reduce((best, row) => finiteNumber(row?.failed, 0) > finiteNumber(best?.failed, -1) ? row : best, null);
  const bestDay = rows
    .map((row) => {
      const verified = finiteNumber(row?.verified, 0);
      const failed = finiteNumber(row?.failed, 0);
      const expired = finiteNumber(row?.expired, 0);
      const completed = verified + failed + expired;
      return { row, completed, rate: safeRate(verified, completed) };
    })
    .filter((entry) => entry.completed > 0 && entry.rate !== null)
    .reduce((best, entry) => !best || entry.rate > best.rate ? entry : best, null);
  return { bestDay, failureDay, peakDay };
}

export function buildInsights(analytics) {
  const series = Array.isArray(analytics?.series) ? analytics.series : [];
  const insights = [];
  const signals = deriveSignalDays(series);
  if (signals.peakDay && finiteNumber(signals.peakDay.requests, 0) > 0) {
    insights.push({ title: "Peak volume", body: `${formatInsightDay(signals.peakDay.day)} recorded ${formatInteger(signals.peakDay.requests)} requests.`, tone: "primary" });
  }
  if (signals.bestDay) {
    insights.push({ title: "Best verification day", body: `${formatInsightDay(signals.bestDay.row.day)} reached ${formatPercent(signals.bestDay.rate, 1)} across ${formatInteger(signals.bestDay.completed)} completed outcomes.`, tone: "success" });
  }
  if (signals.failureDay && finiteNumber(signals.failureDay.failed, 0) > 0) {
    insights.push({ title: "Highest failure day", body: `${formatInsightDay(signals.failureDay.day)} recorded ${formatInteger(signals.failureDay.failed)} failed requests.`, tone: "danger" });
  }
  const rawPoints = analytics?.comparison?.verificationRatePoints;
  const points = rawPoints === null || rawPoints === undefined ? null : Number(rawPoints);
  if (Number.isFinite(points)) {
    insights.push({ title: "Rate movement", body: `${formatDelta(points, " pts")} versus the previous period.`, tone: points > 0 ? "success" : points < 0 ? "danger" : "neutral" });
  }
  return insights.slice(0, 4);
}

export function requestMatchesSearch(request, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;
  return [request?.id, request?.method, request?.status, request?.environment, request?.riskScore, request?.createdAt]
    .filter((value) => value !== null && value !== undefined)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function sortRequests(rows, key, direction = "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    let a = left?.[key];
    let b = right?.[key];
    if (key === "riskScore") {
      a = finiteNumber(a, -Infinity);
      b = finiteNumber(b, -Infinity);
    } else if (key === "createdAt") {
      a = a ? new Date(a).getTime() : 0;
      b = b ? new Date(b).getTime() : 0;
    } else {
      a = String(a ?? "").toLowerCase();
      b = String(b ?? "").toLowerCase();
    }
    if (a < b) return -1 * sign;
    if (a > b) return 1 * sign;
    return 0;
  });
}

export function requestDay(request) {
  if (!request?.createdAt) return "";
  const date = new Date(request.createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fuzzyScore(query, text) {
  const needle = String(query || "").trim().toLowerCase();
  const haystack = String(text || "").toLowerCase();
  if (!needle) return 1;
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);
  let cursor = 0;
  let score = 0;
  for (let index = 0; index < haystack.length && cursor < needle.length; index += 1) {
    if (haystack[index] === needle[cursor]) {
      score += index === 0 || haystack[index - 1] === " " ? 4 : 1;
      cursor += 1;
    }
  }
  return cursor === needle.length ? score : 0;
}

export function fuzzyFilterCommands(commands, query) {
  const rows = Array.isArray(commands) ? commands : [];
  const needle = String(query || "").trim();
  if (!needle) return rows;
  return rows
    .map((command) => ({ command, score: fuzzyScore(needle, `${command.group || ""} ${command.label || ""} ${command.keywords || ""}`) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}

export function odometerDigits(value, formatter = formatInteger) {
  return String(formatter(value)).split("");
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return 0;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function normalizeMotionLevel(value, fallback = "full") {
  const candidate = String(value || "").toLowerCase();
  return ["full", "reduced", "off"].includes(candidate) ? candidate : fallback;
}

export function motionLevelReducer(level, action) {
  const current = normalizeMotionLevel(level);
  if (typeof action === "string") return normalizeMotionLevel(action, current);
  if (action?.type === "SET") return normalizeMotionLevel(action.value, current);
  if (action?.type === "DEGRADE" && current === "full") return "reduced";
  return current;
}

export function framePerformanceDecision(samples, thresholdMs = 24) {
  const rows = Array.isArray(samples) ? samples.filter((value) => Number.isFinite(value) && value > 0) : [];
  if (!rows.length) return { average: 0, reduce: false };
  const average = rows.reduce((sum, value) => sum + value, 0) / rows.length;
  return { average, reduce: average > thresholdMs };
}
