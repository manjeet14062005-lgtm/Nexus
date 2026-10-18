import {
  aggregateSeries,
  areaPath,
  brushRangeFromPixels,
  contrastRatio,
  findZScoreOutliers,
  formatCompact,
  framePerformanceDecision,
  fuzzyFilterCommands,
  linearScale,
  methodVerificationRate,
  monotonePath,
  motionLevelReducer,
  niceTicks,
  normalizeBreakdown,
  paceProjection,
  quotaPercent,
  quotaTone,
  resampleValues,
  safeRate,
  thresholdColorInterpolation,
} from "./utils.js";
import { ANALYTICS_CONTRAST_PAIRS } from "./tokens.js";

describe("analytics pure helpers", () => {
  test("formats compact values without fabricating decimals for small counts", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(1200)).toMatch(/1(?:\.2)?K/i);
    expect(formatCompact(987654321)).toBeTruthy();
  });

  test("rate and quota helpers handle zero and unlimited data safely", () => {
    expect(safeRate(0, 0)).toBeNull();
    expect(methodVerificationRate({}, "email")).toBeNull();
    expect(quotaPercent(0, 0)).toBeNull();
    expect(quotaPercent(50, null)).toBeNull();
    expect(quotaPercent(120, 100)).toBe(100);
    expect(quotaTone(null)).toBe("unlimited");
    expect(quotaTone(69.9)).toBe("success");
    expect(quotaTone(70)).toBe("warning");
    expect(quotaTone(90)).toBe("danger");
  });

  test("quota threshold interpolation moves success to warning to danger", () => {
    expect(thresholdColorInterpolation(null)).toEqual({ from: "primary", to: "primary", mix: 0 });
    expect(thresholdColorInterpolation(0)).toEqual({ from: "success", to: "warning", mix: 0 });
    expect(thresholdColorInterpolation(70)).toEqual({ from: "success", to: "warning", mix: 100 });
    expect(thresholdColorInterpolation(80)).toEqual({ from: "warning", to: "danger", mix: 50 });
    expect(thresholdColorInterpolation(90)).toEqual({ from: "warning", to: "danger", mix: 100 });
    expect(thresholdColorInterpolation(100)).toEqual({ from: "danger", to: "danger", mix: 100 });
  });

  test("method verification rate uses completed method outcomes only", () => {
    expect(methodVerificationRate({ emailVerified: 8, emailFailed: 1, emailExpired: 1 }, "email")).toBe(80);
  });

  test("z-score helper marks only statistical outliers", () => {
    const rows = [1, 1, 1, 1, 1, 12].map((requests, index) => ({ day: `2026-01-0${index + 1}`, requests }));
    const outliers = findZScoreOutliers(rows, "requests", 2);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].value).toBe(12);
  });

  test("linear scale maps endpoints and nice ticks include zero", () => {
    const scale = linearScale([0, 10], [0, 100]);
    expect(scale(0)).toBe(0);
    expect(scale(5)).toBe(50);
    expect(scale(10)).toBe(100);
    expect(niceTicks(0, 87, 5)[0]).toBe(0);
  });

  test("monotone and area paths handle zero, one, and multiple points", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M1,2");
    const path = monotonePath([{ x: 0, y: 10 }, { x: 50, y: 4 }, { x: 100, y: 8 }]);
    expect(path.startsWith("M0,10C")).toBe(true);
    expect(areaPath([{ x: 0, y: 10 }, { x: 50, y: 4 }, { x: 100, y: 8 }], 20).endsWith("Z")).toBe(true);
  });

  test("normalizes all-zero breakdowns", () => {
    expect(normalizeBreakdown({ Low: 0, Medium: 0, High: 0 })).toEqual([
      { label: "Low", value: 0 },
      { label: "Medium", value: 0 },
      { label: "High", value: 0 },
    ]);
  });

  test("pace projection only exists for the current month", () => {
    const now = new Date(2026, 9, 10, 12, 0, 0);
    expect(paceProjection({ month: "2026-10", used: 100 }, now)).toBe(310);
    expect(paceProjection({ month: "2026-09", used: 100 }, now)).toBeNull();
    expect(paceProjection({ month: "2026-10", used: 0 }, now)).toBe(0);
  });

  test("selected-window aggregation uses only real daily rows", () => {
    const series = [
      { requests: 10, verified: 7, failed: 2, expired: 1, emailRequests: 6, phoneRequests: 4 },
      { requests: 20, verified: 15, failed: 3, expired: 2, emailRequests: 11, phoneRequests: 9 },
      { requests: 30, verified: 18, failed: 8, expired: 4, emailRequests: 17, phoneRequests: 13 },
    ];
    const result = aggregateSeries(series, 1, 2);
    expect(result.requests).toBe(50);
    expect(result.verified).toBe(33);
    expect(result.rows).toHaveLength(2);
    expect(result.verificationRate).toBeCloseTo(66, 5);
  });

  test("brush math is clamped and order independent", () => {
    expect(brushRangeFromPixels(80, 20, 100, 11)).toEqual({ start: 2, end: 8 });
    expect(brushRangeFromPixels(-20, 200, 100, 11)).toEqual({ start: 0, end: 10 });
  });

  test("resampling handles one day and large series", () => {
    expect(resampleValues([7], 4)).toEqual([7, 7, 7, 7]);
    const values = Array.from({ length: 365 }, (_, index) => index);
    const sampled = resampleValues(values, 96);
    expect(sampled).toHaveLength(96);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(364);
  });

  test("fuzzy command search supports ordered character matches", () => {
    const commands = [
      { id: "refresh", label: "Refresh analytics", group: "Actions" },
      { id: "range-30", label: "Range 30 days", group: "Range" },
    ];
    expect(fuzzyFilterCommands(commands, "rfr")[0].id).toBe("refresh");
  });

  test("motion reducer and frame monitor degrade safely", () => {
    expect(motionLevelReducer("full", { type: "DEGRADE" })).toBe("reduced");
    expect(motionLevelReducer("off", { type: "DEGRADE" })).toBe("off");
    expect(framePerformanceDecision([16, 18, 20], 24).reduce).toBe(false);
    expect(framePerformanceDecision([28, 30, 26], 24).reduce).toBe(true);
  });

  test("all declared body/semantic contrast pairs meet AA", () => {
    ANALYTICS_CONTRAST_PAIRS.forEach((pair) => {
      expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(pair.minimum);
    });
  });
});
