// SectionPrivacy.jsx — Data, privacy, and account deletion.

import { useState, useEffect } from "react";
import { Box, Typography, Button, Divider, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { BentoBox } from "./BentoBox";
import { getDeletionCountdown } from "../lib/deletionCountdown";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SecurityIcon from "@mui/icons-material/Security";

export function SectionPrivacy({ profileData, user, deletionRequest, actions, deletionError, refresh }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(value => value + 1), 60000); return () => clearInterval(timer); }, []);
  const countdown = deletionRequest?.status === 'pending' ? getDeletionCountdown(deletionRequest.executeAfter) : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Profile Visibility */}
      <BentoBox title="Profile Visibility" subtitle="Control who can see your profile.">
        <Typography sx={{ fontSize: 14, color: "var(--acct-muted)" }}>Your account profile is access-controlled. Public profile sharing is not currently available.</Typography>
      </BentoBox>

      {/* Data Export */}
      <BentoBox title="Export Your Data" subtitle="Download a copy of your data.">
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Profile Data (CSV)</Typography>
              <Typography sx={{ fontSize: 13, color: "var(--acct-muted)" }}>Download your basic profile information as a spreadsheet.</Typography>
            </Box>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={actions.downloadProfileCsvLocal}>
              Download CSV
            </Button>
          </Box>
          <Divider />
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Personal Account Data (JSON)</Typography>
              <Typography sx={{ fontSize: 13, color: "var(--acct-muted)" }}>A bounded export of your profile, memberships, billing summary, tickets and account events. Workspace operations, conversation messages and provider logs are excluded. Limits are listed in the file.</Typography>
            </Box>
            <Button variant="outlined" startIcon={<DownloadIcon />} disabled={actions.pending}
              onClick={actions.downloadAccountDataJson}>
              Request JSON
            </Button>
          </Box>
        </Box>
      </BentoBox>

      {/* Danger Zone */}
      <BentoBox
        title="Danger Zone"
        sx={{ border: "1px solid var(--acct-danger)", background: "color-mix(in oklch, var(--acct-danger) 2%, transparent)" }}
      >
        {deletionError && <Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{deletionError}</Alert>}
        {['blocked', 'failed'].includes(deletionRequest?.status) && <Alert severity="warning" sx={{ mb: 2 }}>Deletion could not proceed. Resolve owned workspaces or active subscriptions before retrying, or contact support.</Alert>}
        {countdown ? (
          <Box sx={{ background: "color-mix(in oklch, var(--acct-danger) 10%, transparent)", p: 2, borderRadius: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "var(--acct-danger)", mb: 1 }}>
              <SecurityIcon fontSize="small" />
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Deletion Scheduled</Typography>
            </Box>
            <Typography sx={{ fontSize: 14, mb: 2 }}>
              Deletion becomes eligible after <strong>{new Date(deletionRequest.executeAfter).toLocaleString()}</strong>. Processing time can vary. You can cancel until cleanup starts.
            </Typography>
            <Button
              variant="contained"
              disabled={actions.pending}
              onClick={actions.cancelDeletion}
              sx={{ background: "var(--acct-surface)", color: "var(--acct-text)", "&:hover": { background: "var(--acct-border)" } }}
            >
              Cancel Deletion
            </Button>
          </Box>
        ) : ["processing", "failed", "completed", "blocked"].includes(deletionRequest?.status) ? (
          <Box sx={{ background: "color-mix(in oklch, var(--acct-danger) 10%, transparent)", p: 2, borderRadius: 2 }}>
            {deletionRequest.status === "blocked" && <Button disabled={actions.pending} onClick={actions.cancelDeletion}>Cancel request</Button>}
            <Typography sx={{ fontWeight: 600, color: "var(--acct-danger)" }}>Deletion status: {deletionRequest.status}. {deletionRequest.status === "processing" || deletionRequest.status === "failed" ? "Cleanup has started. Contact support for recovery; a new request cannot reverse completed removal." : "Contact support if you need assistance."}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 500, color: "var(--acct-danger)" }}>Delete Account</Typography>
              <Typography sx={{ fontSize: 13, color: "var(--acct-muted)" }}>
                Schedule removal of your personal account. Transfer owned workspaces and cancel active subscriptions first. Some legal and accounting records may be retained. Once cleanup starts, removal cannot be canceled.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={actions.pending || !!deletionError || deletionRequest === undefined}
              onClick={() => setConfirmDelete(true)}
              sx={{ borderColor: "var(--acct-danger)", color: "var(--acct-danger)" }}
            >
              Delete Account
            </Button>
          </Box>
        )}
      </BentoBox>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Schedule account deletion?</DialogTitle>
        <DialogContent>This schedules permanent removal after the grace period. You can cancel a pending request before it is processed. Owned workspaces and active subscriptions must be resolved first.</DialogContent>
        <DialogActions><Button onClick={() => setConfirmDelete(false)}>Keep account</Button><Button color="error" onClick={() => { setConfirmDelete(false); actions.requestDeletion(); }}>Schedule deletion</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
