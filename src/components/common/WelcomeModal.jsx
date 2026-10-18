import { memo } from "react";
import { useState, useEffect } from "react";
import { Avatar, Box, Button, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";
import TourIcon from "@mui/icons-material/Tour";
import { ConfettiBurst } from "./ConfettiBurst.jsx";



export const WelcomeModal = memo(function WelcomeModal({ user, onStartTour, onSkip, darkMode }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 300); }, []);
  const name = user?.displayName?.split(" ")[0] || "there";
  return (
    <>
      <ConfettiBurst />
      {/* Backdrop */}
      <Box sx={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(20px)", zIndex: 9995 }} />
      <Box sx={{
        position: "fixed", top: "50%", left: "50%",
        transform: show ? "translate(-50%,-50%) scale(1)" : "translate(-50%,-50%) scale(0.85)",
        opacity: show ? 1 : 0,
        transition: "opacity 220ms ease, transform 260ms cubic-bezier(0.22,1,0.36,1)",
        zIndex: 9996, width: { xs: "90%", sm: 480 },
        background: darkMode ? "#161B27" : "#fff",
        border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 5,
        boxShadow: darkMode ? "0 24px 64px rgba(0,0,0,0.5)" : "0 24px 64px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }}>
        {/* Top gradient bar */}
        <Box sx={{ height: 4, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple},${NEON.pink})` }} />

        <Box sx={{ p: 4, textAlign: "center" }}>
          {/* Avatar + rocket */}
          <Box sx={{ position: "relative", display: "inline-block", mb: 3 }}>
            <Avatar src={user?.photoURL || ""} sx={{ width: 80, height: 80, border: `3px solid ${NEON.blue}44`, fontSize: 32, mx: "auto", background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})` }}>
              {user?.displayName?.[0] || "👋"}
            </Avatar>
            <Box sx={{ position: "absolute", bottom: -4, right: -4, width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,#ffd700,#ff8c00)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              🚀
            </Box>
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5 }}>
            Welcome, <Box component="span" sx={{ color: "var(--nexus-brand, #6366F1)", fontWeight: 800 }}>{name}!</Box>
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.5, mb: 3 }}>
            Your Nexus — Full-Stack SaaS Analytics Platform account is ready 🎉
          </Typography>

          {/* Feature highlights */}
          {[
            { icon: "📊", title: "Live Dashboard", desc: "Track your profile & activity in real time" },
            { icon: "🏅", title: "Earn Badges", desc: "Complete actions to unlock achievements" },
            { icon: "🔒", title: "Secure & Private", desc: "Your data is encrypted and protected" },
          ].map((f) => (
            <Box key={f.title} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, mb: 1, borderRadius: 2, background: `${NEON.blue}07`, border: `1px solid ${NEON.blue}12`, textAlign: "left" }}>
              <Box sx={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, display: "block", color: NEON.blue }}>{f.title}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.45, fontSize: 11 }}>{f.desc}</Typography>
              </Box>
            </Box>
          ))}

          <Box sx={{ display: "flex", gap: 1.5, mt: 3 }}>
            <Button fullWidth variant="outlined" onClick={onSkip}
              sx={{ borderColor: (t) => t.palette.divider, color: "text.secondary", fontWeight: 600, py: 1.2 }}>
              Skip Tour
            </Button>
            <Button fullWidth variant="contained" onClick={onStartTour} startIcon={<TourIcon />}
              sx={{ background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})`, color: "#fff", fontWeight: 700, py: 1.2 }}>
              Take a Tour →
            </Button>
          </Box>
        </Box>
      </Box>
    </>
  );
});

// Get-Started Checklist Widget
