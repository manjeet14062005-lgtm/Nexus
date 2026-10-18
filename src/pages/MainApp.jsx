import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useCallback, cloneElement } from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import { PAGE_TITLES } from "../core/appConstants.js";
import { Box, Skeleton, Typography, CssBaseline, Button } from "@mui/material";
import { getTheme, getMeshBackground } from "../constants/theme";
import { ThemeProvider } from "@mui/material/styles";
import { Toaster } from "react-hot-toast";
import { auth } from "../lib/supabaseLegacy";
import { apiRequest } from "../services/apiClient.js";
import { NotificationDrawer } from "../components/common/NotificationDrawer.jsx";
import { Sidebar } from "../components/navigation/Sidebar.jsx";
import { PWAInstallBanner } from "../components/common/PWAInstallBanner.jsx";
import { TopBar } from "../components/navigation/TopBar.jsx";
import { MobileBottomNav } from "../components/navigation/MobileBottomNav.jsx";
import { UserProfileProvider, useUserProfile } from "../contexts/UserProfileContext.js";
const Registration = lazy(() => import("./auth/Registration").then(m => ({ default: m.Registration })));
const LandingPage = lazy(() => import("./LandingPage").then(m => ({ default: m.LandingPage })));
const AccountPage = lazy(() => import("./account/AccountPage").then(m => ({ default: m.AccountPage })));
const SaaSDashboardPage = lazy(() => import("./dashboard/SaaSDashboardPage").then(m => ({ default: m.SaaSDashboardPage })));
const ReportsPage = lazy(() => import("./reports/ReportsPage").then(m => ({ default: m.ReportsPage })));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const UserManagement = lazy(() => import("./admin/UserManagement").then(m => ({ default: m.UserManagement })));
const Analytics = lazy(() => import("./dashboard/Analytics").then(m => ({ default: m.Analytics })));
const NotificationsView = lazy(() => import("./messaging/NotificationsView").then(m => ({ default: m.NotificationsView })));
const GlobeDashboard = lazy(() => import("./dashboard/GlobeDashboard").then(m => ({ default: m.GlobeDashboard })));
const SystemSettings = lazy(() => import("./dashboard/SystemSettings").then(m => ({ default: m.SystemSettings })));
const LoginPage = lazy(() => import("./auth/LoginPage").then(m => ({ default: m.LoginPage })));
const ResetPasswordPage = lazy(() => import("./auth/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const EmailVerificationPage = lazy(() => import("./auth/EmailVerificationPage").then(m => ({ default: m.EmailVerificationPage })));
const ActivityLogsPage = lazy(() => import("./dashboard/ActivityLogsPage").then(m => ({ default: m.ActivityLogsPage })));
const BillingPage = lazy(() => import("./billing/BillingPage").then(m => ({ default: m.BillingPage })));
const DeveloperPortal = lazy(() => import("./developer/DeveloperPortal").then(m => ({ default: m.DeveloperPortal })));
const TermsPage = lazy(() => import("./legal/TermsPage").then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./legal/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const TeamWorkspacePage = lazy(() => import("./workspace/TeamWorkspacePage").then(m => ({ default: m.TeamWorkspacePage })));
const AdvancedAnalyticsPage = lazy(() => import("./advanced/AdvancedAnalyticsPage").then(m => ({ default: m.AdvancedAnalyticsPage })));
const GamificationPage = lazy(() => import("./gamification/GamificationPage").then(m => ({ default: m.GamificationPage })));
const PublicProfilePage = lazy(() => import("./profile/PublicProfilePage").then(m => ({ default: m.PublicProfilePage })));
const MessagingPage = lazy(() => import("./messaging/MessagingPage").then(m => ({ default: m.MessagingPage })));
const IntegrationsPage = lazy(() => import("./integrations/IntegrationsPage").then(m => ({ default: m.IntegrationsPage })));
const AIFeaturesPage = lazy(() => import("./advanced/AIFeaturesPage").then(m => ({ default: m.AIFeaturesPage })));
const WorkflowsPage = lazy(() => import("./workflows/WorkflowsPage").then(m => ({ default: m.WorkflowsPage })));
const AdvancedSecurityPage = lazy(() => import("./security/AdvancedSecurityPage").then(m => ({ default: m.AdvancedSecurityPage })));
const VerificationPage = lazy(() => import("./verification/VerificationPage").then(m => ({ default: m.VerificationPage })));
const SupportPage = lazy(() => import("./support/SupportPage").then(m => ({ default: m.SupportPage })));
const AdminSupportPage = lazy(() => import("./admin/AdminSupportPage").then(m => ({ default: m.AdminSupportPage })));
const StatusPage = lazy(() => import("./status/StatusPage").then(m => ({ default: m.StatusPage })));

function RequireVerified({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified !== true) return <Navigate to="/verify-email" replace />;
  return <ProfileAwarePage user={user}>{children}</ProfileAwarePage>;
}

function useProfileUser(user) {
  const { profile } = useUserProfile();
  return useMemo(() => user ? {
    ...user,
    displayName: profile?.name ?? user.displayName,
    photoURL: profile?.photoUrl ?? user.photoURL,
  } : user, [user, profile?.name, profile?.photoUrl]);
}

function ProfileAwarePage({ user, children }) {
  const profileUser = useProfileUser(user);
  return cloneElement(children, { user: profileUser });
}

/** Sidebar that uses the shared Nexus profile for name/avatar display. */
function ProfileAwareSidebar(props) {
  const enrichedUser = useProfileUser(props.user);
  return <Sidebar {...props} user={enrichedUser} />;
}

/** TopBar that uses the shared Nexus profile for name/avatar display. */
function ProfileAwareTopBar(props) {
  const enrichedUser = useProfileUser(props.user);
  return <TopBar {...props} user={enrichedUser} />;
}

export function MainApp() {
  const darkMode = false;
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const currentUser = useRef(user); currentUser.current = user;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  const location = useLocation();
  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const handleMenuClick = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleNotifClick = useCallback(() => setNotifPanelOpen(true), []);
  const handleCloseNotifDrawer = useCallback(() => setNotifPanelOpen(false), []);

  const isVerifiedUser = !!user && user.emailVerified === true;
  useEffect(()=>{window.dispatchEvent(new Event('nexus:notification-role-refresh'));},[userRole]);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const unsub = auth.onAuthStateChanged(async (u) => {
      const current = ++generation;
      setUser(u);
      setAccessBlocked(false);
      setUserRole(null);
      if (!u) { setAuthLoading(false); return; }
      try {
        const context = await apiRequest(u, "/auth/context");
        if (active && current === generation) {
          const platformRole = String(context.user?.role || "user").trim().toLowerCase();
          setUserRole(["admin", "moderator", "user"].includes(platformRole) ? platformRole : "user");
        }
      } catch (error) {
        if (active && current === generation) {
          setUserRole("user");
          setAccessBlocked(error.data?.code === "ACCOUNT_SUSPENDED");
        }
      } finally {
        if (active && current === generation) setAuthLoading(false);
      }
    });
    return () => { active = false; generation++; unsub(); };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true, pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const context = await apiRequest(currentUser.current, "/auth/context", {signal:controller.signal});
        if (active) { setUserRole(context.user?.role || "user"); setAccessBlocked(false); }
      } catch (error) {
        if (active && error.status === 403) { setUserRole("user"); setAccessBlocked(error.data?.code === "ACCOUNT_SUSPENDED"); }
      } finally { pending = false; }
    };
    const timer = setInterval(refresh,30000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("nexus:auth-context-refresh",refresh);
    return () => { active=false; controller.abort(); clearInterval(timer); window.removeEventListener("focus",refresh); document.removeEventListener("visibilitychange",refresh); window.removeEventListener("nexus:auth-context-refresh",refresh); };
  }, [user?.uid]);

  const routeElements = useMemo(() => <>
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/" element={<LandingPage darkMode={darkMode} />} />
    <Route path="/register" element={user ? (isVerifiedUser ? <Navigate to="/dashboard" replace /> : <Navigate to="/verify-email" replace />) : <Registration user={user} darkMode={darkMode} />} />
    <Route path="/dashboard" element={<RequireVerified user={user}><SaaSDashboardPage user={user} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/admin" element={<RequireVerified user={user}><AdminDashboard user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/users" element={<RequireVerified user={user}><UserManagement user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/analytics" element={<RequireVerified user={user}><Analytics user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/notifications" element={<RequireVerified user={user}><NotificationsView user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/globe" element={<RequireVerified user={user}><GlobeDashboard user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/settings" element={<RequireVerified user={user}><SystemSettings user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/login" element={<ProfileAwarePage user={user}><LoginPage darkMode={darkMode} /></ProfileAwarePage>} />
    <Route path="/verify-email" element={<EmailVerificationPage darkMode={darkMode} />} />
    <Route path="/activity" element={<RequireVerified user={user}><ActivityLogsPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/billing" element={<RequireVerified user={user}><BillingPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/verification" element={<RequireVerified user={user}><VerificationPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/developer" element={<RequireVerified user={user}><DeveloperPortal user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/terms" element={<TermsPage darkMode={darkMode} />} />
    <Route path="/privacy" element={<PrivacyPage darkMode={darkMode} />} />
    <Route path="/workspace" element={<RequireVerified user={user}><TeamWorkspacePage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/advanced-analytics" element={<RequireVerified user={user}><AdvancedAnalyticsPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/gamification" element={<RequireVerified user={user}><GamificationPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/profile/:uid" element={<RequireVerified user={user}><PublicProfilePage user={user} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/reports" element={<RequireVerified user={user}><ReportsPage user={user} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/account" element={<RequireVerified user={user}><AccountPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/messages" element={<RequireVerified user={user}><MessagingPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/integrations" element={<RequireVerified user={user}><IntegrationsPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/ai-features" element={<RequireVerified user={user}><AIFeaturesPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/workflows" element={<RequireVerified user={user}><WorkflowsPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/security" element={<RequireVerified user={user}><AdvancedSecurityPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/support" element={<RequireVerified user={user}><SupportPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/admin/support" element={<RequireVerified user={user}><AdminSupportPage user={user} userRole={userRole} darkMode={darkMode} /></RequireVerified>} />
    <Route path="/status" element={<StatusPage darkMode={darkMode} />} />
  </>, [user, userRole, isVerifiedUser, darkMode]);


  if (authLoading) return (
    <ThemeProvider theme={getTheme(false)}>
      <CssBaseline />
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", ...getMeshBackground(false), flexDirection: "column", gap: 2 }}>
        <Box component="img" src="/assets/nexus-mark.svg" alt="" sx={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
        <Typography sx={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", color: "#0F172A" }}>Nexus</Typography>
        <Skeleton variant="rounded" width={180} height={8} animation="wave"
          sx={{ bgcolor: "#e2e8f0", borderRadius: 99 }} />
        <Typography sx={{ color: "#94A3B8", fontSize: 12 }}>Initializing Nexus…</Typography>
      </Box>
    </ThemeProvider>
  );

  const pageTitle = PAGE_TITLES[location.pathname] || "Nexus";
  const publicPath = ["/", "/register", "/login", "/reset-password", "/verify-email", "/terms", "/privacy", "/status"].includes(location.pathname);
  if (accessBlocked && !publicPath) return <ThemeProvider theme={theme}><CssBaseline/><Box sx={{minHeight:"100vh",display:"grid",placeItems:"center",bgcolor:"#f5f8fc",p:3}}><Box sx={{maxWidth:450,p:5,bgcolor:"white",borderRadius:4,border:"1px solid #dfe7f0"}}><Typography variant="h5" sx={{mb:2}}>Account access restricted</Typography><Typography sx={{color:"#62758c",mb:3}}>Contact Nexus support at manjeet14062005@gmail.com to review your account access.</Typography><Button variant="outlined" onClick={()=>auth.signOut()}>Sign out</Button></Box></Box></ThemeProvider>;

  if (publicPath) {
    return (
      <UserProfileProvider user={user}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box data-nexus-theme={darkMode ? "dark" : "light"} sx={{ minHeight: "100vh" }}>
          <Toaster position="top-center" />
          <Suspense fallback={<Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Skeleton width={180} height={14} /></Box>}>
            <Routes>{routeElements}</Routes>
          </Suspense>
        </Box>
      </ThemeProvider>
      </UserProfileProvider>
    );
  }

  return (
    <UserProfileProvider user={user}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box data-nexus-theme={darkMode ? "dark" : "light"} sx={{
        display: "flex", minHeight: "100vh",
        ...getMeshBackground(darkMode),
        color: darkMode ? "#F1F5F9" : "#0F172A",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: darkMode ? "#1C2333" : "#fff",
              color: darkMode ? "#F1F5F9" : "#0F172A",
              border: darkMode ? "1px solid rgba(15,23,42,0.08)" : "1px solid rgba(0,0,0,0.06)",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 500,
              padding: "10px 16px",
              boxShadow: darkMode ? "0 8px 24px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.1)",
              maxWidth: 380,
            },
            success: { iconTheme: { primary: "#10B981", secondary: "#fff" } },
            error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
            loading: { iconTheme: { primary: "#6366F1", secondary: "#fff" } },
            duration: 3500,
          }}
        />

        {/* Sidebar */}
        <ProfileAwareSidebar user={user} userRole={userRole} darkMode={darkMode} open={drawerOpen} onClose={handleCloseDrawer} />

        {/* Main area */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Top bar */}
          <ProfileAwareTopBar user={user} darkMode={darkMode} onMenuClick={handleMenuClick} onNotifClick={handleNotifClick} pageTitle={pageTitle} />

          {/* Page content */}
          <Box component="main" id="main-content" sx={{ mt: "56px", flex: 1, position: "relative", zIndex: 1, pb: { xs: "76px", lg: 0 } }}>
            <PWAInstallBanner />
            <Box key={location.pathname} sx={{ animation: "nexusPageIn 200ms cubic-bezier(.22,1,.36,1)", "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}>
              <Suspense fallback={
                <Box sx={{ minHeight: "60vh", px: { xs: 2, sm: 3 }, py: 4 }}>
                  <Skeleton variant="rounded" width="34%" height={26} animation="wave" sx={{ mb: 1.5, borderRadius: 2 }} />
                  <Skeleton variant="rounded" width="58%" height={14} animation="wave" sx={{ mb: 4, borderRadius: 2, opacity: 0.65 }} />
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2 }}>
                    {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={126} animation="wave" sx={{ borderRadius: 3 }} />)}
                  </Box>
                  <Skeleton variant="rounded" height={300} animation="wave" sx={{ mt: 2, borderRadius: 3 }} />
                </Box>
              }>
                <Routes>{routeElements}</Routes>

              </Suspense>
            </Box>
            <MobileBottomNav user={user} userRole={userRole} />
          </Box>
        </Box>

        <NotificationDrawer open={notifPanelOpen} onClose={handleCloseNotifDrawer} darkMode={darkMode} />
      </Box>
    </ThemeProvider>
    </UserProfileProvider>
  );
}
