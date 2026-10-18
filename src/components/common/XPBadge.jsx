import { memo } from "react";
import { Box, Chip, Typography } from "@mui/material";
import { XP_LEVELS } from "../../core/appConstants.js";
import * as G from "../../services/gamification.js";



export const XPBadge = memo(function XPBadge({ xp, size = "md" }) {
  const lvl = G.getLevel(xp);
  const next = XP_LEVELS.find((l) => l.min > xp) || lvl;
  const pct = lvl.level === 6 ? 100 : Math.round(((xp - lvl.min) / (next.min - lvl.min)) * 100);
  const isSmall = size === "sm";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: isSmall ? 1 : 1.5 }}>
      <Box sx={{
        width: isSmall ? 36 : 48, height: isSmall ? 36 : 48, borderRadius: "50%",
        background: `radial-gradient(circle, ${lvl.color}22, ${lvl.color}08)`,
        border: `2px solid ${lvl.color}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: isSmall ? 18 : 22, flexShrink: 0,
        boxShadow: `0 0 12px ${lvl.color}33`,
      }}>{lvl.icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: isSmall ? 11 : 13, color: lvl.color }}>{lvl.title}</Typography>
          <Chip label={`Lv.${lvl.level}`} size="small" sx={{ height: 16, fontSize: 9, background: `${lvl.color}18`, color: lvl.color }} />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 0.3 }}>
          <Box sx={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(15,23,42,0.08)", overflow: "hidden", minWidth: isSmall ? 60 : 80 }}>
            <Box sx={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: `linear-gradient(90deg,${lvl.color},${lvl.color}99)`, transition: "width 0.8s ease" }} />
          </Box>
          <Typography variant="caption" sx={{ fontSize: 9, opacity: 0.45, whiteSpace: "nowrap" }}>{xp} XP</Typography>
        </Box>
      </Box>
    </Box>
  );
});

// Full XP Tab content
