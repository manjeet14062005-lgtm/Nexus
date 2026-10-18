import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, InputAdornment, TextField } from '@mui/material';
import { PHONE_COUNTRIES, registrationPhone } from '../../../lib/registrationPhone';
import { apiRequest } from '../../../services/apiClient';
import { useUserProfile } from '../../../contexts/UserProfileContext';

export function AccountPhone({ user, profileData }) {
  const { updateProfile } = useUserProfile();
  const [country, setCountry] = useState('IN');
  const [phone, setPhone] = useState(profileData?.phone || '');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const destination = registrationPhone(phone, country);
  const locked = profileData?.phoneVerified === true && !!profileData?.phone;
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [deadline]);
  const change = () => { setSentTo(''); setCode(''); setError(''); };
  const request = async verify => {
    if (busyRef.current || locked || !destination || (!verify && remaining) || (verify && (sentTo !== destination || code.length !== 6))) return;
    busyRef.current = true; setBusy(verify ? 'verify' : 'send'); setError('');
    try {
      const result = await apiRequest(user, `/account/phone/${verify ? 'verify-otp' : 'send-otp'}`, { method: 'POST', body: JSON.stringify({ phone: destination, ...(verify ? { code } : {}) }) });
      if (verify) {
        if (!result.phoneVerified) throw new Error('Verification was not completed. Try again.');
        updateProfile({ phone: result.phone, phoneVerified: true }); setCode(''); setSentTo('');
      } else { setSentTo(destination); setRemaining(60); setDeadline(Date.now() + 60000); }
    } catch (err) { setError(err.message || 'Unable to verify phone. Please try again.'); }
    finally { busyRef.current = false; setBusy(''); }
  };
  if (locked) return <TextField fullWidth label="Phone Number" value={profileData.phone} InputProps={{ readOnly: true }} helperText="Verified and locked. This number cannot be edited manually." />;
  return <Box sx={{ display: 'grid', gap: 1.5 }}>
    <TextField fullWidth label="Phone Number" placeholder="Phone number" value={phone} disabled={!!busy} onChange={event => { setPhone(event.target.value); change(); }} helperText="Verify your number once. It will be locked after confirmation." inputProps={{ inputMode: 'tel', maxLength: 24 }} InputProps={{ startAdornment: <InputAdornment position="start"><select aria-label="Country calling code" value={country} disabled={!!busy} onChange={event => { setCountry(event.target.value); change(); }} style={{ width: 90, border: 0, background: 'transparent', font: 'inherit' }}>{PHONE_COUNTRIES.map(item => <option key={item.code} value={item.code}>+{item.dial} {item.code}{item.code === country ? '' : ` — ${item.name}`}</option>)}</select></InputAdornment> }} />
    <Button type="button" variant="outlined" disabled={!!busy || remaining > 0 || !destination} onClick={() => request(false)}>{busy === 'send' ? 'Sending…' : remaining ? `Resend in ${remaining}s` : sentTo ? 'Resend OTP' : 'Send OTP'}</Button>
    {sentTo && <><TextField label="Six-digit OTP" value={code} disabled={!!busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6 }} helperText={`Code sent to ${sentTo}`} /><Button type="button" variant="contained" disabled={!!busy || code.length !== 6} onClick={() => request(true)}>{busy === 'verify' ? 'Verifying…' : 'Verify and lock number'}</Button></>}
    {error && <Alert severity="error">{error}</Alert>}
  </Box>;
}
