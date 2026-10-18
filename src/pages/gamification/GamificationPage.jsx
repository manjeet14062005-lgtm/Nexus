import { Navigate, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Skeleton, Avatar, Box, Button, Chip, LinearProgress, Tab, Tabs, Typography } from "@mui/material";
import { NEON } from "../../constants/theme";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { collection, onSnapshot } from "../../lib/supabaseDataCompat.js";
import { db } from "../../lib/supabaseLegacy";
import * as G from "../../services/gamification.js";
import { GText } from "../../components/common/GText.jsx";



export function GamificationPage({ user, userRole, darkMode }) {
  const [allUsers, setAllUsers] = useState([]);
  const [myData, setMyData] = useState(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    // Load all users for leaderboard
    const unsub = onSnapshot(collection(db, "users"), { includeMetadataChanges: false }, (snap) => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllUsers(users);
      setMyData(users.find(u => u.submitterUid === user.uid) || null);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user]);

  if (!user) return <Navigate to="/" />;

  const myXP = G.calcXP(myData);
  const myLevel = G.getLevel(myXP);

  // Leaderboard: sort all users by XP
  const leaderboard = allUsers
    .map(u => ({ ...u, xp: G.calcXP(u), level: G.getLevel(G.calcXP(u)) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 20);

  const myRank = leaderboard.findIndex(u => u.submitterUid === user.uid) + 1;

  // Weekly challenges
  const CHALLENGES = [
    { id: "c1", icon: "📷", title: "Profile Photo", desc: "Upload a profile photo", xp: 30, done: !!myData?.photoUrl, color: NEON.blue },
    { id: "c2", icon: "🔗", title: "Link LinkedIn", desc: "Add your LinkedIn URL", xp: 20, done: !!myData?.linkedin, color: NEON.purple },
    { id: "c3", icon: "✍️", title: "Write Your Bio", desc: "Tell the world about yourself", xp: 20, done: !!myData?.bio, color: NEON.cyan },
    { id: "c4", icon: "📱", title: "Verify Phone", desc: "Verify your phone number via OTP", xp: 50, done: !!myData?.phoneVerified, color: NEON.green },
    { id: "c5", icon: "🔥", title: "7-Day Streak", desc: "Log in 7 days in a row", xp: 70, done: (myData?.loginBonusDays||0) >= 7, color: NEON.orange },
    { id: "c6", icon: "✅", title: "Complete Profile", desc: "Fill all 8 profile fields", xp: 100, done: myData && ["name","email","state","gender","phone","linkedin","bio","photoUrl"].filter(f=>myData[f]).length === 8, color: NEON.pink },
    { id: "c7", icon: "⭐", title: "Reach Level 4", desc: "Earn 350+ XP to become a Pro", xp: 0, done: myXP >= 350, color: NEON.gold },
    { id: "c8", icon: "🔥", title: "30-Day Streak", desc: "Log in 30 days in a row", xp: 300, done: (myData?.loginBonusDays||0) >= 30, color: NEON.red },
  ];

  const completedChallenges = CHALLENGES.filter(c => c.done).length;
  const totalChallengeXP = CHALLENGES.filter(c => c.done).reduce((a, c) => a + c.xp, 0);

  // Streak milestones
  const STREAK_MILESTONES = [
    { days: 3,   icon: "🔥", label: "3 Days",   xp: 30,  color: NEON.cyan },
    { days: 7,   icon: "🔥", label: "1 Week",   xp: 70,  color: NEON.orange },
    { days: 14,  icon: "⚡", label: "2 Weeks",  xp: 140, color: NEON.blue },
    { days: 30,  icon: "🔥", label: "1 Month",  xp: 300, color: NEON.purple },
    { days: 60,  icon: "🔥", label: "2 Months", xp: 600, color: NEON.gold },
    { days: 100, icon: "🔥", label: "100 Days",  xp: 1000, color: NEON.pink },
  ];

  const currentStreak = myData?.loginBonusDays || 0;

  const RANK_MEDAL = (rank) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 3, background: `linear-gradient(135deg,${NEON.orange},${NEON.pink})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🏆</Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}><GText>🏆 Gamification Hub</GText></Typography>
          <Typography variant="body2" sx={{ opacity: 0.45 }}>Leaderboard · Challenges · Streaks · Achievements</Typography>
        </Box>
      </Box>

      {/* My stats banner */}
      <Box sx={{ p: 2.5, mb: 3, background: `linear-gradient(135deg,${myLevel.color}12,${NEON.blue}08)`, border: `1px solid ${myLevel.color}22` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Avatar src={user.photoURL || ""} sx={{ width: 48, height: 48, background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})`, fontSize: 18 }}>{user.displayName?.[0]}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{user.displayName || "You"}</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.3 }}>
              <Chip label={`${myLevel.icon} ${myLevel.title}`} size="small" sx={{ height: 20, fontSize: 10, background: `${myLevel.color}18`, color: myLevel.color, fontWeight: 700 }} />
              <Chip label={`⚡ ${myXP} XP`} size="small" sx={{ height: 20, fontSize: 10, background: `${NEON.blue}18`, color: NEON.blue, fontWeight: 700 }} />
              {myRank > 0 && <Chip label={`${RANK_MEDAL(myRank)} Rank ${myRank}`} size="small" sx={{ height: 20, fontSize: 10, background: `${NEON.gold}18`, color: NEON.gold, fontWeight: 700 }} />}
              <Chip label={`🔥 ${currentStreak} day streak`} size="small" sx={{ height: 20, fontSize: 10, background: `${NEON.orange}18`, color: NEON.orange, fontWeight: 700 }} />
            </Box>
          </Box>
          <Button size="small" variant="outlined" onClick={() => navigate(`/profile/${user.uid}`)}
            sx={{ borderColor: `${NEON.blue}44`, color: NEON.blue, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            View My Profile
          </Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, "& .MuiTabs-indicator": { background: NEON.orange }, "& .Mui-selected": { color: `${NEON.orange} !important` } }}>
        {["🏆 Leaderboard","⚔️ Challenges","🔥 Streaks","🏅 All Badges"].map(t =>
          <Tab key={t} label={t} sx={{ fontSize: 12, fontWeight: 600, textTransform: "none" }} />)}
      </Tabs>

      {loading ? <Box sx={{ width: "100%", py: 5 }}><Skeleton variant="rounded" height={28} width="34%" animation="wave" sx={{ mb: 1.5, borderRadius: 2 }} /><Skeleton variant="rounded" height={14} width="55%" animation="wave" sx={{ mb: 3, borderRadius: 2, opacity: 0.65 }} /><Skeleton variant="rounded" height={260} animation="wave" sx={{ borderRadius: 3 }} /></Box> : <>

        {/* LEADERBOARD */}
        {tab === 0 && (
          <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 2, mb: 3 }}>
              {[
                { label: "Total Players", value: leaderboard.length, icon: "👥", color: NEON.blue },
                { label: "Your Rank",     value: myRank > 0 ? `#${myRank}` : "N/A", icon: "🏆", color: NEON.gold },
                { label: "Top XP",        value: leaderboard[0]?.xp || 0, icon: "⚡", color: NEON.purple },
                { label: "Your XP",       value: myXP, icon: "✨", color: myLevel.color },
              ].map(s => (
                <Box key={s.label} sx={{ p: 2 }}>
                  <Typography sx={{ fontSize: 22, mb: 0.3 }}>{s.icon}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: s.color }}>{s.value}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.4, fontSize: 11 }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ p: 0, overflow: "hidden" }}>
              {leaderboard.map((u, i) => {
                const isMe = u.submitterUid === user.uid;
                const rank = i + 1;
                return (
                  <Box key={u.id} onClick={() => navigate(`/profile/${u.submitterUid}`)}
                    sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 1.5, cursor: "pointer",
                      background: isMe ? `${NEON.blue}08` : "transparent",
                      borderBottom: "1px solid rgba(15,23,42,0.04)",
                      "&:last-child": { borderBottom: "none" },
                      "&:hover": { background: `${NEON.blue}06` }, transition: "background 0.2s" }}>
                    {/* Rank */}
                    <Typography sx={{ width: 32, fontWeight: 900, fontSize: rank <= 3 ? 20 : 14, textAlign: "center", flexShrink: 0, color: rank === 1 ? NEON.gold : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : "rgba(255,255,255,0.3)" }}>
                      {rank <= 3 ? RANK_MEDAL(rank) : `#${rank}`}
                    </Typography>
                    {/* Avatar */}
                    <Avatar src={u.photoUrl || ""} sx={{ width: 36, height: 36, fontSize: 14, background: `linear-gradient(135deg,${u.level.color},${NEON.blue})`, flexShrink: 0 }}>{u.name?.[0]}</Avatar>
                    {/* Name + level */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: isMe ? 800 : 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.name || "Anonymous"} {isMe && <Typography component="span" sx={{ color: NEON.blue, fontSize: 10 }}>(you)</Typography>}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ opacity: 0.35, fontSize: 10 }}>{u.level.icon} {u.level.title} · {u.state || "—"}</Typography>
                    </Box>
                    {/* XP bar */}
                    <Box sx={{ width: 80, display: { xs: "none", sm: "block" } }}>
                      <LinearProgress variant="determinate" value={Math.min(100, u.xp / (leaderboard[0]?.xp || 1) * 100)}
                        sx={{ height: 5, borderRadius: 2, background: `${u.level.color}18`, "& .MuiLinearProgress-bar": { background: u.level.color } }} />
                    </Box>
                    {/* XP */}
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: u.level.color, minWidth: 60, textAlign: "right", fontSize: 13 }}>⚡ {u.xp}</Typography>
                  </Box>
                );
              })}
              {leaderboard.length === 0 && (
                <Box sx={{ textAlign: "center", py: 6, opacity: 0.4 }}>
                  <Typography variant="body2">No players yet. Be the first!</Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* CHALLENGES */}
        {tab === 1 && (
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="body2" sx={{ opacity: 0.5 }}>{completedChallenges}/{CHALLENGES.length} completed · {totalChallengeXP} XP earned</Typography>
              <LinearProgress variant="determinate" value={completedChallenges/CHALLENGES.length*100}
                sx={{ width: 120, height: 6, borderRadius: 2, background: `${NEON.orange}15`, "& .MuiLinearProgress-bar": { background: NEON.orange } }} />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              {CHALLENGES.map(c => (
                <Box key={c.id} sx={{ p: 2.5, border: `1px solid ${c.done ? c.color+"33" : "rgba(15,23,42,0.06)"}`, opacity: c.done ? 1 : 0.75, transition: "opacity 150ms ease, border-color 150ms ease, background-color 150ms ease, transform 150ms ease", "&:hover": { opacity: 1, border: `1px solid ${c.color}44` } }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: 2.5, background: c.done ? `${c.color}22` : "rgba(15,23,42,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: `1px solid ${c.done ? c.color+"33" : "rgba(15,23,42,0.06)"}` }}>
                      {c.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: 13 }}>{c.title}</Typography>
                        {c.xp > 0 && <Chip label={`+${c.xp} XP`} size="small" sx={{ height: 18, fontSize: 9, background: `${c.color}15`, color: c.color, fontWeight: 700 }} />}
                      </Box>
                      <Typography variant="caption" sx={{ opacity: 0.5, fontSize: 11 }}>{c.desc}</Typography>
                    </Box>
                    <Box sx={{ flexShrink: 0 }}>
                      {c.done
                        ? <TaskAltIcon sx={{ color: NEON.green, fontSize: 22 }} />
                        : <Box sx={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${c.color}33` }} />}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* STREAKS */}
        {tab === 2 && (
          <Box>
            {/* Current streak display */}
            <Box sx={{ p: 3, mb: 3, textAlign: "center", background: `linear-gradient(135deg,${NEON.orange}12,${NEON.red}08)`, border: `1px solid ${NEON.orange}22` }}>
              <Typography sx={{ fontSize: 56, mb: 0.5 }}>🔥</Typography>
              <Typography variant="h3" sx={{ fontWeight: 900, color: NEON.orange }}>{currentStreak}</Typography>
              <Typography variant="body1" sx={{ opacity: 0.6, mb: 1 }}>Day Login Streak</Typography>
              <Typography variant="caption" sx={{ opacity: 0.4 }}>Log in daily to keep your streak alive and earn bonus XP!</Typography>
              <Box sx={{ mt: 2, display: "flex", justifyContent: "center", gap: 0.8 }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <Box key={i} sx={{ width: 28, height: 28, borderRadius: 1.5, background: i < (currentStreak % 7) ? `${NEON.orange}44` : "rgba(15,23,42,0.05)", border: `1px solid ${i < (currentStreak % 7) ? NEON.orange+"55" : "rgba(15,23,42,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                    {i < (currentStreak % 7) ? "🔥" : ""}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Streak milestones */}
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>🏁 Streak Milestones</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {STREAK_MILESTONES.map(m => {
                const reached = currentStreak >= m.days;
                const progress = Math.min(100, (currentStreak / m.days) * 100);
                return (
                  <Box key={m.days} sx={{ p: 2.5, borderRadius: 2, background: reached ? `${m.color}08` : "rgba(15,23,42,0.02)", border: `1px solid ${reached ? m.color+"33" : "rgba(15,23,42,0.06)"}`, display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: 2.5, background: reached ? `${m.color}20` : "rgba(15,23,42,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, filter: reached ? "none" : "grayscale(1)", opacity: reached ? 1 : 0.5 }}>
                      {m.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{m.label} Streak</Typography>
                        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                          {m.xp > 0 && <Chip label={`+${m.xp} XP`} size="small" sx={{ height: 18, fontSize: 9, background: `${m.color}15`, color: m.color, fontWeight: 700 }} />}
                          {reached && <TaskAltIcon sx={{ color: NEON.green, fontSize: 16 }} />}
                        </Box>
                      </Box>
                      <LinearProgress variant="determinate" value={progress}
                        sx={{ height: 5, borderRadius: 2, background: `${m.color}12`, "& .MuiLinearProgress-bar": { background: m.color } }} />
                      <Typography variant="caption" sx={{ opacity: 0.4, fontSize: 10, mt: 0.4, display: "block" }}>
                        {reached ? "✅ Achieved!" : `${currentStreak}/${m.days} days`}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* ALL BADGES */}
        {tab === 3 && (
          <Box>
            {(() => {
              const ALL_BADGES = [
                { icon: "🚀", label: "First Login",    earned: !!user,                              color: NEON.blue,   desc: "Sign in for the first time",     xp: 0   },
                { icon: "📝", label: "Registered",     earned: !!myData,                            color: NEON.cyan,   desc: "Complete the registration form", xp: 100 },
                { icon: "📱", label: "Verified",       earned: !!myData?.phoneVerified,             color: NEON.green,  desc: "Verify your phone number",       xp: 50  },
                { icon: "🔗", label: "Networker",      earned: !!myData?.linkedin,                  color: NEON.purple, desc: "Add your LinkedIn profile",      xp: 20  },
                { icon: "📷", label: "Photogenic",     earned: !!myData?.photoUrl,                  color: NEON.orange, desc: "Upload a profile photo",         xp: 30  },
                { icon: "✍️", label: "Storyteller",    earned: !!myData?.bio,                       color: NEON.pink,   desc: "Write your bio",                 xp: 20  },
                { icon: "✅", label: "Complete",       earned: myData && ["name","email","state","gender","phone","linkedin","bio","photoUrl"].filter(f=>myData[f]).length===8, color: NEON.gold, desc: "Fill all profile fields", xp: 50 },
                { icon: "🔥", label: "Streak 7",       earned: currentStreak >= 7,                  color: NEON.orange, desc: "Achieve a 7-day login streak",    xp: 70  },
                { icon: "🔥", label: "Streak 30",      earned: currentStreak >= 30,                 color: NEON.purple, desc: "Achieve a 30-day login streak",   xp: 300 },
                { icon: "🧭", label: "Explorer",       earned: myXP >= 100,                         color: NEON.blue,   desc: "Reach Explorer level (100 XP)",   xp: 0   },
                { icon: "⭐", label: "Member",         earned: myXP >= 200,                         color: NEON.green,  desc: "Reach Member level (200 XP)",     xp: 0   },
                { icon: "👑", label: "Legend",         earned: myXP >= 700,                         color: NEON.pink,   desc: "Reach Legend level (700 XP)",     xp: 0   },
              ];
              const earned = ALL_BADGES.filter(b=>b.earned).length;
              return (
                <>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="body2" sx={{ opacity: 0.5 }}>{earned}/{ALL_BADGES.length} badges unlocked</Typography>
                    <LinearProgress variant="determinate" value={earned/ALL_BADGES.length*100}
                      sx={{ width: 120, height: 6, borderRadius: 2, background: `${NEON.gold}15`, "& .MuiLinearProgress-bar": { background: NEON.gold } }} />
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 2 }}>
                    {ALL_BADGES.map(b => (
                      <Box key={b.label} sx={{ p: 2.5, textAlign: "center", border: `1px solid ${b.earned ? b.color+"33" : "rgba(15,23,42,0.05)"}`, opacity: b.earned ? 1 : 0.4, transition: "opacity 150ms ease, border-color 150ms ease, background-color 150ms ease, transform 150ms ease", "&:hover": { opacity: 1 } }}>
                        <Box sx={{ fontSize: 36, mb: 1, filter: b.earned ? "none" : "grayscale(1)" }}>{b.icon}</Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: 13, color: b.earned ? b.color : "inherit", mb: 0.3 }}>{b.label}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.45, fontSize: 10, display: "block", mb: 1 }}>{b.desc}</Typography>
                        {b.xp > 0 && <Chip label={`+${b.xp} XP`} size="small" sx={{ height: 18, fontSize: 9, background: `${b.color}15`, color: b.earned ? b.color : "inherit", fontWeight: 700 }} />}
                        {b.earned && <Box sx={{ mt: 1 }}><TaskAltIcon sx={{ fontSize: 16, color: NEON.green }} /></Box>}
                      </Box>
                    ))}
                  </Box>
                </>
              );
            })()}
          </Box>
        )}
      </>}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PWA INSTALL BANNER — floating prompt for mobile/desktop install
// ═══════════════════════════════════════════════════════════════════════
