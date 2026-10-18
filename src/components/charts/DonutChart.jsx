import { memo } from "react";
import { Box, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { NEON } from "../../constants/theme";



export const DonutChart = memo(function DonutChart({ data, size = 130 }) {
  const COLORS = [NEON.blue, NEON.pink, NEON.green, NEON.orange, NEON.purple, NEON.teal];
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const r = 15.915;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox="0 0 42 42" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="21" cy="21" r={r} fill="transparent" stroke="rgba(15,23,42,0.04)" strokeWidth="4.5" />
        {data.map((d, i) => {
          if (!d.value) return null;
          const pct = (d.value / total) * 100;
          const offset = 100 - cumulative;
          cumulative += pct;
          return (
            <circle key={i} cx="21" cy="21" r={r} fill="transparent"
              stroke={COLORS[i % COLORS.length]} strokeWidth="4.5"
              strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset}
              style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 4px ${COLORS[i % COLORS.length]})` }}
            />
          );
        })}
        <circle cx="21" cy="21" r="10" fill="rgba(4,8,15,0.8)" />
      </svg>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {data.map((d, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
            <FiberManualRecordIcon sx={{ fontSize: 10, color: COLORS[i % COLORS.length] }} />
            <Typography variant="caption" sx={{ opacity: 0.7, fontSize: 11 }}>
              {d.label}: <strong>{d.value}</strong> ({total > 0 ? Math.round(d.value / total * 100) : 0}%)
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
});

// Line sparkline
