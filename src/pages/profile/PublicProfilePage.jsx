import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Skeleton, Avatar, Box, Button, Chip, LinearProgress, Typography } from "@mui/material";
import { GLOW, NEON } from "../../constants/theme";
import ShareIcon from "@mui/icons-material/Share";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { XP_ACTIONS } from "../../core/appConstants.js";
import { collection, getDocs, limit, query, where } from "../../lib/supabaseDataCompat.js";
import { db } from "../../lib/supabaseLegacy";
import { toast } from "react-hot-toast";
import * as G from "../../services/gamification.js";
import { XPBadge } from "../../components/common/XPBadge.jsx";



export function PublicProfilePage({ user, darkMode }) {
  const { uid } = useParams();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!uid) return;
    const fetchProfile = async () => {
      try {
        const snap = await getDocs(query(collection(db, "users"), where("submitterUid", "==", uid), limit(1)));
        if (snap.empty) { setNotFound(true); setLoading(false); return; }
        setProfileData({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch { setNotFound(true); }
      setLoading(false);
    };
    fetchProfile();
  }, [uid]);

  const xp = G.calcXP(profileData);
  const lvl = G.getLevel(xp);

  const BADGES_DEF = [
    { icon: "🚀", label: "First Login",   earned: true,                            color: NEON.blue,   desc: "Joined Nexus — Full-Stack SaaS Analytics Platform" },
    { icon: "📝", label: "Registered",    earned: !!profileData,                   color: NEON.cyan,   desc: "Completed registration" },
    { icon: "📱", label: "Verified",      earned: !!profileData?.phoneVerified,    color: NEON.green,  desc: "Phone verified" },
    { icon: "🔗", label: "Networker",     earned: !!profileData?.linkedin,         color: NEON.purple, desc: "LinkedIn added" },
    { icon: "📷", label: "Photogenic",    earned: !!profileData?.photoUrl,         color: NEON.orange, desc: "Profile photo uploaded" },
    { icon: "✍️", label: "Storyteller",   earned: !!profileData?.bio,              color: NEON.pink,   desc: "Bio written" },
    { icon: "✅", label: "Complete",      earned: profileData && ["name","email","state","gender","phone","linkedin","bio","photoUrl"].filter(f=>profileData[f]).length === 8, color: NEON.gold, desc: "100% profile complete" },
    { icon: "🔥", label: "Streak Master", earned: (profileData?.loginBonusDays||0) >= 7, color: NEON.red, desc: "7+ day login streak" },
  ];

  if (loading) return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Skeleton variant="rounded" width={220} height={10} animation="wave" sx={{ borderRadius: 99 }} />
    </Box>
  );

  if (notFound) return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 2 }}>
      <Box sx={{ fontSize: 64 }}>👤</Box>
      <Typography variant="h5" sx={{ fontWeight: 800, opacity: 0.5 }}>Profile Not Found</Typography>
      <Typography variant="body2" sx={{ opacity: 0.3 }}>This user profile doesn't exist or is private</Typography>
      <Button variant="outlined" onClick={() => navigate("/")} sx={{ borderColor: NEON.blue, color: NEON.blue, mt: 1 }}>Go Home</Button>
    </Box>
  );

  const fields = ["name","email","state","gender","phone","linkedin","bio","photoUrl"];
  const completeness = Math.round(fields.filter(f => profileData?.[f]).length / fields.length * 100);

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", py: 4, px: 2 }}>
      {/* Cover banner */}
      <Box sx={{ height: 140, borderRadius: "16px 16px 0 0", background: `linear-gradient(135deg,${NEON.blue}44,${NEON.purple}44,${NEON.pink}22)`, border: `1px solid ${NEON.blue}22`, position: "relative", mb: 0, overflow: "hidden" }}>
        <Box sx={{ position: "absolute", inset: 0, background: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234facfe' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <Box sx={{ position: "absolute", top: 12, right: 16 }}>
          <Chip label={`${lvl.icon} ${lvl.title}`} sx={{ background: `${lvl.color}22`, color: lvl.color, fontWeight: 700, border: `1px solid ${lvl.color}44` }} />
        </Box>
      </Box>

      {/* Profile card */}
      <Box sx={{ p: 3, borderRadius: "0 0 16px 16px", borderTop: "none", position: "relative" }}>
        {/* Avatar */}
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 2, mt: -7, mb: 2, flexWrap: "wrap" }}>
          <Avatar src={profileData?.photoUrl || ""} sx={{ width: 88, height: 88, fontSize: 32, background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})`, border: `3px solid rgba(10,22,40,1)`, boxShadow: GLOW() }}>
            {profileData?.name?.[0] || "U"}
          </Avatar>
          <Box sx={{ pb: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>{profileData?.name || "Anonymous"}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.45 }}>{profileData?.state}{profileData?.country ? `, ${profileData.country}` : ""}</Typography>
          </Box>
          <Box sx={{ ml: "auto", pb: 1 }}>
            <XPBadge xp={xp} size="md" />
          </Box>
        </Box>

        {/* Bio */}
        {profileData?.bio && (
          <Box sx={{ mb: 2.5, p: 2, borderRadius: 2, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.08)" }}>
            <Typography variant="body2" sx={{ opacity: 0.75, lineHeight: 1.7, fontStyle: "italic" }}>"{profileData.bio}"</Typography>
          </Box>
        )}

        {/* Stats row */}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1.5, mb: 3 }}>
          {[
            { label: "XP Points", value: xp, color: NEON.blue, icon: "⚡" },
            { label: "Level", value: lvl.level, color: lvl.color, icon: lvl.icon },
            { label: "Badges", value: BADGES_DEF.filter(b=>b.earned).length, color: NEON.orange, icon: "🏅" },
            { label: "Streak", value: `${profileData?.loginBonusDays||0}d`, color: NEON.green, icon: "🔥" },
          ].map(s => (
            <Box key={s.label} sx={{ p: 1.5, borderRadius: 2, background: `${s.color}08`, border: `1px solid ${s.color}18`, textAlign: "center" }}>
              <Typography sx={{ fontSize: 18, mb: 0.3 }}>{s.icon}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900, color: s.color, fontSize: 18 }}>{s.value}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.4, fontSize: 10 }}>{s.label}</Typography>
            </Box>
          ))}
        </Box>

        {/* Profile completeness */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.8 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.6 }}>Profile Completeness</Typography>
            <Typography variant="caption" sx={{ color: NEON.blue, fontWeight: 800 }}>{completeness}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={completeness} sx={{ height: 7, borderRadius: 99, background: "rgba(99,102,241,0.08)", "& .MuiLinearProgress-bar": { background: `linear-gradient(90deg,${NEON.blue},${NEON.green})` } }} />
        </Box>

        {/* Social links */}
        {profileData?.linkedin && (
          <Box sx={{ mb: 3 }}>
            <Button variant="outlined" href={profileData.linkedin.startsWith("http") ? profileData.linkedin : `https://${profileData.linkedin}`}
              target="_blank" rel="noopener noreferrer" startIcon={<span>🔗</span>}
              sx={{ borderColor: `${NEON.blue}44`, color: NEON.blue, fontSize: 12, fontWeight: 700 }}>
              LinkedIn Profile
            </Button>
          </Box>
        )}

        {/* Badges */}
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, opacity: 0.7 }}>🏅 Badges</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
          {BADGES_DEF.map((b) => (
            <Box key={b.label} sx={{ display: "flex", alignItems: "center", gap: 0.8, px: 1.5, py: 0.8, borderRadius: 99,
              background: b.earned ? `${b.color}18` : "rgba(15,23,42,0.03)",
              border: `1px solid ${b.earned ? b.color+"33" : "rgba(15,23,42,0.06)"}`,
              opacity: b.earned ? 1 : 0.35, transition: "opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease" }}>
              <Typography sx={{ fontSize: 14 }}>{b.icon}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: b.earned ? b.color : "inherit" }}>{b.label}</Typography>
            </Box>
          ))}
        </Box>

        {/* XP breakdown */}
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, opacity: 0.7 }}>⚡ XP Breakdown</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {XP_ACTIONS.map((a) => {
            const done = a.id === "registered" ? !!profileData : a.id === "photo" ? !!profileData?.photoUrl : a.id === "phone" ? !!profileData?.phoneVerified : a.id === "linkedin" ? !!profileData?.linkedin : a.id === "bio" ? !!profileData?.bio : (profileData?.loginBonusDays||0) > 0;
            return (
              <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.8, opacity: done ? 1 : 0.35 }}>
                <Typography sx={{ fontSize: 16, width: 24, textAlign: "center" }}>{a.icon}</Typography>
                <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>{a.label}</Typography>
                <Typography variant="caption" sx={{ color: done ? NEON.green : "inherit", fontWeight: 800 }}>+{a.xp} XP</Typography>
                {done ? <TaskAltIcon sx={{ fontSize: 14, color: NEON.green }} /> : <Box sx={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid rgba(15,23,42,0.15)" }} />}
              </Box>
            );
          })}
        </Box>

        {/* Share button */}
        <Box sx={{ mt: 3, pt: 2.5, borderTop: "1px solid rgba(99,102,241,0.08)", display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" startIcon={<ShareIcon />} onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Profile link copied!"); }}
            sx={{ borderColor: `${NEON.blue}44`, color: NEON.blue, fontWeight: 700 }}>
            Share Profile
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GAMIFICATION HUB PAGE — Leaderboard + Challenges + Streaks
// ═══════════════════════════════════════════════════════════════════════
