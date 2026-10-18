import { memo } from "react";
import { Box } from "@mui/material";
import { NEON } from "../../constants/theme";



export const PulseDot = memo(function PulseDot({ color = NEON.green, size = 8 }) {
  return (
    <Box sx={{ position: "relative", width: size, height: size }}>
      <Box sx={{
        width: size, height: size, borderRadius: "50%", background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: "pulse 2s infinite",
        "@keyframes pulse": {
          "0%,100%": { transform: "scale(1)", opacity: 1 },
          "50%": { transform: "scale(1.3)", opacity: 0.7 },
        },
      }} />
    </Box>
  );
});

// Activity timeline
