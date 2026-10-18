import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import NorthEastRounded from "@mui/icons-material/NorthEastRounded";
import "./operations.css";

export const formatCount = value => Math.max(0, Number(value) || 0).toLocaleString();
export const formatDate = (value, time = false) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Not yet";
  return new Date(value).toLocaleString(undefined, time ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" });
};
export function OperationsShell({ darkMode, children }) {
  return <Box className="ops" data-operations-theme={darkMode ? "dark" : "light"}>{children}</Box>;
}
export function OperationsHeader({ number, title, description, actions }) {
  return <header className="ops-header"><div><div className="ops-eyebrow">NEXUS / OPERATIONS <span>{number}</span></div><Typography component="h1" className="ops-title">{title}<span className="ops-title-dot">.</span></Typography><p className="ops-description">{description}</p></div><div className="ops-actions">{actions}</div></header>;
}
export function WorkspaceSelect({ data, disabled = false }) {
  return <TextField select size="small" label="Workspace" value={data.workspaceId} onChange={e => data.setWorkspaceId(e.target.value)} disabled={disabled || data.loading} sx={{ minWidth: { xs: "100%", sm: 205 } }}>{data.workspaces.map(item => <MenuItem key={item.id} value={item.id}>{item.name || item.id}</MenuItem>)}</TextField>;
}
export function StatGrid({ items }) {
  return <div className="ops-stats">{items.map(({ label, value, note, icon: Icon }) => <div className="ops-stat" key={label}><div className="ops-stat-top"><span>{label}</span>{Icon && <Icon fontSize="small" />}</div><strong>{value}</strong><small>{note}</small></div>)}</div>;
}
export function SectionHeading({ label, title, description, action }) {
  return <div className="ops-section-heading"><div>{label && <div className="ops-eyebrow">{label}</div>}<Typography component="h2">{title}</Typography>{description && <p>{description}</p>}</div>{action}</div>;
}
export function EmptyState({ title, description, icon: Icon, action }) {
  return <div className="ops-empty">{Icon && <div className="ops-empty-icon"><Icon /></div>}<Typography component="h3">{title}</Typography><p>{description}</p>{action}</div>;
}
export function ErrorNotice({ error, retry }) {
  return error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={retry}>Retry</Button>}>{error}</Alert> : null;
}
export function StatusChip({ enabled, label }) {
  return <Chip size="small" className={enabled ? "ops-status ops-status-active" : "ops-status"} label={<><span className="ops-status-dot" />{label || (enabled ? "Active" : "Paused")}</>} />;
}
export function ConfirmPause({ item, busy, onClose, onConfirm, kind }) {
  return <Dialog open={Boolean(item)} onClose={() => !busy && onClose()} fullWidth maxWidth="xs"><DialogTitle>Pause {kind}?</DialogTitle><DialogContent><Typography>“{item?.name}” will stop {kind === "workflow" ? "responding to events" : "automatic delivery"}. Its configuration is retained.</Typography></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Keep active</Button><Button variant="contained" color="error" disabled={busy} onClick={onConfirm}>{busy ? "Pausing…" : "Pause"}</Button></DialogActions></Dialog>;
}
export function PrimaryAction({ children, ...props }) { return <Button variant="contained" className="ops-primary" endIcon={<ArrowForwardRounded />} {...props}>{children}</Button>; }
export function BusyLabel({ busy, children }) { return busy ? <><CircularProgress size={14} color="inherit" sx={{ mr: 1 }} />{children}</> : children; }
export function PlanNotice({ feature, plan }) {
  return <div className="ops-plan"><div><strong>{feature} is available on an upgraded plan.</strong><p>Your {plan || "current"} plan keeps existing configurations. Upgrade to activate this feature.</p></div><Button href="/billing" endIcon={<NorthEastRounded />}>Explore plans</Button></div>;
}
