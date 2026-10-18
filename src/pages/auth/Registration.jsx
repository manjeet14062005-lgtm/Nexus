import { PHONE_COUNTRIES, registrationPhone } from "../../lib/registrationPhone";
import { AuthExperience } from "../../components/common/AuthExperience.jsx";
import { PulseDot } from "../../components/common/PulseDot.jsx";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useMemo, useEffect } from "react";
import { Box, Button, Checkbox, FormControlLabel, IconButton, InputAdornment, LinearProgress, TextField, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ClearIcon from "@mui/icons-material/Clear";
import { OTP_SERVER_URL } from "../../core/appConstants.js";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { auth } from "../../lib/supabaseLegacy";
import { createUserWithEmailAndPassword } from "../../lib/supabaseAuth.js";
import { toast } from "react-hot-toast";

// Same tokens as LandingPage.jsx, kept local rather than imported so this
// file has no dependency on the landing page module.
const ACCENT  = "#245D48";
const VIOLET  = "#34785E";
const CYAN    = "#06B6D4";
const SUCCESS = "#10B981";
const DANGER  = "#F43F5E";
const WARNING = "#F59E0B";
// Kept as NEON-shaped object so every existing `NEON.x` reference below
// (error/warning/success states, focus colors) keeps working unmodified —
// only the underlying values move to the landing page's exact palette.
const NEON = { blue: ACCENT, purple: VIOLET, cyan: CYAN, green: SUCCESS, pink: DANGER, orange: WARNING };

const STEPS = ["Account", "Verify phone"];

function StepPills({ step }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <Box key={label} aria-current={active ? "step" : undefined} aria-label={`${label}: ${done ? "completed" : active ? "current step" : "upcoming"}`} sx={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
            <Box sx={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
              fontSize: 11.5, fontWeight: 700,
              background: done || active ? `linear-gradient(135deg,${NEON.blue},${NEON.purple})` : "transparent",
              border: (t) => done || active ? "none" : `1.5px solid ${t.palette.divider}`,
              color: done || active ? "#fff" : "text.secondary",
              transition: "background 200ms ease, border-color 200ms ease",
            }}>
              {done ? <CheckIcon sx={{ fontSize: 14 }} /> : i + 1}
            </Box>
            <Typography sx={{ fontSize: 10, ml: 0.7, color: active ? ACCENT : "text.secondary" }}>{label === "Photo & review" ? "Review" : label}</Typography>
            {i < STEPS.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mx: .8, borderRadius: 99, background: (t) => done ? `linear-gradient(90deg,${NEON.blue},${NEON.purple})` : t.palette.divider, transition: "background 200ms ease" }} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export function Registration({ user, darkMode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [signupError, setSignupError] = useState("");
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [phoneProof, setPhoneProof] = useState(null);
  const [otpError, setOtpError] = useState("");
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckRef = useRef(false);
  const cooldownRef = useRef(null);
  useEffect(() => () => clearInterval(cooldownRef.current), []);
  const phoneRef = useRef(null);
  const phoneFieldId = useRef(`f${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).current;

  // Preserve saved registration details, but always start the phone field empty.
  // A stale draft/autofill value must never lock the user into an old number.
  const [form, setForm] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem("regDraft") || "{}");
      const safeDraft = { name: draft.name || "", email: draft.email || "", phoneCountry: draft.phoneCountry || "IN" };
      localStorage.setItem("regDraft", JSON.stringify(safeDraft));
      return { ...safeDraft, phone: "", agree: false };
    } catch {
      return { phone: "" };
    }
  });
  const normalizePhone = (value) => String(value || "").replace(/[^\d+ ()-]/g, "").slice(0, 24);
  const fd = { name: "", email: "", password: "", agree: false, phoneCountry: "IN", ...form, phone: normalizePhone(form.phone) };
  const fullPhone = registrationPhone(fd.phone, fd.phoneCountry);
  const resetPhoneVerification = () => {
    setOtpVerified(false); setPhoneProof(null); setOtpSent(false); setOtp(""); setOtpError("");
  };

  useEffect(() => {
    if (!phoneProof) return undefined;
    const timer = setTimeout(() => { setOtpVerified(false); setPhoneProof(null); setOtpSent(false); setOtp(""); setErrors(previous => ({ ...previous, phone: "Phone verification expired. Request a new code." })); }, Math.max(0, phoneProof.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phoneProof]);

  const vName = fd.name.trim().length > 0;
  const vEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.email);
  const vPass = fd.password.length >= 6;

  const pwdStrength = useMemo(() => {
    const p = fd.password;
    if (!p) return { label: "", pct: 0, color: "transparent" };
    const strong = p.length >= 10 && /[A-Z]/.test(p) && /\d/.test(p) && /[!@#$%^&*]/.test(p);
    const med = p.length >= 7 && (/\d/.test(p) || /[!@#$%^&*]/.test(p));
    if (strong) return { label: "Strong", pct: 100, color: NEON.green };
    if (med) return { label: "Medium", pct: 60, color: NEON.orange };
    return { label: "Weak", pct: 30, color: NEON.pink };
  }, [fd.password]);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // Chrome (and some other browsers) will autofill a saved phone number into
  // type="tel" inputs even with autocomplete tricks, and can set that value
  // in a way that doesn't go through React's onChange — leaving the field
  // looking "stuck" with a number the user never typed and can't clear.
  // Belt-and-braces: wipe any autofilled value shortly after mount so the
  // field always starts genuinely empty and back in sync with React state.
  useEffect(() => {
    const clearIfAutofilled = () => {
      const el = phoneRef.current;
      if (el && el.value && !form.phone) {
        el.value = "";
      }
    };
    const t1 = setTimeout(clearIfAutofilled, 0);
    const t2 = setTimeout(clearIfAutofilled, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phone input intentionally remains a normal controlled field.
  // Do not poll the DOM: browser autofill/prefill can otherwise fight React state
  // and make the field appear impossible to edit.

  const fetchWithRetry = async (url, options, retries = 3, delayMs = 8000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
        return res;
      } catch (err) {
        if (attempt === retries) throw err;
        toast.loading(`Server waking up, retrying (${attempt}/${retries})`, { id: "otp-retry" });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  };



  const handleSendOtp = async () => {
    const rawPhone = fullPhone;
    if (!rawPhone) {
      toast.error("Enter a valid phone number for the selected country code."); return;
    }
    setOtpError(""); setOtpSending(true);
    toast.loading("Connecting to OTP server...", { id: "otp-retry" });
    try {
      const res = await fetchWithRetry(`${OTP_SERVER_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawPhone }),
      });
      toast.dismiss("otp-retry");
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        const dest = data.message?.split("to ")[1] || "your phone";
        toast.success(`OTP sent to ${dest}`);
        setOtpResendCooldown(60);
        cooldownRef.current = setInterval(() => {
          setOtpResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setOtpError(data.message || "Failed to send OTP");
        toast.error(data.message || "Failed to send OTP");
      }
    } catch (err) {
      toast.dismiss("otp-retry");
      const msg = "OTP server is unavailable. Please try again in 30 seconds.";
      setOtpError(msg);
      toast.error(msg, { duration: 5000 });
    }
    setOtpSending(false);
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length !== 6) {
      setOtpError("Enter the 6-digit OTP"); return;
    }
    setOtpError(""); setOtpVerifying(true);
    try {
      const res = await fetchWithRetry(`${OTP_SERVER_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, code: otp.trim(), email: fd.email.trim().toLowerCase() }),
      });
      toast.dismiss("otp-retry");
      const data = await res.json();
      if (data.verified && data.proof?.token) {
        setPhoneProof(data.proof);
        setOtpVerified(true);
        setErrors(previous => ({ ...previous, phone: "" }));
        toast.success("Phone verified successfully!");
      } else {
        setOtpError(data.message || "Incorrect OTP");
        toast.error(data.message || "Incorrect OTP");
      }
    } catch (err) {
      toast.dismiss("otp-retry");
      const msg = "OTP server is unavailable. Please try again in 30 seconds.";
      setOtpError(msg);
      toast.error(msg, { duration: 5000 });
    }
    setOtpVerifying(false);
  };

  const handleChange = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    set(k, v);
    if (k === "country") set("state", "");
    setErrors((p) => ({ ...p, [k]: "", ...(k === "country" ? { state: "" } : {}) }));
    if (k === "email") { setDuplicateEmail(false); resetPhoneVerification(); }
  };

  const continueAccount = async () => {
    if (emailCheckRef.current || !validateStep()) return;
    emailCheckRef.current = true; setCheckingEmail(true);
    try {
      const response = await fetch(`${OTP_SERVER_URL}/auth/check-registration-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.email.trim().toLowerCase() }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || typeof result.registered !== 'boolean') throw new Error(result.message || 'Unable to check your email. Please try again.');
      if (result.registered) {
        setDuplicateEmail(true);
        setErrors(previous => ({ ...previous, email: 'This email is already registered. Please sign in.' }));
      } else { setDuplicateEmail(false); setStep(1); }
    } catch (error) {
      setErrors(previous => ({ ...previous, email: error.name === 'TimeoutError' ? 'The email check timed out. Please try again.' : error.message || 'Unable to check your email. Please try again.' }));
    } finally { emailCheckRef.current = false; setCheckingEmail(false); }
  };

  const validateStep = () => {
    const e = {};
    if (step === 0) {
      if (!vName) e.name = "Enter the name you want your team to see";
      if (!vEmail) e.email = "Invalid email format";
      if (duplicateEmail) e.email = "Email already registered";
      if (!vPass) e.password = "Minimum 6 characters";
    }
    if (step === 1) {
      if (!fullPhone) e.phone = "Enter a valid phone number.";
      else if (!otpVerified || !phoneProof || phoneProof.expiresAt <= Date.now()) e.phone = "Verify your phone number before continuing.";
      if (!fd.agree) e.agree = "You must accept terms";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting.current || !validateStep()) return;
    if (!otpVerified || !phoneProof || phoneProof.expiresAt <= Date.now()) {
      setStep(1); setErrors({ phone: "Please verify your phone number again before submitting." }); return;
    }
    submitting.current = true;
    setSignupError("");
    setLoading(true);
    try {
      // Supabase Auth is the identity source. Profile fields are attached as
      // Auth user metadata so the database trigger can create the application
      // profile even when email confirmation is enabled and no session is
      // returned to the browser yet.
      const credential = await createUserWithEmailAndPassword(auth, fd.email.trim().toLowerCase(), fd.password, {
        name: fd.name.trim(),
        phone: fullPhone,
        agreedToTerms: fd.agree,
        phoneVerified: otpVerified,
        signupPhoneProof: phoneProof.token,
      });
      const createdUser = credential.user;

      // signUp sends confirmation automatically. An immediate resend hits the
      // provider cooldown after the account was already successfully created.
      sessionStorage.setItem("nexus_signup_email_sent_at", String(Date.now()));
      localStorage.removeItem("regDraft");
      localStorage.setItem("nexus_pending_verification_email", createdUser?.email || fd.email.trim().toLowerCase());
      toast.success(credential.session && createdUser?.emailVerified ? "Account created. Welcome to Nexus!" : "Check your inbox for the confirmation link to continue.");
      navigate("/verify-email", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      const msg = (code === "over_email_send_rate_limit" || err?.status === 429)
        ? "Please wait before requesting another email. If you already submitted registration, check your inbox or open the email verification page below."
        : (code === "auth/email-already-in-use" || code === "user_already_exists")
        ? "That email is already registered. Please sign in instead."
        : (code === "auth/invalid-email" || code === "invalid_credentials")
          ? "Please enter a valid email address."
          : (code === "auth/weak-password" || code === "password_too_short")
            ? "Choose a stronger password (at least 6 characters)."
            : (code === "auth/operation-not-allowed" || code === "provider_disabled")
              ? "Nexus email sign-up is temporarily unavailable. Please try again later or contact support."
              : code === "permission-denied" || code === "PERMISSION_DENIED"
                ? "Nexus could not save your profile. Please contact support if this continues."
                : code === "unavailable" || code === "failed-precondition"
                  ? "Nexus is temporarily unavailable. Please try again."
                  : err?.message
                    ? `Registration failed: ${err.message}`
                    : "Unable to complete registration. Please try again.";
      console.error("Registration failed:", err);
      setSignupError(msg);
      toast.error(msg, { duration: 7000 });
    }
    submitting.current = false;
    setLoading(false);
  };

  const iSx = {
    "& .MuiInputLabel-root": { position: "static", transform: "none", fontSize: 12, fontWeight: 500, mb: 0.6, color: "text.secondary" },
    "& .MuiInputLabel-shrink": { transform: "none" },
    "& .MuiOutlinedInput-root": { mt: 0 },
    "& .MuiOutlinedInput-notchedOutline legend": { display: "none" },
  };

  return (
    <AuthExperience registration>
        <Box sx={{ width: "100%" }}>
          <StepPills step={step} />

          <Box>
          <Box sx={{ mb: 4 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", mb: 0.5 }}>
              Step {step + 1} of {STEPS.length}
            </Typography>
            <Typography component="h1" variant="h4" sx={{ fontSize: 34, fontWeight: 500, letterSpacing: "-.04em" }}>
              {step === 0 && "Create your account"}
              {step === 1 && "Secure your connection"}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              {step === 0 && "Your name, your email. A workspace full of possibilities."}
              {step === 1 && "Verify your phone, then we’ll email you a confirmation link."}
            </Typography>
          </Box>

          {step === 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField fullWidth disabled={checkingEmail} label="Your name" autoComplete="name" value={fd.name} onChange={handleChange("name")} error={!!errors.name} helperText={errors.name} sx={iSx}
                InputProps={{ endAdornment: vName ? <CheckCircleIcon sx={{ color: NEON.green, fontSize: 17 }} /> : errors.name ? <ErrorOutlineIcon sx={{ color: NEON.pink, fontSize: 17 }} /> : null }}
              />
              <TextField fullWidth disabled={checkingEmail} label="Email address" autoComplete="email" type="email" value={fd.email} onChange={handleChange("email")} error={!!errors.email} helperText={errors.email} sx={iSx}
                InputProps={{ endAdornment: vEmail && !duplicateEmail ? <CheckCircleIcon sx={{ color: NEON.green, fontSize: 17 }} /> : errors.email ? <ErrorOutlineIcon sx={{ color: NEON.pink, fontSize: 17 }} /> : null }}
              />
              {duplicateEmail && <Button onClick={() => navigate("/login")} sx={{ alignSelf: "flex-start" }}>Sign in to your account</Button>}
              <TextField fullWidth disabled={checkingEmail} label="Password" autoComplete="new-password" type={showPassword ? "text" : "password"} value={fd.password} onChange={handleChange("password")} error={!!errors.password} sx={iSx}
                helperText={errors.password || (pwdStrength.label ? <Box component="span"><LinearProgress variant="determinate" value={pwdStrength.pct} sx={{ height: 3, borderRadius: 99, mt: 0.5, mb: 0.4, background: "rgba(128,128,128,0.15)", "& .MuiLinearProgress-bar": { background: pwdStrength.color } }} /><Box component="span" sx={{ color: pwdStrength.color, fontWeight: 600, fontSize: 11 }}>{pwdStrength.label}</Box></Box> : "At least 6 characters. A longer, unique password is better.")}
                InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} size="small">{showPassword ? <VisibilityOff sx={{ fontSize: 17 }} /> : <Visibility sx={{ fontSize: 17 }} />}</IconButton>{vPass && <CheckCircleIcon sx={{ color: NEON.green, fontSize: 17 }} />}</InputAdornment> }}
              />

            </Box>
          )}

          {step === 1 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField
                  fullWidth
                  label="Phone number"
                  required
                  error={!!errors.phone} helperText={errors.phone}
                  type="text"
                  inputRef={phoneRef}
                  value={fd.phone || ""}
                  onChange={(e) => {
                    const next = normalizePhone(e.target.value);
                    set("phone", next);
                    resetPhoneVerification();
                    setErrors((p) => ({ ...p, phone: "" }));
                  }}
                  disabled={otpSending || otpVerifying}
                  placeholder="Enter phone number"
                  inputProps={{
                    inputMode: "tel",
                    autoComplete: "off",
                    name: phoneFieldId,
                    id: phoneFieldId,
                    autoCapitalize: "none",
                    spellCheck: false,
                    maxLength: 24,
                    pattern: "[0-9]*",
                  }}
                  sx={{ ...iSx, flex: 1, "& input::placeholder": { color: "text.secondary", opacity: 0.55 } }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start" sx={{ maxHeight: "none", mr: 1.5, pr: 1, borderRight: "1px solid #dce4dc" }}>
                      <select
                        aria-label="Country calling code"
                        value={fd.phoneCountry}
                        disabled={otpSending || otpVerifying}
                        onChange={(event) => {
                          set("phoneCountry", event.target.value);
                          resetPhoneVerification();
                          setErrors(previous => ({ ...previous, phone: "" }));
                        }}
                        style={{ width: 100, minHeight: 38, border: 0, borderRadius: 4, background: "transparent", color: "#245d48", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                      >
                        {PHONE_COUNTRIES.map(country => <option key={country.code} value={country.code}>+{country.dial} {country.code} — {country.name}</option>)}
                      </select>
                    </InputAdornment>,
                    endAdornment: otpVerified ? (
                      <CheckCircleIcon sx={{ color: NEON.green, fontSize: 18 }} />
                    ) : fd.phone ? (
                      <IconButton
                        size="small"
                        edge="end"
                        aria-label="Clear phone number"
                        onClick={() => { set("phone", ""); resetPhoneVerification(); if (phoneRef.current) phoneRef.current.value = ""; }}
                        sx={{ p: 0.5 }}
                      >
                        <ClearIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    ) : null,
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={otpResendCooldown > 0 ? undefined : handleSendOtp}
                  disabled={otpVerified || otpSending || otpVerifying || otpResendCooldown > 0 || !fullPhone}
                  sx={{
                    alignSelf: "flex-end", height: 40,
                    borderColor: otpVerified ? NEON.green : NEON.blue,
                    color: otpVerified ? NEON.green : NEON.blue,
                    whiteSpace: "nowrap", px: 2, minWidth: 110,
                    opacity: otpResendCooldown > 0 ? 0.6 : 1,
                  }}
                >
                  {otpVerified ? "Verified" : otpSending ? <PulseDot color="#fff" size={6} /> : otpResendCooldown > 0 ? `Resend ${otpResendCooldown}s` : otpSent ? "Resend OTP" : "Send OTP"}
                </Button>
              </Box>

              {!otpVerified && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField
                      label="Enter 6-digit OTP"
                      disabled={!otpSent || otpVerifying}
                      placeholder="6-digit code"
                      helperText={!otpSent ? "Select your country code, enter your number, then send an OTP." : ""}
                      value={otp}
                      onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
                      sx={{ ...iSx, flex: 1 }}
                      inputProps={{ autoComplete: "one-time-code", maxLength: 6, inputMode: "numeric", pattern: "[0-9]*" }}
                      error={!!otpError}
                      onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyOtp()}
                      InputProps={{ endAdornment: otp.length === 6 ? <CheckCircleIcon sx={{ color: NEON.blue, fontSize: 17 }} /> : null }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleVerifyOtp}
                      disabled={!otpSent || otpVerifying || otp.length !== 6}
                      sx={{ mt: 3, height: 40, minWidth: 90 }}
                    >
                      {otpVerifying ? <PulseDot color="#fff" size={6} /> : "Verify"}
                    </Button>
                  </Box>
                  {otpError && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                      <ErrorOutlineIcon sx={{ fontSize: 14, color: NEON.pink }} />
                      <Typography variant="caption" sx={{ color: NEON.pink, fontSize: 11 }}>{otpError}</Typography>
                    </Box>
                  )}
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 10 }}>
                    {otpSent ? `OTP sent to ${fullPhone}. Check your SMS inbox.` : ""}
                  </Typography>
                </Box>
              )}
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#f4f8f3", overflowWrap: "anywhere" }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Your confirmation link will go to</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mt: .5 }}>{fd.email}</Typography>
                <Button size="small" onClick={() => setStep(0)} sx={{ p: 0, mt: .5 }}>Edit account details</Button>
              </Box>
              <FormControlLabel
                control={<Checkbox checked={fd.agree} onChange={handleChange("agree")} sx={{ "&.Mui-checked": { color: NEON.blue } }} />}
                label={<Typography variant="body2" sx={{ fontSize: 12 }}>I accept the{" "}
                  <Box component="a" href="/terms" target="_blank" rel="noopener noreferrer" sx={{ color: NEON.blue, cursor: "pointer", "&:hover": { opacity: 0.75 } }}>Terms & Conditions</Box>
                  {" "}and{" "}
                  <Box component="a" href="/privacy" target="_blank" rel="noopener noreferrer" sx={{ color: NEON.blue, cursor: "pointer", "&:hover": { opacity: 0.75 } }}>Privacy Policy</Box>
                </Typography>}
              />
              {errors.agree && <Typography variant="caption" sx={{ color: NEON.pink, display: "block", mt: -1.5 }}>{errors.agree}</Typography>}
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 4 }}>
            {step > 0 && <Button variant="outlined" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          </Box>

          {signupError && <Box role="alert" sx={{ mt: 2, p: 2, bgcolor: "#fff3f0", borderRadius: 2 }}>
            <Typography sx={{ fontSize: 13 }}>{signupError}</Typography>
            <Button onClick={() => { localStorage.setItem("nexus_pending_verification_email", fd.email.trim().toLowerCase()); navigate("/verify-email"); }}>Open email verification</Button>
          </Box>}
          {step < 1 ? (
            <Button
              fullWidth variant="contained" size="large"
              onClick={continueAccount}
              disabled={checkingEmail}
              endIcon={<ArrowForwardIcon />}
              sx={{ mt: 1.5, py: 1.5, borderRadius: "12px", fontWeight: 700, fontSize: 14.5, background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})`, boxShadow: `0 4px 24px ${NEON.blue}40`, transition: "transform 200ms ease, box-shadow 200ms ease", "&:hover": { transform: "translateY(-1px)", boxShadow: `0 8px 32px ${NEON.blue}50` } }}
            >
              {checkingEmail ? "Checking email…" : "Continue"}
            </Button>
          ) : (
            <Button
              fullWidth variant="contained" size="large"
              onClick={handleSubmit}
              disabled={loading || !fd.agree}
              endIcon={loading ? <PulseDot color="#fff" size={7} /> : <ArrowForwardIcon />}
              sx={{ mt: 1.5, py: 1.5, borderRadius: "12px", fontWeight: 700, fontSize: 14.5, background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})`, boxShadow: `0 4px 24px ${NEON.blue}40`, transition: "transform 200ms ease, box-shadow 200ms ease", "&:hover": { transform: "translateY(-1px)", boxShadow: `0 8px 32px ${NEON.blue}50` } }}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>
          )}
          </Box>
        </Box>
    </AuthExperience>
  );
}
