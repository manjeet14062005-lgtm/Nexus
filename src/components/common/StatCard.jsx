import { memo } from "react";
import { Box, Chip, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";
import { GlassCard } from "./GlassCard.jsx";

export const StatCard = memo(function StatCard({ icon, label, value, color = NEON.blue, sub, trend, trendUp }) {
  return <GlassCard sx={{ p: { xs: 2, md: 2.5 }, height: "100%" }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2.5 }}>
      <Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 500 }}>{label}</Typography>
      {icon ? <Box sx={{ color, display: "flex", "& svg": { fontSize: 18 } }}>{icon}</Box> : <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />}
    </Box>
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 600, fontSize: { xs: 27, md: 34 }, lineHeight: 1, letterSpacing: "-.045em", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {trend !== undefined && <Chip size="small" label={trend} color={trendUp === false ? "error" : "success"} variant="outlined" sx={{ height: 22, fontSize: 10 }} />}
    </Box>
    {sub && <Typography sx={{ color: "text.secondary", fontSize: 12, mt: 1.25, lineHeight: 1.5 }}>{sub}</Typography>}
  </GlassCard>;
});
