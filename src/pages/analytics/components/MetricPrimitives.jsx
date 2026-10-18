import { Box, Chip, Typography } from "@mui/material";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import ArrowDropUpRoundedIcon from "@mui/icons-material/ArrowDropUpRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import { motion } from "motion/react";
import { OdometerNumber } from "./AnimatedNumber.jsx";
import { clamp, formatDelta, monotonePath } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

export function DeltaBadge({ value, mode = "neutral", suffix = "%", label = "vs previous", celebrate = false }) {
  const { level } = useAnalyticsMotion();
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const positive = number > 0;
  const negative = number < 0;
  let tone = "var(--an-text-2)";
  let background = "color-mix(in oklch, var(--an-text-3) 9%, transparent)";

  if (mode === "failed") {
    if (positive) {
      tone = "var(--an-danger)";
      background = "var(--an-semantic-danger-bg)";
    } else if (negative) {
      tone = "var(--an-success)";
      background = "var(--an-semantic-success-bg)";
    }
  } else if (mode === "rate") {
    if (positive) {
      tone = "var(--an-success)";
      background = "var(--an-semantic-success-bg)";
    } else if (negative) {
      tone = "var(--an-danger)";
      background = "var(--an-semantic-danger-bg)";
    }
  } else if (positive || negative) {
    tone = "var(--an-primary)";
    background = "color-mix(in oklch, var(--an-primary) 8%, var(--an-surface))";
  }

  const Icon = positive ? ArrowDropUpRoundedIcon : negative ? ArrowDropDownRoundedIcon : RemoveRoundedIcon;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: "16px !important" }} />}
      label={`${formatDelta(number, suffix)} ${label}`}
      sx={{
        position: "relative",
        overflow: "hidden",
        height: 27,
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 800,
        color: tone,
        background,
        border: `1px solid color-mix(in oklch, ${tone} 18%, transparent)`,
        "& .MuiChip-icon": { color: tone },
        ...(celebrate && positive && level === "full" ? {
          "&::after": {
            content: '""',
            position: "absolute",
            inset: 0,
            transform: "translateX(-130%) skewX(-20deg)",
            background: "linear-gradient(90deg,transparent,color-mix(in oklch,var(--an-gold) 34%,white 10%),transparent)",
            animation: "analyticsEarnedSweep 850ms cubic-bezier(.22,1,.36,1) 350ms 1 both",
            pointerEvents: "none",
          },
        } : {}),
      }}
    />
  );
}

export function RateRing({ value, size = 188, stroke = 10, label = "Verification rate", heroFigure = false, ambient = null }) {
  const safe = clamp(value, 0, 100);
  const radius = 50 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const { level, ambientEnabled: contextAmbient } = useAnalyticsMotion();
  const ambientEnabled = ambient === null ? contextAmbient : Boolean(ambient);
  const ticks = Array.from({ length: 24 }, (_, index) => index);

  return (
    <Box sx={{ width: size, height: size, position: "relative", display: "grid", placeItems: "center", flexShrink: 0 }}>
      <Box component="svg" viewBox="0 0 100 100" role="img" aria-label={`${label}: ${safe.toFixed(1)} percent`} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          <linearGradient id="analyticsRateRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--an-gold)" />
            <stop offset="28%" stopColor="var(--an-primary)" />
            <stop offset="66%" stopColor="var(--an-primary-2)" />
            <stop offset="100%" stopColor="var(--an-success)" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const angle = (tick / ticks.length) * Math.PI * 2;
          const r1 = 38.4;
          const r2 = tick % 6 === 0 ? 41.4 : 40.2;
          return (
            <motion.line
              key={tick}
              x1={50 + Math.cos(angle) * r1}
              y1={50 + Math.sin(angle) * r1}
              x2={50 + Math.cos(angle) * r2}
              y2={50 + Math.sin(angle) * r2}
              stroke="var(--an-border-strong)"
              strokeWidth={tick % 6 === 0 ? 1.2 : .7}
              initial={level === "full" ? { opacity: .1 } : false}
              animate={{ opacity: tick / ticks.length <= safe / 100 ? .86 : .24 }}
              transition={level === "full" ? { duration: .25, delay: tick * .012 } : { duration: 0 }}
            />
          );
        })}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="color-mix(in oklch, var(--an-text-3) 11%, transparent)" strokeWidth={stroke} />
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#analyticsRateRing)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={level === "full" ? { strokeDashoffset: circumference } : false}
          animate={{ strokeDashoffset: circumference * (1 - safe / 100) }}
          transition={level === "off" ? { duration: 0 } : level === "reduced" ? { duration: .16 } : { type: "spring", stiffness: 180, damping: 25, mass: .9 }}
          style={{ filter: "drop-shadow(0 6px 12px color-mix(in oklch, var(--an-primary) 16%, transparent))" }}
        />
        {ambientEnabled && safe > 0 && (
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="color-mix(in oklch,var(--an-gold) 56%,transparent)"
            strokeWidth="1.2"
            strokeDasharray="2 23"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "50px 50px" }}
          />
        )}
      </Box>
      <Box sx={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <Typography
          component="div"
          sx={{
            fontSize: { xs: 38, sm: 45 },
            lineHeight: .96,
            fontWeight: 930,
            letterSpacing: "-.055em",
            fontVariantNumeric: "tabular-nums slashed-zero",
            color: "var(--an-text)",
            ...(heroFigure ? {
              background: "var(--an-brand-gradient)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              "@supports not (background-clip:text)": { color: "var(--an-text)", WebkitTextFillColor: "var(--an-text)" },
            } : {}),
          }}
        >
          <OdometerNumber value={safe} formatter={(number) => `${number.toFixed(1)}%`} />
        </Typography>
        <Typography variant="caption" sx={{ mt: .75, display: "block", color: "var(--an-text-3)", fontWeight: 760, letterSpacing: ".02em" }}>{label}</Typography>
      </Box>
    </Box>
  );
}

export function MiniSparkline({ values, color = "var(--an-primary)", height = 42, ariaLabel = "Metric trend", activeIndex = null }) {
  const rows = Array.isArray(values) ? values.map((value) => Number(value) || 0) : [];
  const width = 120;
  if (rows.length === 0) return <Box sx={{ height, width: "100%" }} aria-hidden="true" />;
  const min = Math.min(...rows);
  const max = Math.max(...rows);
  const span = max - min || 1;
  const points = rows.map((value, index) => ({
    x: rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width,
    y: height - 5 - ((value - min) / span) * (height - 10),
  }));
  const path = monotonePath(points);
  const last = points[points.length - 1];
  const active = activeIndex !== null && activeIndex >= 0 && activeIndex < points.length ? points[activeIndex] : null;

  return (
    <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: "100%", height, overflow: "visible" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" opacity=".88" />
      {last && <circle cx={last.x} cy={last.y} r="2.7" fill={color} />}
      {active && <circle cx={active.x} cy={active.y} r="4.1" fill="var(--an-surface)" stroke={color} strokeWidth="2" />}
    </Box>
  );
}
