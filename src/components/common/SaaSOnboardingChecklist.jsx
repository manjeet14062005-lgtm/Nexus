import { memo, useId, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, ButtonBase, Chip, Collapse, LinearProgress, Typography } from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/apiClient.js";
import { NEON } from "../../constants/theme";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";

const SETUP_TASKS = [
  { id: "apiKey", label: "Create an active API key", path: "/developer", permission: "api_keys.create", endpoint: "api-keys", complete: (data) => data.apiKeys?.some((key) => key.status === "active" && (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now())) },
  { id: "verification", label: "Send a test verification", path: "/developer", permission: "api_keys.create", endpoint: "verification-requests", complete: (data) => data.verificationRequests?.some((request) => request.environment === "test") },
  { id: "webhook", label: "Connect a webhook endpoint", path: "/developer", permission: "webhooks.manage", endpoint: "webhooks", complete: (data) => data.webhooks?.some((webhook) => webhook.enabled !== false && webhook.status === "active") },
  { id: "team", label: "Invite a teammate", path: "/workspace", permission: "members.invite", endpoint: "members", complete: (data) => data.members?.length > 1 },
];

export const SaaSOnboardingChecklist = memo(function SaaSOnboardingChecklist({ user, workspaceId, workspaceRole, darkMode }) {
  const navigate = useNavigate();
  const panelId = useId();
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const tasks = useMemo(() => SETUP_TASKS.filter((task) => hasWorkspacePermission(workspaceRole, task.permission)), [workspaceRole]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      if (!workspaceId || !user || !tasks.length) return;
      setLoading(true);
      setResult(null);
      try {
        const entries = await Promise.all(tasks.map(async (task) => {
          const data = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/${task.endpoint}`, { signal: controller.signal });
          return [task.id, Boolean(task.complete(data))];
        }));
        if (!cancelled) setResult({ user, workspaceId, workspaceRole, state: Object.fromEntries(entries) });
      } catch (_) {
        if (!cancelled) setResult({ user, workspaceId, workspaceRole, error: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; controller.abort(); };
  }, [user, workspaceId, workspaceRole, tasks, retry]);

  if (!tasks.length || loading || result?.workspaceId !== workspaceId || result?.workspaceRole !== workspaceRole || result?.user !== user) return null;
  if (result.error) return <Alert severity="warning" sx={{ mb: 2.5 }} action={<Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>}>Unable to load workspace setup progress.</Alert>;
  const state = result.state;
  const done = tasks.filter((task) => state[task.id]).length;
  const pct = Math.round((done / tasks.length) * 100);
  if (pct === 100) return null;

  return (
    <Box sx={{ mb: 2.5, borderRadius: 2, overflow: "hidden", border: `1px solid ${NEON.blue}18`, background: darkMode ? "rgba(10,22,40,.58)" : "rgba(255,255,255,.86)", backdropFilter: "blur(14px)" }}>
      <ButtonBase onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId} aria-label="Workspace setup progress" sx={{ display: "block", width: "100%", textAlign: "left", p: 2.2, "&:hover": { background: `${NEON.blue}06` } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.4 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", background: `${NEON.blue}12`, color: NEON.blue }}><RocketLaunchIcon fontSize="small" /></Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Your integration checklist</Typography>
            <Typography variant="caption" color="text.secondary">{done} of {tasks.length} complete · {open ? "Hide steps" : "View next steps"}</Typography>
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 800, color: NEON.blue }}>{pct}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={pct} sx={{ mt: 1.5, height: 5, borderRadius: 99, background: `${NEON.blue}12`, "& .MuiLinearProgress-bar": { borderRadius: 99, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})` } }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit id={panelId}>
        <Box sx={{ px: 2.2, pb: 2 }}>
          {tasks.map((task) => (
            <Box key={task.id} sx={{ display: "flex", alignItems: "center", gap: 1.3, py: .9, borderTop: "1px solid rgba(15,23,42,.04)" }}>
              <Box sx={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", background: state[task.id] ? `${NEON.green}15` : "rgba(15,23,42,.035)", color: state[task.id] ? NEON.green : "text.secondary" }}>
                {state[task.id] ? <TaskAltIcon sx={{ fontSize: 14 }} /> : <Typography sx={{ fontSize: 10, fontWeight: 800 }}>○</Typography>}
              </Box>
              <Typography variant="body2" sx={{ flex: 1, fontSize: 14, opacity: state[task.id] ? .45 : .8, textDecoration: state[task.id] ? "line-through" : "none" }}>{task.label}</Typography>
              {state[task.id] ? <Chip label="Done" size="small" sx={{ height: 24, fontSize: 12, color: NEON.green, background: `${NEON.green}12` }} /> : <Button variant="outlined" aria-label={`Open: ${task.label}`} size="small" endIcon={<ArrowForwardIcon sx={{ fontSize: 13 }} />} onClick={() => navigate(task.path)} sx={{ minWidth: 0, fontSize: 12, textTransform: "none" }}>Open</Button>}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});
