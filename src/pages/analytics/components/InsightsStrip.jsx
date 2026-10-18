import { Box, Typography } from "@mui/material";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import { motion } from "motion/react";
import { buildInsights } from "../utils.js";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";
import { entranceProps } from "../motion/presets.js";

const TONE_COLOR = {
  primary: "var(--an-primary)",
  success: "var(--an-success)",
  danger: "var(--an-danger)",
  neutral: "var(--an-text-3)",
};

export function InsightsStrip({ analytics }) {
  const insights = buildInsights(analytics);
  const { level } = useAnalyticsMotion();
  if (!insights.length) return null;

  return (
    <Box component="section" aria-label="Derived analytics insights" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: `repeat(${Math.min(4, insights.length)},minmax(0,1fr))` }, gap: 1 }}>
      {insights.map((insight, index) => {
        const color = TONE_COLOR[insight.tone] || TONE_COLOR.neutral;
        return (
          <AnalyticsSurface
            key={`${insight.title}-${index}`}
            component={motion.article}
            {...entranceProps(level, index * .045)}
            accent={color}
            interactive
            sx={{ p: 1.45, minHeight: 92, boxShadow: "none" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: .65 }}><InsightsRoundedIcon sx={{ fontSize: 16, color }} /><Typography sx={{ fontSize: 11.5, fontWeight: 840, color: "var(--an-text)" }}>{insight.title}</Typography></Box>
            <Typography variant="caption" sx={{ mt: .55, display: "block", color: "var(--an-text-2)", lineHeight: 1.55 }}>{insight.body}</Typography>
          </AnalyticsSurface>
        );
      })}
    </Box>
  );
}
