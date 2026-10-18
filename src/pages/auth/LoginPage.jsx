import { AuthExperience } from "../../components/common/AuthExperience.jsx";
import { PulseDot } from "../../components/common/PulseDot.jsx";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Alert, Avatar, Box, Button, Divider, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckIcon from "@mui/icons-material/Check";
import EmailIcon from "@mui/icons-material/Email";
import GoogleIcon from "@mui/icons-material/Google";
import LockIcon from "@mui/icons-material/Lock";
import LogoutIcon from "@mui/icons-material/Logout";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { auth, provider } from "../../lib/supabaseLegacy";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup, signOut } from "../../lib/supabaseAuth.js";
import { toast } from "react-hot-toast";

const ACCENT = "#245D48";
const VIOLET = "#34785E";

export function LoginPage({ darkMode, user }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [errors, setErrors] = useState({});

  const handleEmailLogin = async () => {
    const e = {};
    if (!email.includes("@")) e.email = "Invalid email";
    if (!resetMode && password.length < 6) e.password = "Min 6 characters";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      if (resetMode) {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
        toast.success("Password reset email sent!");
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (!credential.user.emailVerified) {
          localStorage.setItem("nexus_pending_verification_email", credential.user.email || email.trim().toLowerCase());
          toast("Please verify your email before entering Nexus.", { icon: "✉️" });
          navigate("/verify-email", { replace: true });
          return;
        }
        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } catch (err) {
      const msg = err.code === "auth/user-not-found" ? "No account found" :
        err.code === "auth/wrong-password" ? "Incorrect password" :
          err.code === "auth/too-many-requests" ? "Too many attempts — try later" :
            "Login failed";
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    try {
      // Mark that this Google OAuth flow was intentionally started.
      sessionStorage.setItem("nexus_google_oauth_pending", "true");

      // Use Nexus' existing Google auth compatibility layer.
      // Do NOT show a success toast here because starting OAuth
      // does not necessarily mean Google authentication has finished.
      await signInWithPopup(auth, provider);
    } catch (error) {
      sessionStorage.removeItem("nexus_google_oauth_pending");

      console.error("Google sign-in failed:", error);

      toast.error(
        error?.message || "Unable to continue with Google."
      );
    }
  };

  const dark = darkMode;
  const fg = dark ? "#F1F5F9" : "#0F172A";
  const sub = dark ? "#94A3B8" : "#475569";
  const muted = dark ? "#64748B" : "#6F8077";
  const line = dark ? "rgba(15,23,42,.07)" : "rgba(15,23,42,.07)";

  const iSx = {
    mb: 2.2,
    "& .MuiInputLabel-root": { color: sub },
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      "& .MuiOutlinedInput-notchedOutline": { borderColor: line },
      "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: dark ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.16)" },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT, borderWidth: 1 },
    },
  };

  const primaryBtnSx = {
    py: 1.5, fontWeight: 700, fontSize: 14.5, borderRadius: "12px",
    background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`,
    color: "#fff", boxShadow: `0 4px 24px ${ACCENT}40`,
    transition: "transform 200ms ease, box-shadow 200ms ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: `0 8px 32px ${ACCENT}50` },
  };

  const cardSx = { p: 0, background: "transparent" };

  // If user visits /login while signed in — show switch account prompt
  const currentUser = user || auth.currentUser;
  if (currentUser) {
    return (
      <AuthExperience>
        <Box sx={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>

          <Box component="form" onSubmit={(event) => { event.preventDefault(); if (!loading) handleEmailLogin(); }} sx={cardSx}>
            <Box sx={{ textAlign: "center" }}>
              <Avatar src={currentUser.photoURL || ""} sx={{ width: 64, height: 64, mx: "auto", mb: 2, border: `2px solid ${ACCENT}55` }}>{currentUser.displayName?.[0]}</Avatar>
              <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{currentUser.displayName || "User"}</Typography>
              <Typography sx={{ fontSize: 12.5, color: muted, mb: 3 }}>{currentUser.email}</Typography>
            </Box>
            <Alert severity="info" sx={{ mb: 3, textAlign: "left", borderRadius: "12px", background: `${ACCENT}0e`, border: `1px solid ${ACCENT}22`, color: fg, "& .MuiAlert-icon": { color: ACCENT } }}>
              You're currently signed in. Sign out first to log in with a different account.
            </Alert>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Button fullWidth variant="contained" onClick={() => navigate("/dashboard")} endIcon={<ArrowForwardIcon />} sx={primaryBtnSx}>
                Continue as {currentUser.displayName?.split(" ")[0] || "User"}
              </Button>
              <Button fullWidth variant="outlined" startIcon={<LogoutIcon />}
                onClick={async () => { await signOut(auth); toast.success("Signed out"); navigate("/login"); }}
                sx={{ borderRadius: "12px", py: 1.4, borderColor: line, color: sub, fontWeight: 600, "&:hover": { borderColor: "#F43F5E88", color: "#F43F5E", background: "#F43F5E0a" } }}>
                Sign out & switch account
              </Button>
            </Box>
          </Box>
        </Box>
      </AuthExperience>
    );
  }

  return (
    <AuthExperience>
      <Box sx={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>


        <Box component="form" onSubmit={(event) => { event.preventDefault(); if (!loading) handleEmailLogin(); }} sx={cardSx}>
          <Typography component="h1" sx={{ fontWeight: 500, fontSize: 36, letterSpacing: "-.045em", mb: .5 }}>
            {resetMode ? "Reset your password" : "Welcome back"}
          </Typography>
          <Typography sx={{ fontSize: 13, color: sub, mb: 3.5 }}>
            {resetMode ? "Enter your email and we'll send a reset link." : "Sign in to pick up right where you left off."}
          </Typography>

          {resetSent ? (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Box sx={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", background: "#10B98118", mx: "auto", mb: 2.5 }}>
                <CheckCircleIcon sx={{ fontSize: 28, color: "#10B981" }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, mb: .8 }}>Check your inbox</Typography>
              <Typography sx={{ fontSize: 13, color: sub, mb: 3 }}>We sent a reset link to <Box component="span" sx={{ color: fg, fontWeight: 600 }}>{email}</Box></Typography>
              <Button variant="outlined" onClick={() => { setResetMode(false); setResetSent(false); }} sx={{ borderRadius: "12px", borderColor: line, color: fg, fontWeight: 600, px: 3 }}>Back to sign in</Button>
            </Box>
          ) : (
            <>
              {!resetMode && (
                <>
                  <Button fullWidth variant="outlined" startIcon={<GoogleIcon sx={{ fontSize: 18 }} />} onClick={handleGoogle} disabled={loading}
                    sx={{
                      mb: 2.5, py: 1.4, borderRadius: "12px", borderColor: line, color: fg, fontWeight: 600, fontSize: 13.5,
                      "&:hover": { borderColor: dark ? "rgba(255,255,255,.2)" : "rgba(15,23,42,.2)", background: dark ? "rgba(15,23,42,.03)" : "rgba(15,23,42,.02)" }
                    }}>
                    Continue with Google
                  </Button>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
                    <Divider sx={{ flex: 1, borderColor: line }} />
                    <Typography sx={{ fontSize: 11, color: muted, letterSpacing: ".04em" }}>OR WITH EMAIL</Typography>
                    <Divider sx={{ flex: 1, borderColor: line }} />
                  </Box>
                </>
              )}

              <TextField fullWidth label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                error={!!errors.email} helperText={errors.email} sx={iSx}
                InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ fontSize: 17, color: muted }} /></InputAdornment> }} />

              {!resetMode && (
                <TextField fullWidth label="Password" autoComplete="current-password" type={showPwd ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} error={!!errors.password} helperText={errors.password} sx={iSx}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockIcon sx={{ fontSize: 17, color: muted }} /></InputAdornment>,
                    endAdornment: <InputAdornment position="end"><IconButton aria-label={showPwd ? "Hide password" : "Show password"} size="small" onClick={() => setShowPwd(v => !v)} sx={{ color: muted }}>{showPwd ? <VisibilityOff sx={{ fontSize: 17 }} /> : <Visibility sx={{ fontSize: 17 }} />}</IconButton></InputAdornment>,
                  }} />
              )}

              <Button fullWidth variant="contained" type="submit" disabled={loading} sx={{ ...primaryBtnSx, mb: 2 }}>
                {loading ? <PulseDot color="#fff" size={7} /> : resetMode ? "Send reset link" : "Sign in"}
              </Button>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Button size="small" onClick={() => { setResetMode(!resetMode); setErrors({}); }} sx={{ color: sub, fontSize: 12.5, fontWeight: 600, p: 0, minWidth: 0, "&:hover": { color: fg, background: "transparent" } }}>
                  {resetMode ? "← Back to sign in" : "Forgot password?"}
                </Button>
                <Button size="small" onClick={() => navigate("/register")} sx={{ color: ACCENT, fontSize: 12.5, fontWeight: 700, p: 0, minWidth: 0, "&:hover": { color: VIOLET, background: "transparent" } }}>
                  Create account →
                </Button>
              </Box>
            </>
          )}
        </Box>

        {/* Trust row — matches the hero's "Check icon + muted text" pattern */}
        <Box sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 2.5, mt: 3.5 }}>
          {["Verification", "Workspaces", "Team access"].map((label) => (
            <Box key={label} sx={{ display: "flex", alignItems: "center", gap: .6 }}>
              <CheckIcon sx={{ fontSize: 13, color: "#10B981" }} />
              <Typography sx={{ fontSize: 11.5, color: muted }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </AuthExperience>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS PAGE
// ═══════════════════════════════════════════════════════════════════════
