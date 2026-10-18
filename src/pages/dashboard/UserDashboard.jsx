import { Navigate, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Skeleton, Alert, AlertTitle, Avatar, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Switch, Tab, Tabs, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import { GLOW, NEON } from "../../constants/theme";
import HistoryIcon from "@mui/icons-material/History";
import StarIcon from "@mui/icons-material/Star";
import SecurityIcon from "@mui/icons-material/Security";
import { collection, doc, onSnapshot, query, updateDoc, where } from "../../lib/supabaseDataCompat.js";
import { db, auth } from "../../lib/supabaseLegacy";
import { signOut } from "../../lib/supabaseAuth.js";
import { toast } from "react-hot-toast";
import * as G from "../../services/gamification.js";
import { GText } from "../../components/common/GText.jsx";
import { StatCard } from "../../components/common/StatCard.jsx";
import { PulseDot } from "../../components/common/PulseDot.jsx";
import { Timeline } from "../../components/common/Timeline.jsx";
import { BadgeCard } from "../../components/common/BadgeCard.jsx";
import { XPBadge } from "../../components/common/XPBadge.jsx";
import { XPTab } from "../../components/common/XPTab.jsx";
import { TourTooltip } from "../../components/common/TourTooltip.jsx";
import { WelcomeModal } from "../../components/common/WelcomeModal.jsx";
import { OnboardingChecklist } from "../../components/common/OnboardingChecklist.jsx";
import { apiRequest, apiDownload } from "../../services/apiClient.js";



export function UserDashboard({ user, darkMode }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const navigate = useNavigate();

  // Onboarding state
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourStep, setTourStep] = useState(0); // 0 = not started

  // Show welcome modal only on first visit (per session)
  useEffect(() => {
    const seen = sessionStorage.getItem("nexus_welcomed");
    if (!seen) { setTimeout(() => setShowWelcome(true), 800); }
  }, []);

  // Capture DOM refs for tour tooltips
  const tourRefs = {
    dashboard: useRef(null),
    profile: useRef(null),
    badges: useRef(null),
    settings: useRef(null),
  };

  const TOUR_STEPS = [
    { key: "dashboard", title: "📊 Your Dashboard", desc: "This is your personal hub. See all your profile data, activity history and stats at a glance." },
    { key: "profile", title: "👤 Profile Tab", desc: "View and edit your profile information, update your bio, phone, and social links." },
    { key: "badges", title: "🏅 Earn Badges", desc: "Complete tasks to unlock achievement badges. Show off your progress!" },
    { key: "settings", title: "⚙️ Settings & Security", desc: "Manage your password, notification preferences and account security here." },
  ];

  const startTour = () => {
    setShowWelcome(false);
    sessionStorage.setItem("nexus_welcomed", "1");
    setTourStep(1);
  };

  const skipAll = () => {
    setShowWelcome(false);
    setTourStep(0);
    sessionStorage.setItem("nexus_welcomed", "1");
  };

  const nextTourStep = () => {
    if (tourStep >= TOUR_STEPS.length) {
      setTourStep(0);
      toast("🎉 Tour complete! You're all set.", { style: { background: "#ffffff", border: `1px solid ${NEON.green}44`, color: "#0F172A" }, duration: 3000 });
    } else {
      // Switch tab to match step
      if (tourStep === 1) setTab(0);
      if (tourStep === 2) setTab(0);
      if (tourStep === 3) setTab(2);
      if (tourStep === 4) setTab(4);
      setTourStep(tourStep + 1);
    }
  };

  // Real-time listener
  useEffect(() => {
    if (!user) return;
    apiRequest(user, "/account/deletion-request")
      .then((result) => setDeletionRequest(result.request || null))
      .catch((error) => console.warn("Unable to load deletion status:", error.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // bonusGrantedThisSession guards against the Realtime onSnapshot firing multiple
    // times when updateDoc itself triggers a change event — without this the toast
    // fires on every Realtime event until the write settles.
    let bonusGrantedThisSession = false;

    const unsub = onSnapshot(
      query(collection(db, "users"), where("submitterUid", "==", user.uid)),
      async (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSubmissions(docs);
        setLoading(false);

        // Daily login XP bonus — once per calendar day AND once per component mount.
        // The session guard prevents the Realtime subscription from re-triggering
        // the toast when our own updateDoc write causes a change event.
        if (docs[0] && !bonusGrantedThisSession) {
          const today = new Date().toDateString();
          const lastBonus = docs[0].lastLoginBonus;
          if (lastBonus !== today) {
            bonusGrantedThisSession = true; // set BEFORE await to prevent race
            const days = (docs[0].loginBonusDays || 0) + 1;
            try {
              await updateDoc(doc(db, "users", docs[0].id), { lastLoginBonus: today, loginBonusDays: days });
              toast("🔥 Daily login bonus! +10 XP", { icon: "⚡", style: { background: "#ffffff", border: "1px solid #F59E0B44", color: "#F59E0B" }, duration: 3000 });
            } catch {
              bonusGrantedThisSession = false; // allow retry if write failed
            }
          } else {
            // Already received bonus today — mark session as handled so we never check again
            bonusGrantedThisSession = true;
          }
        }
      },
      (err) => {
        console.error("UserDashboard database error:", err.code, err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  if (!user) return <Navigate to="/" />;
  const myData = submissions[0];
  const fields = ["name","email","state","gender","phone","linkedin","bio","photoUrl"];
  const completeness = myData ? Math.round(fields.filter((f) => myData[f]).length / fields.length * 100) : 0;

  const BADGES = [
    { icon: "🎯", label: "First Login", earned: !!user, desc: "Signed in for the first time" },
    { icon: "📝", label: "Registered", earned: submissions.length > 0, desc: "Completed registration form" },
    { icon: "📞", label: "Verified", earned: !!myData?.phoneVerified, desc: "Phone number verified" },
    { icon: "🔗", label: "Linked In", earned: !!myData?.linkedin, desc: "Added LinkedIn profile" },
    { icon: "🌟", label: "Complete", earned: completeness === 100, desc: "100% profile complete" },
  ];

  const saveEdit = async () => {
    try {
      await updateDoc(doc(db, "users", editData.id), { name: editData.name, state: editData.state, bio: editData.bio, phone: editData.phone });
      toast.success("Profile updated ✅"); setEditOpen(false);
    } catch { toast.error("Update failed"); }
  };


  const exportData = (fmt) => {
    let content, type, ext;
    if (fmt === "json") { content = JSON.stringify(submissions, null, 2); type = "application/json"; ext = "json"; }
    else { content = ["Name,Email,State,Gender,Phone", ...submissions.map((r) => `"${r.name}","${r.email}","${r.state}","${r.gender}","${r.phone || ""}"`).join("\n")]; type = "text/csv"; ext = "csv"; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = `my_data.${ext}`; a.click();
  };

  const revokeAllSessions = async () => {
    try {
      await apiRequest(user, "/account/security/revoke-all-sessions", { method: "POST" });
      toast.success("All sessions revoked. Signing out this browser.");
      await signOut(auth);
    } catch (error) {
      if (error?.data?.code === "RECENT_AUTH_REQUIRED") {
        toast.error("For security, sign in again before revoking all sessions.");
      } else {
        toast.error(error.message || "Unable to revoke sessions.");
      }
    }
  };

  const downloadAccountData = async () => {
    try {
      const blob = await apiDownload(user, "/account/data-export.json");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexus-account-${user.uid}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Account data export created.");
    } catch (error) {
      if (error?.data?.code === "RECENT_AUTH_REQUIRED") {
        toast.error("For security, sign in again before exporting account data.");
      } else {
        toast.error(error.message || "Unable to export account data.");
      }
    }
  };

  const requestAccountDeletion = async () => {
    setDeletionLoading(true);
    try {
      const result = await apiRequest(user, "/account/deletion-request", { method: "POST" });
      setDeletionRequest(result.request || null);
      setDeleteOpen(false);
      toast.success("Account deletion scheduled. You have a grace period to cancel it.");
    } catch (error) {
      if (error?.data?.code === "RECENT_AUTH_REQUIRED") {
        toast.error("For security, sign in again before requesting account deletion.");
      } else {
        toast.error(error.message || "Unable to schedule account deletion.");
      }
    } finally {
      setDeletionLoading(false);
    }
  };

  const cancelAccountDeletion = async () => {
    setDeletionLoading(true);
    try {
      const result = await apiRequest(user, "/account/deletion-request/cancel", { method: "POST" });
      setDeletionRequest(result.request || null);
      toast.success("Account deletion canceled.");
    } catch (error) {
      if (error?.data?.code === "RECENT_AUTH_REQUIRED") {
        toast.error("For security, sign in again before canceling account deletion.");
      } else {
        toast.error(error.message || "Unable to cancel account deletion.");
      }
    } finally {
      setDeletionLoading(false);
    }
  };

  const currentTourStep = TOUR_STEPS[tourStep - 1];

  return (
    <Container maxWidth="md" sx={{ py: 3, position: "relative", zIndex: 1 }}>

      {/* Welcome Modal */}
      {showWelcome && <WelcomeModal user={user} darkMode={darkMode} onStartTour={startTour} onSkip={skipAll} />}

      {/* Tour tooltip overlay backdrop */}
      {tourStep > 0 && <Box sx={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9990, pointerEvents: "none" }} />}

      {/* Tour Tooltip */}
      {tourStep > 0 && currentTourStep && (
        <TourTooltip
          step={tourStep}
          total={TOUR_STEPS.length}
          title={currentTourStep.title}
          desc={currentTourStep.desc}
          onNext={nextTourStep}
          onSkip={skipAll}
          anchorEl={tourRefs[currentTourStep.key]?.current}
        />
      )}

      {/* Get Started Checklist */}
      <OnboardingChecklist data={myData} darkMode={darkMode} />

      <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
        {/* Header */}
        <Box ref={tourRefs.dashboard} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap", outline: tourStep === 1 ? `2px solid ${NEON.blue}` : "none", borderRadius: 2, transition: "outline 0.3s" }}>
          <Box sx={{ position: "relative" }}>
            <Avatar src={myData?.photoUrl || user.photoURL || ""} sx={{ width: 60, height: 60, background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})`, fontSize: 22, boxShadow: GLOW() }}>
              {user.displayName?.[0] || "U"}
            </Avatar>
            <PulseDot color={NEON.green} size={10} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}><GText>My Dashboard</GText></Typography>
            <Typography variant="body2" sx={{ opacity: 0.45, fontSize: 12 }}>{user.email}</Typography>
            <Box sx={{ mt: 1 }}><XPBadge xp={G.calcXP(myData)} size="sm" /></Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.8 }}>
              <LinearProgress variant="determinate" value={completeness} sx={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(99,102,241,0.1)", "& .MuiLinearProgress-bar": { background: `linear-gradient(90deg,${NEON.blue},${NEON.green})` } }} />
              <Typography variant="caption" sx={{ color: NEON.blue, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{completeness}%</Typography>
            </Box>
          </Box>
          <Button size="small" variant="outlined" onClick={() => navigate("/register")} sx={{ borderColor: NEON.blue, color: NEON.blue, fontSize: 11 }}>+ New Form</Button>
        </Box>

        <Tabs ref={tourRefs.profile} value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, "& .MuiTabs-indicator": { background: NEON.blue }, "& .Mui-selected": { color: `${NEON.blue} !important` }, outline: tourStep === 2 ? `2px solid ${NEON.blue}` : "none", borderRadius: 1, transition: "outline 0.3s" }}>
          {["Profile","Activity","Badges","⚡ XP & Levels","Security","Login History","Settings"].map((t, i) => (
            <Tab key={t} ref={i === 2 ? tourRefs.badges : i === 5 ? tourRefs.settings : null} label={t} sx={{ fontSize: 12, fontWeight: 600, textTransform: "none" }} />
          ))}
        </Tabs>

        {/* PROFILE TAB */}
        {tab === 0 && (loading ? <Skeleton variant="rounded" height={180} animation="wave" sx={{ width: "100%", borderRadius: 3 }} /> :
          submissions.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography sx={{ opacity: 0.4, mb: 2 }}>No submissions yet</Typography>
              <Button variant="contained" onClick={() => navigate("/register")} sx={{ background: `linear-gradient(90deg,${NEON.blue},${NEON.cyan})`, color: "#fff", fontWeight: 700 }}>Register Now</Button>
            </Box>
          ) : submissions.map((row) => (
            <Box key={row.id} sx={{ p: 2.5, mb: 2, background: "rgba(99,102,241,0.03)" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mb: 2 }}>
                {[["Full Name",row.name],["Email",row.email],["State",row.state],["Gender",row.gender],["Phone",row.phone||"—"],["Registered",row.createdAt?.slice(0,10)||"—"]].map(([k,v]) => (
                  <Box key={k}>
                    <Typography variant="caption" sx={{ opacity: 0.35, fontSize: 10 }}>{k}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>{v}</Typography>
                  </Box>
                ))}
              </Box>
              {row.bio && <Box sx={{ p: 1.5, borderRadius: 2, background: "rgba(15,23,42,0.03)", mb: 2 }}><Typography variant="caption" sx={{ opacity: 0.35, fontSize: 10, display: "block" }}>Bio</Typography><Typography variant="body2" sx={{ fontSize: 12 }}>{row.bio}</Typography></Box>}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />} onClick={() => { setEditData(row); setEditOpen(true); }} sx={{ background: `${NEON.blue}14`, color: NEON.blue, fontSize: 11 }}>Edit</Button>
                <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />} onClick={() => exportData("csv")} sx={{ background: `${NEON.green}14`, color: NEON.green, fontSize: 11 }}>CSV</Button>
                <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />} onClick={() => exportData("json")} sx={{ background: `${NEON.orange}14`, color: NEON.orange, fontSize: 11 }}>JSON</Button>
                <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 14 }} />} onClick={() => { setDeleteOpen(true); }} sx={{ background: `${NEON.pink}14`, color: NEON.pink, fontSize: 11, ml: "auto" }}>Delete</Button>
              </Box>
            </Box>
          ))
        )}

        {/* ACTIVITY TAB */}
        {tab === 1 && (
          <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 3 }}>
              <StatCard icon={<HistoryIcon />} label="Total Submissions" value={submissions.length} color={NEON.blue} />
              <StatCard icon={<StarIcon />} label="Profile Score" value={`${completeness}%`} color={NEON.orange} />
            </Box>
            <Typography variant="subtitle2" sx={{ mb: 2, opacity: 0.5, fontSize: 12 }}>Recent Activity</Typography>
            <Timeline items={[
              { text: "Account created via Google OAuth", time: myData?.createdAt?.slice(0,16)?.replace("T"," ") || "—", type: "user" },
              { text: "Registration form completed", time: myData?.createdAt?.slice(0,16)?.replace("T"," ") || "—", type: "edit" },
              { text: "Opened account area", time: "Current session", type: "login" },
            ]} />
          </Box>
        )}

        {/* BADGES TAB */}
        {tab === 2 && (
          <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 1.5, mb: 3 }}>
              {BADGES.map((b) => <BadgeCard key={b.label} {...b} />)}
            </Box>
            <Box sx={{ p: 2, background: `${NEON.orange}08` }}>
              <Typography variant="body2" sx={{ color: NEON.orange, fontWeight: 700 }}>🏆 {BADGES.filter((b) => b.earned).length}/{BADGES.length} badges earned</Typography>
              <LinearProgress variant="determinate" value={BADGES.filter((b) => b.earned).length / BADGES.length * 100} sx={{ mt: 1, height: 4, borderRadius: 99, background: `${NEON.orange}15`, "& .MuiLinearProgress-bar": { background: NEON.orange } }} />
            </Box>
          </Box>
        )}

        {/* XP & LEVELS TAB */}
        {tab === 3 && (
          <XPTab data={myData} user={user} darkMode={darkMode} />
        )}

        {/* SECURITY TAB */}
        {tab === 4 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Alert severity="info" sx={{ borderRadius: 2, background: `${NEON.blue}0e`, border: `1px solid ${NEON.blue}22`, "& .MuiAlert-icon": { color: NEON.blue } }}>
              <AlertTitle sx={{ fontWeight: 700, fontSize: 13 }}>Account Security</AlertTitle>
              <Typography variant="caption">Your account is protected with Google OAuth. Two-factor authentication is available through your Google account settings.</Typography>
            </Alert>
            {[
              { label: "Sign-In Provider", status: (user.providerData || []).map((p) => p.providerId?.replace(".com", "")).filter(Boolean).join(", ") || "Nexus account", color: NEON.green },
              { label: "Phone Verification", status: myData?.phoneVerified ? "Verified" : "Not verified", color: myData?.phoneVerified ? NEON.green : NEON.orange },
              { label: "Email Verified", status: user.emailVerified ? "Verified" : "Pending", color: user.emailVerified ? NEON.green : NEON.orange },
            ].map((s) => (
              <Box key={s.label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, border: "1px solid rgba(99,102,241,0.08)" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>{s.label}</Typography>
                <Chip label={s.status} size="small" sx={{ background: `${s.color}1a`, color: s.color, fontSize: 10, height: 22 }} />
              </Box>
            ))}
          </Box>
        )}

        {/* AUTHENTICATION TAB */}
        {tab === 5 && (
          <Box>
            <Alert severity="info" sx={{ borderRadius: 2, background: `${NEON.blue}0e`, border: `1px solid ${NEON.blue}22`, mb: 2 }}>Nexus does not fabricate device or IP history. Nexus displays your sign-in methods and recorded account events.</Alert>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
              <Box sx={{ p: 2.5, borderRadius: 2, border: "1px solid rgba(99,102,241,.08)" }}><SecurityIcon sx={{ color: NEON.green, mb: 1 }} /><Typography sx={{ fontWeight: 700, fontSize: 13 }}>Current session</Typography><Typography variant="caption" sx={{ opacity: .45 }}>Authenticated and active in this browser.</Typography></Box>
              <Box sx={{ p: 2.5, borderRadius: 2, border: "1px solid rgba(99,102,241,.08)" }}><Typography sx={{ fontWeight: 700, fontSize: 13 }}>Provider</Typography><Typography variant="body2" sx={{ mt: .5 }}>{(user.providerData || []).map((p) => p.providerId?.replace(".com", "")).filter(Boolean).join(", ") || "Nexus account"}</Typography></Box>
            </Box>
            <Box sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${NEON.pink}22`, background: `${NEON.pink}05`, mb: 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 13, mb: .5 }}>Revoke all active sessions</Typography>
              <Typography variant="caption" sx={{ opacity: .55, display: "block", mb: 1.5 }}>This invalidates your active Nexus sessions across devices. You will be signed out of this browser too.</Typography>
              <Button variant="outlined" color="error" onClick={revokeAllSessions}>Revoke all sessions</Button>
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, opacity: 0.6, fontSize: 12 }}>Recorded account events</Typography>
            <Typography variant="caption" sx={{ opacity: .4 }}>No independent login-history dataset is currently stored by Nexus. Use Security for recorded Nexus security events.</Typography>
          </Box>
        )}

        {/* SETTINGS TAB */}
        {tab === 6 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[{label:"Email Notifications",key:"emailNotif",default:true},{label:"Show Profile Publicly",key:"publicProfile",default:false},{label:"Data Sharing",key:"dataShare",default:false}].map((s) => (
              <Box key={s.key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, borderRadius: 2, border: "1px solid rgba(99,102,241,0.08)" }}>
                <Typography variant="body2" sx={{ fontSize: 13 }}>{s.label}</Typography>
                <Switch defaultChecked={s.default} size="small" sx={{ "& .MuiSwitch-thumb": { background: NEON.blue } }} />
              </Box>
            ))}
            <Box sx={{ mt: 1, p: 2, borderRadius: 2.5, border: `1px solid ${NEON.blue}22`, background: `${NEON.blue}05` }}>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>Privacy & data</Typography>
              <Typography variant="caption" sx={{ opacity: .55, display: "block", mb: 1.5 }}>Export a copy of your Nexus account data or schedule account deletion. Workspace-owned business data is governed separately by workspace controls.</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 15 }} />} onClick={downloadAccountData}>Export my data</Button>
                {deletionRequest?.status === "pending" ? (
                  <Button size="small" variant="outlined" color="warning" onClick={cancelAccountDeletion} disabled={deletionLoading}>
                    {deletionLoading ? "Canceling…" : "Cancel deletion"}
                  </Button>
                ) : (
                  <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon sx={{ fontSize: 15 }} />} onClick={() => setDeleteOpen(true)}>Delete my account</Button>
                )}
              </Box>
              {deletionRequest?.status === "pending" && <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>Deletion is scheduled for {new Date(deletionRequest.executeAfter).toLocaleString()}. Cancel it before then to keep your account.</Alert>}
            </Box>
          </Box>
        )}
      </Box>
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} PaperProps={{ sx: { background: darkMode ? "#161B27" : "#fff", borderRadius: 3, minWidth: { xs: 0, sm: 360 } } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Edit Profile</DialogTitle>
        <DialogContent>
          {[["Name","name"],["Phone","phone"],["State","state"],["Bio","bio"]].map(([l,k]) => (
            <TextField key={k} margin="dense" label={l} fullWidth value={editData[k]||""} onChange={(e) => setEditData({ ...editData, [k]: e.target.value })} multiline={k==="bio"} rows={k==="bio"?3:1} sx={{ mt: 1 }} />
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={saveEdit} variant="contained" sx={{ background: `linear-gradient(90deg,${NEON.blue},${NEON.cyan})`, color: "#fff", fontWeight: 700 }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} PaperProps={{ sx: { background: darkMode ? "#161B27" : "#fff", borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, color: NEON.pink }}>⚠️ Confirm Account Deletion</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>Nexus will schedule deletion of your personal account data and sign-in identity after the configured grace period. Workspace-owned business data is not deleted through this action.</Typography>
          <Alert severity="warning" sx={{ mb: 1.5 }}>You must transfer or delete any workspace you own and cancel any active subscription before account deletion can be scheduled.</Alert>
          <Typography variant="caption" sx={{ opacity: .55 }}>You can cancel a pending deletion request during the grace period.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={requestAccountDeletion} variant="contained" color="error" disabled={deletionLoading}>{deletionLoading ? "Scheduling…" : "Schedule deletion"}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VIEW 3: ADMIN DASHBOARD (Real-time)
// ═══════════════════════════════════════════════════════════════════════