import { memo } from "react";
import { Box, Grow, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";



export const Timeline = memo(function Timeline({ items }) {
  const typeColor = { user: NEON.green, edit: NEON.blue, delete: NEON.pink, export: NEON.orange, login: NEON.purple, admin: NEON.yellow };
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {items.map((item, i) => (
        <Grow in key={i} timeout={300 + i * 80}>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", background: typeColor[item.type] || NEON.blue, boxShadow: `0 0 8px ${typeColor[item.type] || NEON.blue}`, mt: 0.3 }} />
              {i < items.length - 1 && <Box sx={{ width: "1px", flex: 1, background: "rgba(99,102,241,0.1)", mt: 0.3, minHeight: 20 }} />}
            </Box>
            <Box sx={{ flex: 1, pb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, lineHeight: 1.4 }}>{item.text}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.35, fontSize: 10 }}>{item.time}</Typography>
            </Box>
          </Box>
        </Grow>
      ))}
    </Box>
  );
});

// Badge achievement card
