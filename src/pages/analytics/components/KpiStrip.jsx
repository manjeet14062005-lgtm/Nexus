import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { motion } from "motion/react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { DeltaBadge, MiniSparkline } from "./MetricPrimitives.jsx";
import { OdometerNumber } from "./AnimatedNumber.jsx";
import { aggregateSeries, finiteNumber, formatCompact, formatPercent, isFullRange, normalizeBrushRange, safeRate } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";
import { entranceProps } from "../motion/presets.js";

function KpiCard({ title, value, subtitle, values, color, icon, delta, deltaMode, index, activeIndex, windowed }) {
  const { level } = useAnalyticsMotion();
  return (
    <AnalyticsSurface
      component={motion.article}
      {...entranceProps(level, index * .045)}
      accent={color}
      interactive
      sx={{ p: { xs: 1.6, sm: 2 }, minHeight: 176, boxShadow: "none", scrollSnapAlign: { xs: "start", md: "none" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: 1.8, display: "grid", placeItems: "center", color, background: `color-mix(in oklch, ${color} 8%, transparent)`, border: `1px solid color-mix(in oklch, ${color} 13%, transparent)` }}>{icon}</Box>
        {!windowed && delta !== undefined && delta !== null && <DeltaBadge value={delta} mode={deltaMode} />}
        {windowed && <Typography variant="caption" sx={{ px: .8, py: .35, borderRadius: 99, color: "var(--an-primary-fg)", fontWeight: 800, background: "color-mix(in oklch,var(--an-primary) 7%,transparent)", border: "1px solid color-mix(in oklch,var(--an-primary) 13%,transparent)" }}>Selected window</Typography>}
      </Box>

      <Typography sx={{ mt: 1.35, fontSize: { xs: 27, md: 31 }, lineHeight: 1, fontWeight: 920, letterSpacing: "-.045em", fontVariantNumeric: "tabular-nums slashed-zero", color: "var(--an-text)" }}>
        <OdometerNumber value={value} formatter={formatCompact} />
      </Typography>
      <Typography sx={{ mt: .55, fontSize: 12.2, fontWeight: 800, color: "var(--an-text)" }}>{title}</Typography>
      <Typography variant="caption" sx={{ mt: .15, display: "block", minHeight: 18, color: "var(--an-text-3)" }}>{subtitle}</Typography>
      <Box sx={{ mt: 1.1 }}><MiniSparkline values={values} color={color} activeIndex={activeIndex} ariaLabel={`${title} daily trend`} /></Box>
    </AnalyticsSurface>
  );
}

export function KpiStrip({ analytics, selectedRange, activeDay }) {
  const fullSeries = useMemo(() => Array.isArray(analytics?.series) ? analytics.series : [], [analytics?.series]);
  const normalized = normalizeBrushRange(selectedRange, fullSeries.length);
  const windowed = fullSeries.length > 0 && !isFullRange(normalized, fullSeries.length);
  const aggregate = useMemo(
    () => aggregateSeries(fullSeries, normalized?.start ?? 0, normalized?.end ?? fullSeries.length - 1),
    [fullSeries, normalized?.end, normalized?.start]
  );
  const totals = windowed ? aggregate : (analytics?.totals || {});
  const comparison = windowed ? {} : (analytics?.comparison || {});
  const series = windowed ? aggregate.rows : fullSeries;
  const activeIndex = activeDay ? series.findIndex((row) => row?.day === activeDay) : null;
  const expiredShare = safeRate(totals.expired, totals.requests);

  const cards = [
    {
      title: "Requests",
      value: finiteNumber(totals.requests, 0),
      subtitle: `${finiteNumber(totals.emailRequests, 0).toLocaleString()} email · ${finiteNumber(totals.phoneRequests, 0).toLocaleString()} phone`,
      values: series.map((row) => row.requests),
      color: "var(--an-primary)",
      icon: <TrendingUpRoundedIcon sx={{ fontSize: 18 }} />,
      delta: comparison.requests,
      deltaMode: "neutral",
    },
    {
      title: "Verified",
      value: finiteNumber(totals.verified, 0),
      subtitle: `${formatPercent(windowed ? aggregate.verificationRate : totals.verificationRate, 1)} verification rate`,
      values: series.map((row) => row.verified),
      color: "var(--an-success)",
      icon: <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />,
      delta: comparison.verified,
      deltaMode: "neutral",
    },
    {
      title: "Failed",
      value: finiteNumber(totals.failed, 0),
      subtitle: finiteNumber(totals.requests, 0) > 0 ? `${formatPercent(safeRate(totals.failed, totals.requests), 1)} of requests` : "No requests in period",
      values: series.map((row) => row.failed),
      color: "var(--an-danger)",
      icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 18 }} />,
      delta: comparison.failed,
      deltaMode: "failed",
    },
    {
      title: "Expired",
      value: finiteNumber(totals.expired, 0),
      subtitle: expiredShare === null ? "No requests in period" : `${formatPercent(expiredShare, 1)} of requests`,
      values: series.map((row) => row.expired),
      color: "var(--an-warning)",
      icon: <ScheduleRoundedIcon sx={{ fontSize: 18 }} />,
    },
  ];

  return (
    <Box
      sx={{
        display: { xs: "flex", md: "grid" },
        gridTemplateColumns: { md: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" },
        gap: 1.25,
        overflowX: { xs: "auto", md: "visible" },
        scrollSnapType: { xs: "x mandatory", md: "none" },
        pb: { xs: .5, md: 0 },
        mx: { xs: -1.25, md: 0 },
        px: { xs: 1.25, md: 0 },
        "& > *": { minWidth: { xs: "82vw", sm: "48vw", md: 0 } },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {cards.map((card, index) => <KpiCard key={card.title} {...card} index={index} activeIndex={activeIndex >= 0 ? activeIndex : null} windowed={windowed} />)}
    </Box>
  );
}
