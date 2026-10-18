// PasswordReauth.jsx — Re-authentication modal.
// Triggered when a sensitive action requires recent auth.

import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, CircularProgress,
  Alert
} from "@mui/material";
import { reauthenticateWithPassword, reauthenticateWithGoogle } from "../../../lib/reauthentication";
import { signInMethods } from '../../../lib/signInMethods';

export function PasswordReauth({ open, user, actionName, onSuccess, onCancel, returnTo = "/account?section=security" }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (!open) { setPassword(""); setError(null); } }, [open]);

  // If user signed in with Google, we should prompt them to re-auth with Google instead
  const methods=signInMethods(user);
  const isGoogle=methods.google && !methods.email;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!isGoogle && !password) return;

    setLoading(true);
    setError(null);
    try {
      if (isGoogle) {
        await reauthenticateWithGoogle(undefined, returnTo);
        // The page will redirect away to Google
      } else {
        await reauthenticateWithPassword(user, password);
        setPassword("");
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={!loading ? onCancel : undefined} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Security Check</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: "var(--acct-muted)", mb: 3, fontSize: 14 }}>
          {actionName ? `To ${actionName.toLowerCase()}` : "To continue"}, please verify it's you.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {isGoogle ? (
          <Box sx={{ textAlign: "center", py: 2 }}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
              sx={{
                background: "#fff",
                color: "#000",
                "&:hover": { background: "#f1f5f9" },
                border: "1px solid #e2e8f0",
                textTransform: "none",
                fontWeight: 500,
                px: 3,
                py: 1,
              }}
            >
              {loading ? <CircularProgress size={20} /> : "Verify with Google"}
            </Button>
          </Box>
        ) : (
          <form id="reauth-form" onSubmit={handleSubmit}>
            <TextField
              autoFocus
              fullWidth
              type="password"
              label="Current password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  "&.Mui-focused fieldset": { borderColor: "var(--acct-brand)" },
                }
              }}
            />
          </form>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
        {methods.google && methods.email && <Button disabled={loading} onClick={async()=>{setLoading(true);try{await reauthenticateWithGoogle(undefined,returnTo);}catch(err){setError(err.message);}finally{setLoading(false);}}}>Use Google instead</Button>}
        <Button onClick={onCancel} disabled={loading} sx={{ color: "var(--acct-muted)" }}>
          Cancel
        </Button>
        {!isGoogle && (
          <Button
            type="submit"
            form="reauth-form"
            variant="contained"
            disabled={loading || !password}
            sx={{
              background: "var(--acct-brand)",
              "&:hover": { background: "color-mix(in oklch, var(--acct-brand) 85%, black)" },
              borderRadius: 2,
              px: 3,
            }}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : "Verify"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
