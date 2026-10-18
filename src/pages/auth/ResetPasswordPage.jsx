import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '../../lib/supabaseClient';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data?.session || null);
      if (error) setError(error.message);
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError('Unable to open the recovery session. Request a new reset link.'); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { if (active) { setSession(next); setLoading(false); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirmation) return setError('Passwords do not match.');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true); setPassword(''); setConfirmation('');
    } catch (error) { setError(error.message || 'Unable to update your password.'); }
    finally { setSaving(false); }
  }
  return <Container maxWidth="sm" sx={{ py: { xs: 6, md: 12 } }}>
    <Box component="form" onSubmit={submit} sx={{ p: 4, borderRadius: 4, border: '1px solid rgba(99,102,241,.2)', bgcolor: 'background.paper' }}>
      <Stack spacing={3}>
        <Typography variant="h4">Set a new password</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {done ? <><Alert severity="success">Your password has been updated.</Alert><Button onClick={() => navigate('/dashboard')}>Continue to Nexus</Button></> : loading ? <Typography>Checking your reset link…</Typography> : !session ? <><Alert severity="warning">This reset link is invalid or expired. Request a new link from the sign-in page.</Alert><Button onClick={() => navigate('/login')}>Back to sign in</Button></> : <>
          <TextField required label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="At least 8 characters" />
          <TextField required label="Confirm new password" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</Button>
        </>}
      </Stack>
    </Box>
  </Container>;
}
