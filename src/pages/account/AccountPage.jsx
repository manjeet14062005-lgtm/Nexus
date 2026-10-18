// AccountPage.jsx — The new premium Account dashboard.

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Box, Container, CircularProgress, Typography, Alert, Button } from "@mui/material";
import { motion, AnimatePresence } from "motion/react";
import { AccountSurface } from "./components/AccountSurface";
import { AccountNav } from "./components/AccountNav";
import { PasswordReauth } from "./components/PasswordReauth";

import { useAccountData } from "./hooks/useAccountData";
import { useAccountActions } from "./hooks/useAccountActions";
import { useReducedMotionSafe } from "./hooks/useReducedMotionSafe";

// Sections
import { SectionOverview } from "./components/SectionOverview";
import { SectionProfile } from "./components/SectionProfile";
import { SectionAchievements } from "./components/SectionAchievements";
import { SectionSecurity } from "./components/SectionSecurity";
import { SectionActivity } from "./components/SectionActivity";
import { SectionPreferences } from "./components/SectionPreferences";
import { SectionPrivacy } from "./components/SectionPrivacy";

export function AccountPage({ user, userRole }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("section") || "overview";
  const prefersReducedMotion = useReducedMotionSafe();

  const [notice, setNotice] = useState(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthActionName, setReauthActionName] = useState("");

  const accountData = useAccountData(user);
  const {
    profileData,
    loading,
    deletionRequest,
    securityEvents, setDeletionRequest, updateProfile, deletionError, profileError, refresh
  } = accountData;

  const actions = useAccountActions({
    user,
    profileData,
    onNeedsReauth: (actionName) => {
      try { sessionStorage.setItem("nexus:account-reauth", JSON.stringify({ uid: user.uid, section: activeSection, time: Date.now() })); } catch {}
      setReauthActionName(actionName);
      setReauthOpen(true);
    },
    onDeletionChange: setDeletionRequest,
    onProfileChange: updateProfile,
  });

  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    setReauthOpen(false);
    try { const intent = JSON.parse(sessionStorage.getItem("nexus:account-reauth")); if (intent) { sessionStorage.removeItem("nexus:account-reauth"); if (intent.uid === user?.uid && Date.now()-intent.time < 600000) setNotice("Returned from sign-in. Review and confirm your action again."); } } catch {}
  }, [user?.uid]);
  if (!user) return null;

  const handleNavChange = (id) => {
    setSearchParams({ section: id });
  };

  const handleReauthSuccess = () => {
    setReauthOpen(false);
    actions.clearPendingAction();
    sessionStorage.removeItem("nexus:account-reauth");
    setNotice("Identity confirmed. Review your action and select it again to continue.");
  };

  const renderSection = () => {
    if (loading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--acct-brand)" }} />
        </Box>
      );
    }

    if (profileError) return <Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{profileError}</Alert>;
    const props = {
      ...accountData, userRole, deletionError, refresh,
      user,
      profileData,
      actions,
      deletionRequest,
      securityEvents,
      onNavigate: handleNavChange,
    };

    switch (activeSection) {
      case "overview": return <SectionOverview {...props} />;
      case "profile": return <SectionProfile {...props} />;
      case "achievements": return <SectionAchievements {...props} />;
      case "security": return <SectionSecurity {...props} />;
      case "activity": return <SectionActivity {...props} />;
      case "preferences": return <SectionPreferences {...props} />;
      case "privacy": return <SectionPrivacy {...props} />;
      default: return <SectionOverview {...props} />;
    }
  };

  return (
    <Box className="acct" sx={{ width: "100%", minHeight: "100vh", bgcolor: "var(--acct-canvas)", color: "var(--acct-text)" }}>
      <AccountSurface />
      
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Box sx={{ mb: { xs: 3, md: 5 } }}>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 500, mb: 1, fontSize: {xs:32,md:46}, letterSpacing: "-0.04em" }}>Your account.</Typography>
          <Typography sx={{ color: "var(--acct-muted)", fontSize: 15 }}>
            Manage your profile, preferences, and security.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: { xs: 2, md: 4, lg: 6 } }}>
          <AccountNav active={activeSection} onChange={handleNavChange} />
          
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {notice && <Alert severity="info" onClose={() => setNotice(null)} sx={{mb:3}}>{notice}</Alert>}
            <AnimatePresence mode="wait">
              <motion.div
                key={user.uid + activeSection}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {renderSection()}
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>
      </Container>

      <PasswordReauth
        key={user.uid}
        returnTo={"/account?section=" + activeSection}
        open={reauthOpen}
        user={user}
        actionName={reauthActionName}
        onSuccess={handleReauthSuccess}
        onCancel={() => {
          setReauthOpen(false);
          actions.clearPendingAction();
        }}
      />
    </Box>
  );
}
