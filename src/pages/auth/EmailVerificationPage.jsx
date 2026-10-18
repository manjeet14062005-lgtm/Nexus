import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import MailOutline from '@mui/icons-material/MailOutline';
import ArrowForward from '@mui/icons-material/ArrowForward';
import Refresh from '@mui/icons-material/Refresh';
import { AuthExperience } from '../../components/common/AuthExperience';
import { auth, onAuthStateChanged, checkEmailConfirmation, sendEmailVerification, signOut } from '../../lib/supabaseAuth';
import { OTP_SERVER_URL } from '../../core/appConstants';
import { toast } from 'react-hot-toast';

const remainingCooldown = () => Math.max(0, Math.min(60, Math.ceil((Number(sessionStorage.getItem('nexus_signup_email_sent_at') || 0) + 60000 - Date.now()) / 1000)));
const missingSession = error => error?.name === 'AuthSessionMissingError' || error?.code === 'session_not_found';

export function EmailVerificationPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [verified, setVerified] = useState(Boolean(auth.currentUser?.emailVerified));
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const completedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(remainingCooldown);
  const email = user?.email || localStorage.getItem('nexus_pending_verification_email') || '';

  const checkServerVerification = useCallback(async (candidateEmail) => {
    if (!candidateEmail) return false;
    const response = await fetch(`${OTP_SERVER_URL}/auth/check-email-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: candidateEmail }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.verified !== 'boolean') throw new Error(data.message || 'Unable to check email verification.');
    return data.verified;
  }, []);

  const completeVerification = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setVerified(true);
    localStorage.removeItem('nexus_pending_verification_email');
    try { await signOut(auth, { scope: 'local' }); } catch (err) { if (!missingSession(err)) console.warn('Unable to clear verification session before sign-in:', err); }
    toast.success('Email verified. Please sign in.');
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => onAuthStateChanged(auth, next => {
    setUser(next);
    if (next?.emailVerified) completeVerification();
  }), [completeVerification]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown(remainingCooldown()), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const checkOnFocus = async () => {
      setCooldown(remainingCooldown());
      if (document.hidden || busyRef.current || completedRef.current) return;
      try {
        const updated = await checkEmailConfirmation();
        if (updated?.emailVerified) await completeVerification();
      } catch (err) {
        if (!missingSession(err)) setError(err?.message || 'Unable to check verification. Please try again.');
      }
    };
    checkOnFocus();
    window.addEventListener('focus', checkOnFocus);
    document.addEventListener('visibilitychange', checkOnFocus);
    return () => { window.removeEventListener('focus', checkOnFocus); document.removeEventListener('visibilitychange', checkOnFocus); };
  }, [completeVerification]);

  const check = async () => {
    if (busyRef.current || completedRef.current) return;
    busyRef.current = true; setBusy('check'); setError(''); setMessage('');
    try {
      let isVerified = false;
      try {
        const updated = await checkEmailConfirmation();
        isVerified = updated?.emailVerified === true;
      } catch { }

      if (!isVerified && email) isVerified = await checkServerVerification(email);

      if (isVerified) {
        await completeVerification();
      } else {
        const text = 'You have not verified the email yet.';
        setMessage(text);
        toast.error(text);
      }
    } catch (err) {
      const text = err?.message || 'We could not check your verification. Please try again.';
      setError(text);
      toast.error(text);
    } finally { busyRef.current = false; setBusy(''); }
  };
  const resend = async () => {
    if (!email || cooldown || busyRef.current) return;
    busyRef.current = true; setBusy('resend'); setError(''); setMessage('');
    try {
      await sendEmailVerification({ email });
      sessionStorage.setItem('nexus_signup_email_sent_at', String(Date.now()));
      setCooldown(60); setMessage('If this email belongs to an account awaiting confirmation, a new link has been requested. Already verified? Sign in instead—confirmed accounts do not need another signup email.');
    } catch (err) {
      if (err?.status === 429 || err?.code === 'over_email_send_rate_limit') {
        sessionStorage.setItem('nexus_signup_email_sent_at', String(Date.now()));
        setCooldown(60);
      }
      setError(err?.status === 429 ? 'Please wait before requesting another email.' : 'We could not send another link. Please try again shortly.');
    } finally { busyRef.current = false; setBusy(''); }
  };
  return <AuthExperience>
    <Box sx={{ width: 76, height: 76, display: 'grid', placeItems: 'center', bgcolor: '#edf5e9', color: '#245d48', border: '1px solid #d5e5d0', borderRadius: '24px', mb: 3, boxShadow: '0 12px 30px #245d4810', transform: 'rotate(-6deg)' }}>
      {verified ? <CheckCircleOutline sx={{ fontSize: 36 }} /> : <MailOutline sx={{ fontSize: 36 }} />}
    </Box>
    <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: '#5a7464', mb: 1.5 }}>THE FINAL CONNECTION</Typography>
    <Typography component="h1" sx={{ fontSize: { xs: 38, md: 46 }, letterSpacing: '-.05em', lineHeight: 1.08, color: '#183c35', mb: 2 }}>{verified ? 'You’re connected.' : <>Your inbox.<br /><Box component="span" sx={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#628573' }}>Your next chapter.</Box></>}</Typography>
    <Typography sx={{ fontSize: 14, lineHeight: 1.8, color: '#607268', mb: 3 }}>{verified ? 'Email confirmed. Opening the sign-in page…' : 'Confirm your email to finish setting up your account and enter your workspace.'}</Typography>
    <Box component="ol" aria-label="Account setup progress" sx={{ display: 'flex', listStyle: 'none', p: 0, gap: 2, mb: 3, fontSize: 11, color: '#5b7465' }}>
      {['Account', 'Confirm email', 'Sign in'].map((label, i) => <Box component="li" key={label} aria-current={i === (verified ? 2 : 1) ? 'step' : undefined} sx={{ flex: 1, borderTop: '3px solid', borderColor: i < (verified ? 3 : 2) ? '#34785e' : '#e2e9e0', pt: 1.2 }}>{i + 1}. {label}</Box>)}
    </Box>
    {!verified && <>
      <Box sx={{ p: 2.5, border: '1px solid #dce7dc', borderRadius: 3, mb: 2.5, bgcolor: '#fafcf8' }}>
        <Typography sx={{ fontSize: 10, letterSpacing: 1.2, color: '#607268', mb: .7 }}>CONFIRMATION EMAIL</Typography>
        <Typography sx={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{email || 'Sign in or register to get a verification link.'}</Typography>
        <Typography sx={{ fontSize: 12, color: '#607268', mt: 1 }}>Open the latest Nexus email and select the confirmation link. Check Spam if it hasn’t arrived.</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
      {!user && <Typography sx={{ fontSize: 12, mb: 2 }}>Already clicked a confirmation link? Your email may already be verified. Sign in below; Nexus checks your verification securely before opening your workspace.</Typography>}
      <Button fullWidth variant="contained" disabled={!!busy} onClick={check} endIcon={busy === 'check' ? <CircularProgress size={16} color="inherit" /> : <ArrowForward />} sx={{ py: 1.6, mb: 1.5, borderRadius: 2.5 }}>{busy === 'check' ? 'Checking verification…' : 'I’ve verified my email'}</Button>
      {!user && <Button component={Link} to="/login" fullWidth variant="outlined" sx={{ py: 1.4, mb: 1.5, borderRadius: 2.5 }}>Already verified? Sign in</Button>}
      <Button fullWidth variant="outlined" onClick={resend} disabled={!!busy || cooldown > 0 || !email} startIcon={<Refresh />} sx={{ py: 1.4, borderColor: '#dce7dc', color: '#245d48', borderRadius: 2.5 }}>{busy === 'resend' ? 'Requesting email…' : cooldown ? `Resend available in ${cooldown}s` : 'Resend confirmation email'}</Button>
      <Button onClick={async () => { if (auth.currentUser) await signOut(auth); localStorage.removeItem('nexus_pending_verification_email'); navigate('/login'); }} sx={{ mt: 2, width: '100%', color: '#607268', fontSize: 12 }}>Use a different account</Button>
      <Typography sx={{ fontSize: 11, color: '#738178', textAlign: 'center', mt: 2 }}>Need a hand? <Link to="/privacy">Contact support ↗</Link></Typography>
    </>}
    {verified && <Box role="status" sx={{ p: 2, bgcolor: '#edf5e9', borderRadius: 3 }}>✓ Email verified. Taking you to sign in.</Box>}
  </AuthExperience>;
}
export default EmailVerificationPage;
