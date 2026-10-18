import { memo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { GLOW, NEON } from "../../constants/theme";



export const BadgeCard = memo(function BadgeCard({ icon, label, earned, color = NEON.orange, desc }) {
  return (
    <Tooltip title={desc || (earned ? `${label} — Earned!` : `${label} — Not yet earned`)} arrow>
      <Box sx={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5,
        p: 1.5, borderRadius: 2.5, cursor: "pointer",
        background: earned ? `${color}15` : "transparent",
        border: `1.5px solid ${earned ? color : "rgba(15,23,42,0.06)"}`,
        opacity: earned ? 1 : 0.4,
        transition: "opacity 160ms ease, transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease",
        "&:hover": { opacity: 1, transform: "scale(1.06)", boxShadow: GLOW(color) },
      }}>
        <Box sx={{ fontSize: 26 }}>{icon}</Box>
        <Typography variant="caption" sx={{ fontSize: 9, textAlign: "center", fontWeight: 700, letterSpacing: 0.3 }}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 3D GLOBE COMPONENT  (WebGL via Three.js CDN or CSS fallback)
// ═══════════════════════════════════════════════════════════════════════
