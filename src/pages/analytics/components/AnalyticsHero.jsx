import { useMemo, useRef } from "react";
import { Box, Chip, Typography } from "@mui/material";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import { motion } from "motion/react";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { DeltaBadge, RateRing } from "./MetricPrimitives.jsx";
import { buildHeadline, deriveSignalDays, finiteNumber, formatInteger, formatPercent } from "../utils.js";
import { useAmbientSlot, useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";
import { entranceProps } from "../motion/presets.js";

function dayLabel(day) {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(day);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function SignalChip({ icon, label, value, tone = "var(--an-primary)" }) {
  return (
    <Box sx={{ minHeight: 54, px: 1.15, py: .85, borderRadius: 2, border: "1px solid var(--an-border)", background: "color-mix(in oklch,var(--an-surface-raised) 94%,transparent)", display: "flex", alignItems: "center", gap: .8 }}>
      <Box sx={{ width: 30, height: 30, flexShrink: 0, borderRadius: 1.5, display: "grid", placeItems: "center", color: tone, background: `color-mix(in oklch,${tone} 8%,transparent)`, border: `1px solid color-mix(in oklch,${tone} 14%,transparent)` }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 9.5, fontWeight: 820, letterSpacing: ".075em", textTransform: "uppercase", color: "var(--an-text-3)" }}>{label}</Typography>
        <Typography sx={{ mt: .12, fontSize: 11.5, fontWeight: 790, color: "var(--an-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</Typography>
      </Box>
    </Box>
  );
}

export function AnalyticsHero({ analytics, refreshing, showingStaleSelection }) {
  const { level } = useAnalyticsMotion();
  const heroRef = useRef(null);
  const ambientEnabled = useAmbientSlot(heroRef, true);
  const totals = analytics?.totals || {};
  const rate = finiteNumber(totals.verificationRate, 0);
  const rawDeltaPoints = analytics?.comparison?.verificationRatePoints;
  const deltaPoints = rawDeltaPoints === null || rawDeltaPoints === undefined ? null : Number(rawDeltaPoints);
  const signals = useMemo(() => deriveSignalDays(analytics?.series || []), [analytics?.series]);
  const bestValue = signals.bestDay
    ? `${dayLabel(signals.bestDay.row.day)} · ${formatPercent(signals.bestDay.rate, 1)}`
    : "No completed outcomes";
  const failureValue = signals.failureDay && finiteNumber(signals.failureDay.failed, 0) > 0
    ? `${dayLabel(signals.failureDay.day)} · ${formatInteger(signals.failureDay.failed)} failed`
    : "No failures recorded";
  const changeValue = Number.isFinite(deltaPoints) ? `${deltaPoints > 0 ? "+" : ""}${deltaPoints.toFixed(1)} pts` : "Comparison unavailable";

  return (
    <AnalyticsSurface
      ref={heroRef}
      component={motion.section}
      {...entranceProps(level, .03)}
      accent="var(--an-gold)"
      interactive
      sx={{
        p: { xs: 2.2, sm: 2.8, lg: 3.2 },
        minHeight: { xs: 390, md: 306 },
        background: "linear-gradient(135deg,color-mix(in oklch,var(--an-surface) 98%,var(--an-gold) 2%),color-mix(in oklch,var(--an-surface) 96%,var(--an-primary) 4%))",
        boxShadow: "var(--an-shadow-3), var(--an-inner-highlight)",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: -1,
          background: "radial-gradient(58% 90% at 0% 0%,color-mix(in oklch,var(--an-gold) 11%,transparent),transparent 70%),radial-gradient(55% 95% at 100% 100%,color-mix(in oklch,var(--an-primary) 9%,transparent),transparent 72%)",
        },
        ...(ambientEnabled ? {
          "&::after": {
            content: '""',
            position: "absolute",
            inset: "-20%",
            pointerEvents: "none",
            background: "linear-gradient(112deg,transparent 36%,color-mix(in oklch,var(--an-gold) 11%,white 8%) 49%,transparent 62%)",
            transform: "translateX(-85%)",
            animation: "analyticsHeroShimmer 8s cubic-bezier(.22,1,.36,1) infinite",
          },
        } : {}),
      }}
    >
      <Box sx={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) auto" }, gap: { xs: 2.5, md: 4 }, alignItems: "center" }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: .8, flexWrap: "wrap", mb: 1.5 }}>
            <Chip
              icon={<AutoGraphRoundedIcon sx={{ fontSize: "15px !important" }} />}
              label="ANALYTICS CONTROL PLANE"
              size="small"
              sx={{ height: 28, borderRadius: 99, fontSize: 9.5, fontWeight: 900, letterSpacing: ".12em", color: "var(--an-primary-fg)", background: "color-mix(in oklch,var(--an-primary) 7%,transparent)", border: "1px solid color-mix(in oklch,var(--an-primary) 14%,transparent)", "& .MuiChip-icon": { color: "var(--an-primary)" } }}
            />
            {analytics?.plan?.name && (
              <Chip label={analytics.plan.name} size="small" sx={{ height: 28, borderRadius: 99, fontSize: 10, fontWeight: 800, color: "var(--an-gold-fg)", background: "color-mix(in oklch,var(--an-gold) 8%,transparent)", border: "1px solid color-mix(in oklch,var(--an-gold) 16%,transparent)" }} />
            )}
          </Box>

          <Typography sx={{ fontSize: "clamp(2rem,4vw,3.35rem)", lineHeight: .98, fontWeight: 930, letterSpacing: "-.055em", color: "var(--an-text)" }}>Verification analytics</Typography>
          <Typography sx={{ mt: 1.25, maxWidth: 760, color: "var(--an-text-2)", fontSize: { xs: 14, sm: 15.5 }, lineHeight: 1.72 }}>{buildHeadline(analytics)}</Typography>

          <Box sx={{ mt: 2.1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            {Number.isFinite(deltaPoints) && <DeltaBadge value={deltaPoints} suffix=" pts" mode="rate" label="vs previous" celebrate />}
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: .6, color: "var(--an-text-3)" }}>
              <BoltRoundedIcon sx={{ fontSize: 16, color: "var(--an-primary-fg)" }} />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{formatInteger(totals.requests)} requests in the selected period</Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,minmax(0,1fr))" }, gap: .75, maxWidth: 760 }}>
            <SignalChip icon={<CalendarTodayRoundedIcon sx={{ fontSize: 16 }} />} label="Best day · derived" value={bestValue} tone="var(--an-success)" />
            <SignalChip icon={<ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />} label="Most failures" value={failureValue} tone="var(--an-danger)" />
            <SignalChip icon={<TrendingUpRoundedIcon sx={{ fontSize: 16 }} />} label="Rate change" value={changeValue} tone={Number.isFinite(deltaPoints) && deltaPoints < 0 ? "var(--an-danger)" : "var(--an-gold-fg)"} />
          </Box>

          {(refreshing || showingStaleSelection) && (
            <Box sx={{ mt: 1.5, display: "inline-flex", alignItems: "center", gap: .8, color: "var(--an-text-3)" }}>
              <Box
                component={motion.span}
                animate={level === "full" ? { opacity: [.35, 1, .35] } : undefined}
                transition={level === "full" ? { duration: 1.2, repeat: Infinity } : undefined}
                sx={{ width: 7, height: 7, borderRadius: "50%", background: "var(--an-primary)" }}
              />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{showingStaleSelection ? "Refreshing the new selection; previous data remains visible." : "Refreshing analytics…"}</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: "grid", placeItems: "center", pr: { md: 1.5 } }}>
          <RateRing value={rate} heroFigure ambient={ambientEnabled} />
        </Box>
      </Box>
    </AnalyticsSurface>
  );
}
