import { memo } from "react";
import { Box, Tooltip } from "@mui/material";
import { NEON } from "../../constants/theme";



export const BarChart = memo(function BarChart({ data, color = NEON.blue, height = 70 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height }}>
      {data.map((d, i) => (
        <Tooltip key={i} title={`${d.label}: ${d.value}`} arrow>
          <Box sx={{
            flex: 1, borderRadius: "3px 3px 0 0",
            background: `linear-gradient(180deg,${color},${color}55)`,
            height: `${(d.value / max) * 100}%`, minHeight: 3,
            transition: "height 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            cursor: "pointer",
            "&:hover": { filter: "brightness(1.4)", boxShadow: `0 0 8px ${color}` },
          }} />
        </Tooltip>
      ))}
    </Box>
  );
});

// Donut / Pie chart (SVG)
