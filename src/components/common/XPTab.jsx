import { memo } from "react";
import { Box, Chip, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";
import { XP_ACTIONS, XP_LEVELS } from "../../core/appConstants.js";
import { GlassCard } from "./GlassCard.jsx";
import * as G from "../../services/gamification.js";



export const XPTab = memo(function XPTab({ data, user, darkMode }) {
  const xp = G.calcXP(data);
  const lvl = G.getLevel(xp);
  const next = XP_LEVELS.find((l) => l.min > xp);
  const pct = lvl.level === 6 ? 100 : Math.round(((xp - lvl.min) / ((next?.min || xp+1) - lvl.min)) * 100);
  const toNext = next ? next.min - xp : 0;

  const earned = [
    { ...XP_ACTIONS[0], done: !!data },
    { ...XP_ACTIONS[1], done: !!data?.photoUrl },
    { ...XP_ACTIONS[2], done: !!data?.phoneVerified },
    { ...XP_ACTIONS[3], done: !!data?.linkedin },
    { ...XP_ACTIONS[4], done: !!data?.bio },
    { ...XP_ACTIONS[5], done: (data?.loginBonusDays || 0) > 0, count: data?.loginBonusDays || 0 },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>

      {/* Level Card */}
      <Box sx={{
        p: 3, borderRadius: 3, position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${lvl.color}12, ${lvl.color}04)`,
        border: `1px solid ${lvl.color}33`,
      }}>
        {/* Glow */}
        <Box sx={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle,${lvl.color}18,transparent 70%)`, pointerEvents: "none" }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mb: 2.5 }}>
          <Box sx={{ width: 72, height: 72, borderRadius: "50%", background: `radial-gradient(circle,${lvl.color}28,${lvl.color}08)`, border: `3px solid ${lvl.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, boxShadow: `0 0 24px ${lvl.color}44`, flexShrink: 0 }}>
            {lvl.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.3 }}>
              <Typography variant="h6" sx={{ fontWeight: 900, color: lvl.color }}>{lvl.title}</Typography>
              <Chip label={`Level ${lvl.level}`} size="small" sx={{ background: `${lvl.color}22`, color: lvl.color, fontWeight: 700, height: 20, fontSize: 10 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1 }}>{xp.toLocaleString()} <Typography component="span" variant="caption" sx={{ opacity: 0.4, fontSize: 13 }}>XP</Typography></Typography>
            {next && <Typography variant="caption" sx={{ opacity: 0.4 }}>{toNext} XP to reach {next.title} {XP_LEVELS.find(l=>l.title===next.title)?.icon}</Typography>}
            {!next && <Typography variant="caption" sx={{ color: lvl.color, fontWeight: 700 }}>👑 Maximum level reached!</Typography>}
          </Box>
        </Box>

        {/* XP Progress bar */}
        <Box sx={{ mb: 0.8, display: "flex", justifyContent: "space-between" }}>
          <Typography variant="caption" sx={{ opacity: 0.4, fontSize: 10 }}>{lvl.min} XP</Typography>
          <Typography variant="caption" sx={{ color: lvl.color, fontWeight: 700, fontSize: 10 }}>{pct}% to next level</Typography>
          <Typography variant="caption" sx={{ opacity: 0.4, fontSize: 10 }}>{next?.min || "MAX"} XP</Typography>
        </Box>
        <Box sx={{ height: 10, borderRadius: 5, background: "rgba(15,23,42,0.07)", overflow: "hidden" }}>
          <Box sx={{ height: "100%", width: `${pct}%`, borderRadius: 5, background: `linear-gradient(90deg,${lvl.color},${lvl.color}88)`, transition: "width 1s ease", boxShadow: `0 0 10px ${lvl.color}66` }} />
        </Box>
      </Box>

      {/* All levels roadmap */}
      <GlassCard sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, opacity: 0.7 }}>🗺️ Level Roadmap</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {XP_LEVELS.map((l) => {
            const isCurrent = l.level === lvl.level;
            const isPast = l.level < lvl.level;
            return (
              <Box key={l.level} sx={{
                flex: 1, minWidth: 70, p: 1.2, borderRadius: 2, textAlign: "center",
                background: isCurrent ? `${l.color}18` : isPast ? `${l.color}08` : "rgba(15,23,42,0.03)",
                border: `1px solid ${isCurrent ? l.color + "55" : isPast ? l.color + "22" : "rgba(15,23,42,0.06)"}`,
                opacity: isPast || isCurrent ? 1 : 0.4,
                transform: isCurrent ? "scale(1.05)" : "none",
                transition: "background-color 180ms ease, border-color 180ms ease, transform 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease",
              }}>
                <Box sx={{ fontSize: 18, mb: 0.3 }}>{l.icon}</Box>
                <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, display: "block", color: isCurrent ? l.color : "inherit" }}>{l.title}</Typography>
                <Typography variant="caption" sx={{ fontSize: 9, opacity: 0.4 }}>{l.min} XP</Typography>
                {isCurrent && <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: l.color, mx: "auto", mt: 0.5, boxShadow: `0 0 6px ${l.color}` }} />}
              </Box>
            );
          })}
        </Box>
      </GlassCard>

      {/* XP Actions breakdown */}
      <GlassCard sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, opacity: 0.7 }}>⚡ XP Breakdown</Typography>
        {earned.map((a) => (
          <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, borderBottom: "1px solid rgba(15,23,42,0.04)", "&:last-child": { borderBottom: "none" } }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 2, background: a.done ? `${NEON.green}15` : "rgba(15,23,42,0.04)", border: `1px solid ${a.done ? NEON.green+"33" : "rgba(15,23,42,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
              {a.icon}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: "block", opacity: a.done ? 1 : 0.45, textDecoration: a.done ? "none" : "none" }}>
                {a.label}{a.id === "daily_login" && a.count > 0 ? ` ×${a.count}` : ""}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.35 }}>{a.done ? "Completed" : "Not yet done"}</Typography>
            </Box>
            <Chip
              label={`+${a.id === "daily_login" ? a.xp * (a.count||0) : a.xp} XP`}
              size="small"
              sx={{ height: 20, fontSize: 10, fontWeight: 700, background: a.done ? `${NEON.green}15` : "rgba(15,23,42,0.05)", color: a.done ? NEON.green : "rgba(255,255,255,0.25)" }}
            />
          </Box>
        ))}
        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${NEON.blue}18`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.6 }}>Total XP Earned</Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, color: lvl.color }}>{xp} XP</Typography>
        </Box>
      </GlassCard>

    </Box>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ONBOARDING — Welcome Modal + Tour + Checklist
// ═══════════════════════════════════════════════════════════════════════

// Confetti burst component
