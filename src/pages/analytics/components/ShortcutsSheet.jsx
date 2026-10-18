import { analyticsPortalContainer } from "./portalContainer.js";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

const SHORTCUTS = [
  ["⌘/Ctrl K", "Open command palette"],
  ["1 / 2 / 3 / 4", "Switch to 7d / 30d / 90d / 1y"],
  ["R", "Refresh analytics"],
  ["E", "Export CSV when permitted"],
  ["?", "Open this shortcuts sheet"],
  ["← / →", "Scrub the main chart when focused"],
  ["Esc", "Reset chart zoom or close overlays"],
];

export function ShortcutsSheet({ open, onClose }) {
  return (
    <Dialog aria-label="Analytics keyboard shortcuts" container={analyticsPortalContainer} open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3, border: "1px solid var(--an-border-strong)", background: "var(--an-surface)", color: "var(--an-text)", boxShadow: "var(--an-shadow-3)" } }}>
      <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box><Typography sx={{ fontSize: 18, fontWeight: 880, letterSpacing: "-.025em" }}>Keyboard shortcuts</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Available while focus is outside a text field.</Typography></Box>
        <IconButton onClick={onClose} aria-label="Close shortcuts" sx={{ width: 44, height: 44, color: "var(--an-text-2)" }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important", pb: 2.2 }}>
        <Box sx={{ display: "grid", gap: .55 }}>
          {SHORTCUTS.map(([key, label]) => (
            <Box key={key} sx={{ minHeight: 46, px: 1.1, py: .8, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.2 }}>
              <Typography sx={{ fontSize: 12.5, color: "var(--an-text-2)" }}>{label}</Typography>
              <Typography component="kbd" sx={{ px: .8, py: .35, borderRadius: 1, fontFamily: '"JetBrains Mono",monospace', fontSize: 10.5, fontWeight: 800, color: "var(--an-text)", background: "var(--an-surface-raised)", border: "1px solid var(--an-border-strong)", boxShadow: "0 1px 0 var(--an-border-strong)" }}>{key}</Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
