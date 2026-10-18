import { memo } from "react";
import { useState, useEffect } from "react";
import { Box, Button, Chip, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { NEON } from "../../constants/theme";



export const TourTooltip = memo(function TourTooltip({ step, total, title, desc, onNext, onSkip, anchorEl }) {
  const [pos, setPos] = useState({ top: 100, left: 300 });
  useEffect(() => {
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      setPos({ top: r.bottom + 12, left: Math.min(r.left, window.innerWidth - 320) });
    }
  }, [anchorEl]);
  return (
    <Box sx={{
      position: "fixed", top: pos.top, left: pos.left, zIndex: 9998,
      width: 300, p: 2.5,
      background: "#ffffff",
      border: `1px solid ${NEON.blue}44`, borderRadius: 3,
      boxShadow: `0 8px 40px rgba(15,23,42,0.12), 0 0 0 1px ${NEON.blue}22`,
    }}>
      {/* Arrow */}
      <Box sx={{ position: "absolute", top: -8, left: 24, width: 14, height: 14, background: "#ffffff", border: `1px solid ${NEON.blue}44`, transform: "rotate(45deg)", borderBottom: "none", borderRight: "none" }} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Chip label={`${step} / ${total}`} size="small" sx={{ background: `${NEON.blue}18`, color: NEON.blue, fontSize: 10, height: 20 }} />
        <IconButton aria-label="Close tour" size="small" onClick={onSkip} sx={{ color: "text.secondary", p: 0.3 }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, color: "text.primary" }}>{title}</Typography>
      <Typography variant="caption" sx={{ opacity: 0.6, display: "block", mb: 2, lineHeight: 1.5 }}>{desc}</Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" onClick={onSkip} sx={{ color: "text.secondary", fontSize: 11, flex: 1 }}>Skip Tour</Button>
        <Button size="small" variant="contained" onClick={onNext}
          sx={{ background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})`, color: "#fff", fontWeight: 700, fontSize: 11, flex: 2 }}>
          {step === total ? "🎉 Done!" : "Next →"}
        </Button>
      </Box>
      {/* Progress bar */}
      <Box sx={{ mt: 1.5, height: 3, borderRadius: 2, background: "rgba(15,23,42,0.06)" }}>
        <Box sx={{ height: "100%", borderRadius: 2, width: `${(step/total)*100}%`, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})`, transition: "width 0.4s ease" }} />
      </Box>
    </Box>
  );
});

// Welcome Modal
