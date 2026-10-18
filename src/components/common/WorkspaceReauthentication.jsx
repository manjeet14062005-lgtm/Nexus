import { useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { reauthenticateWithGoogle, reauthenticateWithPassword } from '../../lib/reauthentication';

export function WorkspaceReauthentication({ user, workspaceId, onVerified, returnPath, description }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const providers = (user?.providerData || []).map((item) => item.providerId);
  const hasGoogle = providers.some(provider => ['google', 'google.com'].includes(provider));
  const hasPassword = providers.includes('email') || !hasGoogle;
  const verify = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await reauthenticateWithPassword(user, password); setPassword(''); onVerified(); }
    catch (err) { setError(err.message || 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    <Typography sx={{ fontWeight: 600, mb: 1 }}>Confirm it’s you</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Sign in again as {user.email}. {description || 'This step does not delete the workspace.'}</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {hasPassword && <Box component="form" onSubmit={verify} sx={{ display: 'grid', gap: 1.5 }}>
      <TextField label="Current password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} fullWidth required />
      <Button type="submit" variant="contained" disabled={busy || !password}>{busy ? 'Verifying…' : 'Verify identity'}</Button>
    </Box>}
    {hasGoogle && <Button variant="outlined" fullWidth startIcon={<GoogleIcon />} disabled={busy} sx={{ mt: hasPassword ? 1.5 : 0 }} onClick={async () => {
      setBusy(true); setError('');
      try { await reauthenticateWithGoogle(workspaceId, returnPath); }
      catch (err) { setError(err.message || 'Google sign-in could not start.'); setBusy(false); }
    }}>Continue with Google</Button>}
  </Box>;
}
