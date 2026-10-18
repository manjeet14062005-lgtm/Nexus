import { memo } from "react";
import { useState } from "react";
import { Box, Chip, Collapse, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import TaskAltIcon from "@mui/icons-material/TaskAlt";



export const OnboardingChecklist = memo(function OnboardingChecklist({ data, darkMode }) {
  const [open, setOpen] = useState(true);
  const tasks = [
    { id: "registered", label: "Complete registration", done: !!data, icon: "📝" },
    { id: "photo", label: "Upload a profile photo", done: !!data?.photoUrl, icon: "📸" },
    { id: "phone", label: "Verify phone number", done: !!data?.phoneVerified, icon: "📱" },
    { id: "linkedin", label: "Add LinkedIn profile", done: !!data?.linkedin, icon: "🔗" },
    { id: "bio", label: "Write a short bio", done: !!data?.bio, icon: "✍️" },
  ];
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = Math.round((doneCount / tasks.length) * 100);
  if (pct === 100) return null; // hide when fully complete

  return (
    <Box sx={{
      mb: 3, borderRadius: 3, overflow: "hidden",
      border: `1px solid ${NEON.blue}18`,
      background: darkMode ? "rgba(10,22,40,0.6)" : "rgba(255,255,255,0.8)",
      backdropFilter: "blur(12px)",
    }}>
      {/* Header */}
      <Box onClick={() => setOpen(!open)} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 1.8, cursor: "pointer", "&:hover": { background: `${NEON.blue}07` } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <RocketLaunchIcon sx={{ color: NEON.blue, fontSize: 20 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: 13 }}>Get Started</Typography>
            <Typography variant="caption" sx={{ opacity: 0.45 }}>{doneCount}/{tasks.length} tasks complete</Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ width: 80 }}>
            <Box sx={{ height: 6, borderRadius: 3, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
              <Box sx={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})`, transition: "width 0.6s ease" }} />
            </Box>
            <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.4 }}>{pct}%</Typography>
          </Box>
          <Box sx={{ color: "text.secondary", fontSize: 16, transform: open ? "rotate(180deg)" : "none", transition: "0.3s" }}>▾</Box>
        </Box>
      </Box>

      {/* Task list */}
      <Collapse in={open}>
        <Box sx={{ px: 2.5, pb: 2 }}>
          {tasks.map((t) => (
            <Box key={t.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.9, borderBottom: "1px solid rgba(15,23,42,0.04)", "&:last-child": { borderBottom: "none" } }}>
              <Box sx={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                background: t.done ? `${NEON.green}18` : "rgba(15,23,42,0.04)",
                border: `1px solid ${t.done ? NEON.green + "44" : "rgba(15,23,42,0.08)"}`,
                flexShrink: 0,
              }}>
                {t.done ? <TaskAltIcon sx={{ fontSize: 14, color: NEON.green }} /> : <Box sx={{ fontSize: 13 }}>{t.icon}</Box>}
              </Box>
              <Typography variant="caption" sx={{ fontSize: 12, fontWeight: t.done ? 500 : 600, opacity: t.done ? 0.4 : 0.85, textDecoration: t.done ? "line-through" : "none", flex: 1 }}>
                {t.label}
              </Typography>
              {t.done && <Chip label="Done" size="small" sx={{ height: 16, fontSize: 9, background: `${NEON.green}18`, color: NEON.green }} />}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});
