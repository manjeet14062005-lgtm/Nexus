// SectionAchievements.jsx — Badges and gamification.

import { Box, Typography, Grid } from "@mui/material";
import { BentoBox } from "./BentoBox";
import { getBadges, getXpInfo } from "../lib/accountMetrics";

export function SectionAchievements({ profileData, user }) {
  const badges = getBadges(profileData, user);
  const xpInfo = getXpInfo(profileData);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <BentoBox title="Current Level" spotlight highlight>
        <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Box
            sx={{
              width: 80, height: 80, borderRadius: "50%",
              background: "var(--acct-brand)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, fontWeight: 800,
              boxShadow: "0 0 20px rgba(79,85,207,0.4)"
            }}
          >
            {xpInfo.level.level}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>
              {xpInfo.xp} Total XP
            </Typography>
            {xpInfo.nextLevel ? (
              <>
                <Box sx={{ width: "100%", height: 8, background: "var(--acct-surface-raised)", borderRadius: 4, overflow: "hidden", mb: 0.5 }}>
                  <Box sx={{ width: `${xpInfo.progress}%`, height: "100%", background: "var(--acct-brand)" }} />
                </Box>
                <Typography sx={{ fontSize: 12, color: "var(--acct-muted)" }}>
                  {xpInfo.nextLevel.min - xpInfo.xp} XP to Level {xpInfo.nextLevel.level}
                </Typography>
              </>
            ) : (
              <Typography sx={{ fontSize: 13, color: "var(--acct-success)" }}>Max level reached!</Typography>
            )}
          </Box>
        </Box>
      </BentoBox>

      <BentoBox title="Badges" subtitle="Earn badges by completing profile milestones.">
        <Grid container spacing={2}>
          {badges.map((b) => (
            <Grid item xs={12} sm={6} md={4} key={b.id}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: b.earned ? "var(--acct-brand)" : "var(--acct-border)",
                  background: b.earned ? "color-mix(in oklch, var(--acct-brand) 4%, transparent)" : "var(--acct-surface-raised)",
                  opacity: b.earned ? 1 : 0.6,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: b.earned ? "var(--acct-brand)" : "var(--acct-text)" }}>
                  {b.label}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "var(--acct-muted)", flex: 1 }}>
                  {b.desc}
                </Typography>
                {!b.earned && b.xp > 0 && (
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "var(--acct-muted)", mt: 1 }}>
                    +{b.xp} XP
                  </Typography>
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      </BentoBox>
    </Box>
  );
}
