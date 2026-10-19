import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Select, Skeleton, Tab, Tabs, TextField, Typography
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AddIcon from "@mui/icons-material/Add";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import TerminalIcon from "@mui/icons-material/Terminal";
import SecurityIcon from "@mui/icons-material/Security";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import WebhookIcon from "@mui/icons-material/Webhook";
import ReplayIcon from "@mui/icons-material/Replay";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { toast } from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { NEON } from "../../constants/theme";
import { apiRequest } from "../../services/apiClient.js";
import { hasWorkspacePermission, labelWorkspaceRole } from "../../lib/workspacePermissions.js";
import { QuickstartBench } from "./QuickstartBench.jsx";
import "./developer.css";

const PERMISSIONS = ["verification:read", "verification:write"];

function surface() {
  return {
    border: "1px solid var(--dev-line)",
    borderRadius: 3,
    background: "var(--dev-paper)",
  };
}

export function DeveloperPortal({ user, darkMode }) {
  const [searchParams] = useSearchParams();
  const currentWorkspace = useRef("");
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [entitlements, setEntitlements] = useState(null);
  const [eventOptions, setEventOptions] = useState([]);
  const [activeTab, setActiveTab] = useState(() => ({ keys: 0, quickstart: 1, webhooks: 2, logs: 3 }[searchParams.get("tab")] ?? 0));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("test");
  const [expirationDays, setExpirationDays] = useState("never");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnvironment, setWebhookEnvironment] = useState("all");
  const [selectedEvents, setSelectedEvents] = useState(["webhook.test", "verification.created", "verification.completed"]);
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceAccess, setWorkspaceAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState("");
  const [mutating, setMutating] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const requestedTab = { keys: 0, quickstart: 1, webhooks: 2, logs: 3 }[searchParams.get("tab")];
    if (requestedTab != null) setActiveTab(requestedTab);
  }, [searchParams]);

  const workspace = useMemo(() => {
    const base = workspaces.find((item) => item.id === workspaceId) || null;
    return base && workspaceAccess?.workspace?.id === base.id ? { ...base, role: workspaceAccess.workspace.role } : base;
  }, [workspaces, workspaceId, workspaceAccess]);
  const resolvedRole = workspaceAccess?.workspace?.id === workspaceId ? workspaceAccess.workspace.role : null;
  const canManageKeys = hasWorkspacePermission(resolvedRole, "api_keys.create");
  const canRevokeKeys = hasWorkspacePermission(resolvedRole, "api_keys.revoke");
  const canReadLogs = hasWorkspacePermission(resolvedRole, "logs.read");
  const canManageWebhooks = hasWorkspacePermission(resolvedRole, "webhooks.manage");
  const canUseWebhooks = canManageWebhooks && Boolean(entitlements?.plan?.featureFlags?.webhooks);

  const loadWorkspaces = useCallback(async () => {
    setWorkspaceError("");
    try {
      const result = await apiRequest(user, "/workspaces");
      const rows = Array.isArray(result.workspaces) ? result.workspaces : [];
      setWorkspaces(rows);
      if (!rows.length) setLoading(false);
      setWorkspaceId((current) => rows.some((row) => row.id === current) ? current : rows.find(row => row.id === searchParams.get("workspace"))?.id || rows[0]?.id || "");
    } catch (error) {
      setWorkspaceError(error.message || "Unable to load workspaces.");
      setLoading(false);
      throw error;
    }
  }, [user, searchParams]);

  async function loadKeys(id = workspaceId) {
    if (!id) return;
    const result = await apiRequest(user, `/workspaces/${encodeURIComponent(id)}/api-keys`);
    if (currentWorkspace.current === id) setApiKeys(result.apiKeys || []);
  }

  async function loadWebhooks(id = workspaceId) {
    if (!id) return;
    const [result, events] = await Promise.all([
      apiRequest(user, `/workspaces/${encodeURIComponent(id)}/webhooks`),
      apiRequest(user, `/workspaces/${encodeURIComponent(id)}/webhooks/events`),
    ]);
    if (currentWorkspace.current === id) { setWebhooks(result.webhooks || []); setEventOptions(events.events || []); }
  }

  useEffect(() => {
    loadWorkspaces().catch(() => {});
  }, [loadWorkspaces]);

  useEffect(() => {
    const controller = new AbortController();
    currentWorkspace.current = workspaceId;
    setWorkspaceAccess(null); setApiKeys([]); setWebhooks([]); setApiLogs([]);
    setEntitlements(null); setNewSecret(""); setWebhookSecret(""); setWorkspaceError("");
    setDialogOpen(false); setWebhookDialogOpen(false); setDeliveriesOpen(false); setDeliveries([]);
    setConfirmation(null);
    setSearch("");
    if (!workspaceId) return () => controller.abort();
    setLoading(true);
    const base = '/workspaces/' + encodeURIComponent(workspaceId);
    const request = (path) => apiRequest(user, base + path, { signal: controller.signal });
    (async () => {
      try {
        const [access, entitlementResult] = await Promise.all([request('/access'), request('/entitlements')]);
        if (controller.signal.aborted) return;
        setWorkspaceAccess(access);
        setEntitlements(entitlementResult);
        const role = access.workspace?.role;
        const loaders = [];
        if (hasWorkspacePermission(role, 'api_keys.read')) loaders.push(request('/api-keys').then((r) => { if (!controller.signal.aborted) setApiKeys(r.apiKeys || []); }));
        if (hasWorkspacePermission(role, 'webhooks.read')) {
          loaders.push(request('/webhooks').then((r) => { if (!controller.signal.aborted) setWebhooks(r.webhooks || []); }));
          loaders.push(request('/webhooks/events').then((r) => { if (!controller.signal.aborted) setEventOptions(r.events || []); }));
        }
        if (hasWorkspacePermission(role, 'logs.read')) loaders.push(request('/api-logs?limit=100').then((r) => { if (!controller.signal.aborted) setApiLogs(r.logs || []); }));
        const outcomes = await Promise.allSettled(loaders);
        const failed = outcomes.find((r) => r.status === 'rejected');
        if (failed && !controller.signal.aborted) setWorkspaceError(failed.reason.message);
      } catch (error) {
        if (!controller.signal.aborted) setWorkspaceError(error.message || 'Unable to load developer tools.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [user, workspaceId, refreshTick]);

  const createKey = async () => {
    if (!workspaceId || !name.trim() || creating || !canManageKeys) return;
    setCreating(true);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), environment, permissions: PERMISSIONS, expirationDays }),
      });
      if (currentWorkspace.current !== workspaceId) return;
      setNewSecret(result.apiKey || "");
      setName("");
      setExpirationDays("never");
      setDialogOpen(false);
      await loadKeys();
      toast.success("API key created. Copy the secret now.");
    } catch (error) {
      toast.error(error.message || "Unable to create API key.");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (keyId) => {
    if (!canRevokeKeys || mutating) return;
    setMutating(true);
    try {
      await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/api-keys/${encodeURIComponent(keyId)}/revoke`, { method: "POST" });
      await loadKeys();
      toast.success("API key revoked.");
    } catch (error) {
      toast.error(error.message || "Unable to revoke API key.");
    } finally { setMutating(false); }
  };

  const createWebhook = async () => {
    if (!workspaceId || !webhookName.trim() || !webhookUrl.trim() || !selectedEvents.length || creating || !canUseWebhooks) return;
    try { const url = new URL(webhookUrl.trim()); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
    catch (_) { toast.error("Enter a valid HTTPS endpoint without embedded credentials."); return; }
    setCreating(true);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ name: webhookName.trim(), url: webhookUrl.trim(), environment: webhookEnvironment, events: selectedEvents }),
      });
      if (currentWorkspace.current !== workspaceId) return;
      setWebhookSecret(result.secret || "");
      setWebhookName("");
      setWebhookUrl("");
      setWebhookEnvironment("all");
      setSelectedEvents(["webhook.test", "verification.created", "verification.completed"]);
      setWebhookDialogOpen(false);
      await loadWebhooks();
      toast.success("Webhook created.");
    } catch (error) {
      toast.error(error.message || "Unable to create webhook.");
    } finally {
      setCreating(false);
    }
  };

  const toggleWebhook = async (hook) => {
    if (!canManageWebhooks || mutating || (!hook.enabled && !canUseWebhooks)) return;
    setMutating(true);
    try {
      await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(hook.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !hook.enabled }),
      });
      await loadWebhooks();
      toast.success(hook.enabled ? "Webhook paused." : "Webhook enabled.");
    } catch (error) {
      toast.error(error.message || "Unable to update webhook.");
    } finally { setMutating(false); }
  };

  const removeWebhook = async (hook) => {
    if (!canManageWebhooks || mutating) return;
    setMutating(true);
    try {
      await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(hook.id)}`, { method: "DELETE" });
      await loadWebhooks();
      toast.success("Webhook deleted.");
    } catch (error) {
      toast.error(error.message || "Unable to delete webhook.");
    } finally { setMutating(false); }
  };

  const rotateSecret = async (hook) => {
    if (!canUseWebhooks || mutating) return;
    setMutating(true);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(hook.id)}/rotate-secret`, { method: "POST" });
      if (currentWorkspace.current !== workspaceId) return;
      setWebhookSecret(result.secret || "");
      await loadWebhooks();
      toast.success("Signing secret rotated.");
    } catch (error) {
      toast.error(error.message || "Unable to rotate secret.");
    } finally { setMutating(false); }
  };

  const testWebhook = async (hook) => {
    if (!canUseWebhooks || mutating) return;
    setMutating(true);
    try {
      await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(hook.id)}/test`, { method: "POST", body: JSON.stringify({ environment: hook.environment === "all" ? "test" : hook.environment }) });
      toast.success("Test event queued. Check deliveries in a few seconds.");
    } catch (error) {
      toast.error(error.message || "Unable to queue webhook test.");
    } finally { setMutating(false); }
  };

  const showDeliveries = async (hook) => {
    const id = workspaceId;
    setSelectedWebhook(hook);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(hook.id)}/deliveries?limit=50`);
      if (currentWorkspace.current !== id) return;
      setDeliveries(result.deliveries || []);
      setDeliveriesOpen(true);
    } catch (error) {
      toast.error(error.message || "Unable to load deliveries.");
    }
  };

  const retryDelivery = async (delivery) => {
    if (!canUseWebhooks || mutating || !selectedWebhook) return;
    setMutating(true);
    try {
      await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/webhooks/${encodeURIComponent(selectedWebhook.id)}/deliveries/${encodeURIComponent(delivery.id)}/retry`, { method: "POST" });
      await showDeliveries(selectedWebhook);
      toast.success("Delivery queued for retry.");
    } catch (error) {
      toast.error(error.message || "Unable to retry delivery.");
    } finally { setMutating(false); }
  };

  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); toast.success("Copied."); } catch { toast.error("Copy failed."); }
  };
  const matches = item => Object.values(item).filter(value => typeof value === "string" || typeof value === "number").join(" ").toLowerCase().includes(search.toLowerCase());
  const searchRows = activeTab === 0 ? apiKeys : activeTab === 2 ? webhooks : apiLogs;
  const noMatches = Boolean([0, 2, 3].includes(activeTab) && search.trim() && searchRows.length && !searchRows.some(matches));

  return (
    <Container maxWidth={false} className="dev-portal" data-mode={darkMode ? "dark" : "light"}>
      <header className="dev-header">
        <div><div className="dev-kicker">NEXUS / DEVELOPER PLATFORM</div><h1>Build without friction<span>.</span></h1><Typography component="p">The infrastructure behind your next great integration.</Typography></div>
        <div className="dev-header-actions">
          <FormControl size="small" sx={{ minWidth: 210 }}><InputLabel>Workspace</InputLabel><Select disabled={creating || mutating} value={workspaceId} label="Workspace" onChange={(e) => setWorkspaceId(e.target.value)}>{workspaces.map((ws) => <MenuItem key={ws.id} value={ws.id}>{ws.name || ws.id}</MenuItem>)}</Select></FormControl>
          <Button aria-label="Refresh developer portal" variant="outlined" disabled={loading || creating || mutating || !workspaceId} onClick={() => setRefreshTick(value => value + 1)}><RefreshIcon /></Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} disabled={!workspaceId || !canManageKeys || loading}>Create API key</Button>
        </div>
      </header>
      <section className="dev-hero">
        <div><div className="dev-kicker">FROM FIRST REQUEST TO PRODUCTION</div><h2>Your product.<br /><em>One powerful connection.</em></h2><Typography component="p">Manage credentials, connect event destinations, and inspect the requests that keep your application moving.</Typography><div className="dev-hero-links"><Button onClick={() => setActiveTab(1)} startIcon={<TerminalIcon />}>Open code workbench</Button><Button onClick={() => setActiveTab(4)} startIcon={<SecurityIcon />}>Integration security</Button></div></div>
        <div className="dev-signal" aria-label="Illustration of the Nexus integration flow"><div className="dev-signal-label">NEXUS API / INTEGRATION BLUEPRINT</div><div className="dev-signal-line"><b>01</b> Your server → Nexus API</div><div className="dev-signal-line"><b>02</b> Verification → Confirmation</div><div className="dev-signal-line"><b>03</b> Signed event → Your application</div><div className="dev-signal-footer"><span>REST / V1</span><span>TEST → LIVE</span></div></div>
      </section>
      <div className="dev-stats">{[
        ["Active credentials", apiKeys.filter(key => key.status === "active").length, "Test and live API keys"],
        ["Event destinations", webhooks.filter(hook => hook.enabled).length, "Enabled webhook endpoints"],
        ["Recent requests", apiLogs.length, "Latest 100 logged requests"],
        ["Workspace role", labelWorkspaceRole(resolvedRole), "Server-confirmed access"],
      ].map(([label, value, note]) => <div className="dev-stat" key={label}><span>{label}</span><strong>{loading ? "—" : value}</strong><small>{note}</small></div>)}</div>
      {workspaceError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => { loadWorkspaces().catch(() => {}); setRefreshTick(value => value + 1); }}>Retry</Button>}>{workspaceError}</Alert>}
      {!loading && !workspaceError && !workspace && <Alert severity="info" sx={{ mb: 2 }}>Create or join a workspace before creating developer resources.</Alert>}
      {workspace && !canManageKeys && <Alert severity="warning" sx={{ mb: 2 }}>Your current workspace role is <strong>{labelWorkspaceRole(workspace.role)}</strong>. API credentials and webhook configuration are available to Owners, Admins, and Developers.</Alert>}
      {newSecret && (
        <Alert onClose={() => setNewSecret("")} severity="warning" sx={{ mb: 2 }} action={<><Button color="inherit" size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(newSecret)}>Copy secret</Button><Button color="inherit" size="small" onClick={() => setNewSecret("")}>Done</Button></>}><strong>Copy this API key now.</strong> Nexus will not show the full secret again. <Box component="code" sx={{ ml: 1, overflowWrap: "anywhere" }}>{newSecret}</Box></Alert>
      )}
      {webhookSecret && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<><Button color="inherit" size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(webhookSecret)}>Copy secret</Button><Button color="inherit" size="small" onClick={() => setWebhookSecret("")}>Done</Button></>}><strong>Copy this webhook signing secret now.</strong> Nexus will not show it again. <Box component="code" sx={{ ml: 1, overflowWrap: "anywhere" }}>{webhookSecret}</Box></Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs aria-label="Developer tools" value={activeTab} onChange={(_, value) => { setActiveTab(value); setSearch(""); }} variant="scrollable" allowScrollButtonsMobile>
          <Tab icon={<VpnKeyIcon fontSize="small" />} iconPosition="start" label="API Keys" />
          <Tab icon={<TerminalIcon fontSize="small" />} iconPosition="start" label="Quickstart" />
          <Tab icon={<WebhookIcon fontSize="small" />} iconPosition="start" label="Webhooks" />
          <Tab icon={<SecurityIcon fontSize="small" />} iconPosition="start" label="API Logs" />
          <Tab icon={<SecurityIcon fontSize="small" />} iconPosition="start" label="Environments & security" />
        </Tabs>
      </Box>

      {[0, 2, 3].includes(activeTab) && <div className="dev-toolbar"><div><div className="dev-kicker">{activeTab === 0 ? "CREDENTIAL VAULT" : activeTab === 2 ? "EVENT DELIVERY" : "REQUEST OBSERVABILITY"}</div><Typography variant="body2">{activeTab === 0 ? "Keep access intentional. Start in test, ship in live." : activeTab === 2 ? "Your events, delivered to the right destination." : "Inspect the requests behind your integration."}</Typography></div><TextField size="small" value={search} onChange={event => setSearch(event.target.value)} label={activeTab === 0 ? "Search credentials" : activeTab === 2 ? "Search webhooks" : "Search request logs"} /></div>}
      {loading && [0, 2, 3].includes(activeTab) && <Skeleton variant="rounded" height={260} />}
      {!loading && noMatches && <Alert severity="info">No matches for “{search}”. Try another search or clear the field.</Alert>}
      {activeTab === 0 && !loading && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {apiKeys.length === 0 ? <Box sx={{ p: 7, textAlign: "center", ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: .8 }}>No API keys yet</Typography><Typography variant="body2" sx={{ opacity: .48, mb: 2 }}>Create a test key to start integrating Nexus without consuming production verification quota.</Typography><Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} disabled={!canManageKeys}>Create test key</Button></Box> : apiKeys.filter(matches).map((key) => (
            <Box key={key.id} sx={{ p: 2.2, ...surface(darkMode), display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ width: 42, height: 42, borderRadius: 2, display: "grid", placeItems: "center", background: `${NEON.blue}12`, color: NEON.blue }}><VpnKeyIcon /></Box>
              <Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontWeight: 800 }}>{key.name}</Typography><Typography variant="caption" sx={{ opacity: .48, fontFamily: "monospace" }}>{key.prefix}••••{key.last4}</Typography></Box>
              <Chip label={key.environment.toUpperCase()} size="small" variant="outlined" sx={{ fontWeight: 800 }} /><Chip label={key.status.toUpperCase()} size="small" sx={{ fontWeight: 800 }} />
              <Typography variant="caption" sx={{ opacity: .48 }}>Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"}</Typography>
              {key.status === "active" && canRevokeKeys && <Button color="error" size="small" startIcon={<DeleteOutlineIcon />} disabled={mutating} onClick={() => setConfirmation({ type: "revoke", item: key })}>Revoke</Button>}
            </Box>
          ))}
        </Box>
      )}

      {activeTab === 1 && <section role="tabpanel" aria-label="Integration quickstart"><QuickstartBench /></section>}
      {activeTab === 2 && !loading && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {!canUseWebhooks && <Alert severity="info">{canManageWebhooks ? "Webhook delivery is not included in this workspace plan. Check Billing to upgrade." : "Your workspace role cannot manage webhooks. Ask an owner or admin for access."}</Alert>}
          {webhooks.length === 0 ? (
            <Box sx={{ p: 6, textAlign: "center", ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: .8 }}>No webhooks configured</Typography><Typography variant="body2" sx={{ opacity: .48, mb: 2 }}>Send verification and subscription events to your backend with signed, retryable HTTP delivery.</Typography><Button variant="outlined" startIcon={<WebhookIcon />} onClick={() => setWebhookDialogOpen(true)} disabled={!canUseWebhooks}>Create webhook</Button></Box>
          ) : webhooks.filter(matches).map((hook) => (
            <Box key={hook.id} sx={{ p: 2.2, ...surface(darkMode), display: "grid", gap: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <WebhookIcon sx={{ color: NEON.blue }} />
                <Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontWeight: 800 }}>{hook.name}</Typography><Typography variant="caption" sx={{ opacity: .5, fontFamily: "monospace", wordBreak: "break-all" }}>{hook.url}</Typography></Box>
                <Chip label={(hook.environment || "all").toUpperCase()} size="small" variant="outlined" /><Chip label={hook.enabled ? "ACTIVE" : "PAUSED"} size="small" color={hook.enabled ? "success" : "default"} />
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {(hook.events || []).map((event) => <Chip key={event} size="small" label={event} />)}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" disabled={!canUseWebhooks || mutating || !hook.enabled} onClick={() => testWebhook(hook)}>Send test</Button>
                <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => showDeliveries(hook)}>Deliveries</Button>
                <Button size="small" variant="outlined" disabled={!canManageWebhooks || mutating || (!hook.enabled && !canUseWebhooks)} onClick={() => toggleWebhook(hook)}>{hook.enabled ? "Pause" : "Enable"}</Button>
                <Button size="small" variant="outlined" disabled={!canUseWebhooks || mutating} onClick={() => setConfirmation({ type: "rotate", item: hook })}>Rotate secret</Button>
                <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} disabled={!canManageWebhooks || mutating} onClick={() => setConfirmation({ type: "delete", item: hook })}>Delete</Button>
              </Box>
              <Typography variant="caption" sx={{ opacity: .45 }}>Last delivery: {hook.lastDeliveryAt ? new Date(hook.lastDeliveryAt).toLocaleString() : "never"} · failures: {hook.failureCount || 0}</Typography>
            </Box>
          ))}
          {webhooks.length > 0 && <Box sx={{ display: "flex", justifyContent: "flex-end" }}><Button startIcon={<AddIcon />} onClick={() => setWebhookDialogOpen(true)} disabled={!canUseWebhooks}>Add webhook</Button></Box>}
        </Box>
      )}

      {activeTab === 3 && !loading && (
        <Box sx={{ ...surface(darkMode), overflow: "hidden" }}>
          <Box sx={{ p: 2.2, borderBottom: "1px solid var(--dev-line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box><Typography sx={{ fontWeight: 800 }}>Recent API requests</Typography><Typography variant="caption" sx={{ opacity: .45 }}>Request IDs, status codes, latency, and environment are recorded without API secrets.</Typography></Box>
            <IconButton aria-label="Refresh API logs" disabled={loading || !canReadLogs} onClick={() => setRefreshTick(value => value + 1)}><RefreshIcon fontSize="small" /></IconButton>
          </Box>
          {apiLogs.length === 0 ? <Box sx={{ p: 6, textAlign: "center" }}><Typography sx={{ fontWeight: 800, mb: .7 }}>No API logs yet</Typography><Typography variant="body2" sx={{ opacity: .5 }}>Make a request with one of your Nexus API keys and the request will appear here.</Typography></Box> : (
            <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}><Box component="thead"><Box component="tr">{["Time", "Method", "Path", "Status", "Latency", "Environment", "Request ID"].map((head) => <Box component="th" key={head} sx={{ p: 1.5, textAlign: "left", fontSize: 12, opacity: .55 }}>{head}</Box>)}</Box></Box><Box component="tbody">{apiLogs.filter(matches).map((log) => <Box component="tr" key={log.id} sx={{ borderTop: "1px solid var(--dev-line)" }}><Box component="td" sx={{ p: 1.5, fontSize: 12 }}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</Box><Box component="td" sx={{ p: 1.5, fontFamily: "monospace", fontSize: 12 }}>{log.method}</Box><Box component="td" sx={{ p: 1.5, fontFamily: "monospace", fontSize: 12 }}>{log.path}</Box><Box component="td" sx={{ p: 1.5 }}><Chip size="small" label={log.statusCode} color={log.statusCode >= 400 ? "error" : "success"} /></Box><Box component="td" sx={{ p: 1.5, fontSize: 12 }}>{Number(log.latencyMs || 0)} ms</Box><Box component="td" sx={{ p: 1.5 }}><Chip size="small" variant="outlined" label={log.environment} /></Box><Box component="td" sx={{ p: 1.5, fontFamily: "monospace", fontSize: 11 }}>{log.requestId || "—"}</Box></Box>)}</Box></Box></Box>
          )}
        </Box>
      )}

      {activeTab === 4 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Box sx={{ p: 2.5, ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Test environment</Typography><Typography variant="body2" sx={{ opacity: .55, lineHeight: 1.7 }}>Keys beginning with <code>nx_test_</code> are isolated from production usage and are designed for development.</Typography></Box>
          <Box sx={{ p: 2.5, ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Live environment</Typography><Typography variant="body2" sx={{ opacity: .55, lineHeight: 1.7 }}>Keys beginning with <code>nx_live_</code> are billable production credentials and are subject to your workspace's verification quota.</Typography></Box>
          <Box sx={{ p: 2.5, ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Credential handling</Typography><Typography variant="body2" sx={{ opacity: .55, lineHeight: 1.7 }}>Nexus stores only a cryptographic API-key hash. Webhook signing secrets are encrypted at rest and shown only when created or rotated.</Typography></Box>
          <Box sx={{ p: 2.5, ...surface(darkMode) }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Webhook signing</Typography><Typography variant="body2" sx={{ opacity: .55, lineHeight: 1.7 }}>Outgoing requests include <code>X-Nexus-Timestamp</code>, <code>X-Nexus-Delivery</code>, <code>X-Nexus-Event</code>, and an HMAC <code>X-Nexus-Signature</code>. Verify the signature before processing the event.</Typography></Box>
        </Box>
      )}

      <footer className="dev-footer"><span>NEXUS DEVELOPER PLATFORM</span><span>Server-side credentials. Intentional access. Observable delivery.</span></footer>
      <Dialog className="dev-dialog" container={() => document.querySelector(".dev-portal") || document.body} open={dialogOpen} onClose={() => !creating && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Create Nexus API key</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
          <TextField label="Key name" placeholder="My website" value={name} onChange={(e) => setName(e.target.value)} autoFocus inputProps={{ maxLength: 80 }} />
          <FormControl><InputLabel>Environment</InputLabel><Select value={environment} label="Environment" onChange={(e) => setEnvironment(e.target.value)}><MenuItem value="test">Test</MenuItem><MenuItem value="live">Live</MenuItem></Select></FormControl>
          <FormControl><InputLabel>Expiration</InputLabel><Select value={expirationDays} label="Expiration" onChange={(e) => setExpirationDays(e.target.value)}><MenuItem value="never">Never</MenuItem><MenuItem value="30">30 days</MenuItem><MenuItem value="90">90 days</MenuItem><MenuItem value="180">180 days</MenuItem><MenuItem value="365">365 days</MenuItem></Select></FormControl>
          <Alert severity="warning">The full secret is displayed only once. Store it securely on your backend or secret manager. Expired keys stop authenticating automatically.</Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button><Button variant="contained" onClick={createKey} disabled={creating || !name.trim()}>{creating ? "Creating…" : "Create key"}</Button></DialogActions>
      </Dialog>

      <Dialog className="dev-dialog" container={() => document.querySelector(".dev-portal") || document.body} open={webhookDialogOpen} onClose={() => !creating && setWebhookDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>Create webhook endpoint</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
          <TextField label="Webhook name" placeholder="Production backend" value={webhookName} onChange={(e) => setWebhookName(e.target.value)} inputProps={{ maxLength: 80 }} />
          <TextField label="Endpoint URL" placeholder="https://api.example.com/webhooks/nexus" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} helperText="HTTPS is required for webhook destinations." />
          <FormControl><InputLabel>Environment</InputLabel><Select value={webhookEnvironment} label="Environment" onChange={(e) => setWebhookEnvironment(e.target.value)}><MenuItem value="all">All environments</MenuItem><MenuItem value="test">Test only</MenuItem><MenuItem value="live">Live only</MenuItem></Select></FormControl>
          <FormControl><InputLabel>Events</InputLabel><Select multiple value={selectedEvents} label="Events" onChange={(e) => setSelectedEvents(e.target.value)} renderValue={(selected) => selected.join(", ")}>{eventOptions.map((event) => <MenuItem key={event.id} value={event.id}>{event.id} — {event.description}</MenuItem>)}</Select></FormControl>
          <Alert severity="info">Nexus signs each delivery with your webhook secret. Store that secret on your server and verify the signature before accepting the event.</Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setWebhookDialogOpen(false)} disabled={creating}>Cancel</Button><Button variant="contained" startIcon={<WebhookIcon />} onClick={createWebhook} disabled={creating || !webhookName.trim() || !webhookUrl.trim() || !selectedEvents.length}>{creating ? "Creating…" : "Create webhook"}</Button></DialogActions>
      </Dialog>

      <Dialog className="dev-dialog" container={() => document.querySelector(".dev-portal") || document.body} open={deliveriesOpen} onClose={() => setDeliveriesOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 900 }}>{selectedWebhook?.name || "Webhook"} — delivery history</DialogTitle>
        <DialogContent>
          {deliveries.length === 0 ? <Box sx={{ p: 4, textAlign: "center" }}><Typography sx={{ fontWeight: 800 }}>No deliveries yet</Typography><Typography variant="body2" sx={{ opacity: .5, mt: .5 }}>Send a test event or wait for a subscribed Nexus event.</Typography></Box> : (
            <Box sx={{ display: "grid", gap: 1.2 }}>{deliveries.map((delivery) => <Box key={delivery.id} sx={{ p: 1.6, ...surface(darkMode), display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}><Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontWeight: 800, fontSize: 14 }}>{delivery.eventType}</Typography><Typography variant="caption" sx={{ opacity: .5, fontFamily: "monospace" }}>{delivery.id}</Typography></Box><Chip size="small" label={String(delivery.status || "pending").toUpperCase()} color={delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "error" : "default"} /><Typography variant="caption" sx={{ opacity: .5 }}>{delivery.lastResponseCode || "—"} · {delivery.latencyMs != null ? `${delivery.latencyMs}ms` : "—"}</Typography>{["failed", "retry"].includes(delivery.status) && <Button size="small" startIcon={<ReplayIcon />} disabled={!canUseWebhooks || mutating} onClick={() => retryDelivery(delivery)}>Retry</Button>}</Box>)}</Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDeliveriesOpen(false)}>Close</Button></DialogActions>
      </Dialog>
      <Dialog className="dev-dialog" container={() => document.querySelector(".dev-portal") || document.body} open={Boolean(confirmation)} onClose={() => !mutating && setConfirmation(null)} fullWidth maxWidth="xs">
        <DialogTitle>{confirmation?.type === "revoke" ? "Revoke API key?" : confirmation?.type === "rotate" ? "Rotate signing secret?" : "Delete webhook?"}</DialogTitle>
        <DialogContent><Typography variant="body2" sx={{ lineHeight: 1.8 }}>{confirmation?.type === "revoke" ? "Applications using this key will stop authenticating. Create and deploy a replacement first if they still need access." : confirmation?.type === "rotate" ? "Nexus will sign new deliveries with a new secret. Update your receiving server immediately after rotation." : "This endpoint will stop receiving new events. Existing delivery records are retained."}</Typography><Typography sx={{ mt: 2, fontWeight: 700 }}>{confirmation?.item?.name}</Typography></DialogContent>
        <DialogActions sx={{ p: 2 }}><Button disabled={mutating} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="contained" color={confirmation?.type === "rotate" ? "primary" : "error"} disabled={mutating} onClick={async () => { if (!confirmation) return; if (confirmation.type === "revoke") await revokeKey(confirmation.item.id); else if (confirmation.type === "rotate") await rotateSecret(confirmation.item); else await removeWebhook(confirmation.item); setConfirmation(null); }}>{mutating ? "Applying…" : "Confirm"}</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
