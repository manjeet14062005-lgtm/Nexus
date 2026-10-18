import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, MenuItem, Skeleton, Switch, TextField } from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import BoltRounded from "@mui/icons-material/BoltRounded";
import AltRouteRounded from "@mui/icons-material/AltRouteRounded";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import MailOutlineRounded from "@mui/icons-material/MailOutlineRounded";
import WebhookRounded from "@mui/icons-material/WebhookRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import { toast } from "react-hot-toast";
import { apiRequest } from "../../services/apiClient.js";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";
import { useOperationResource, useOperationWorkspaces } from "../operations/useOperationsData.js";
import { ConfirmPause, EmptyState, ErrorNotice, formatCount, formatDate, OperationsHeader, OperationsShell, PlanNotice, PrimaryAction, SectionHeading, StatGrid, StatusChip, WorkspaceSelect } from "../operations/OperationsUI.jsx";
import { ACTION_LABELS, eventLabel } from "../operations/validation.js";
import { WorkflowEditor } from "./WorkflowEditor.jsx";

export const WORKFLOW_TEMPLATES = [
  { id: "risk", title: "Catch high-risk failures", description: "Escalate failed checks with a risk score of 80 or above.", icon: ShieldOutlined, form: { name: "High-risk verification alert", description: "Escalate high-risk failures to security and the workspace owner.", trigger: "verification.failed", environment: "all", conditions: [{ field: "risk_score", operator: "gte", value: 80 }], actions: [{ type: "create_security_event", config: { severity: "high" } }, { type: "email_owner", config: {} }] } },
  { id: "success", title: "Connect verified identities", description: "Forward completed verifications to your connected systems.", icon: WebhookRounded, form: { name: "Verified identity handoff", description: "Send completed verification events to matching webhooks.", trigger: "verification.completed", environment: "all", conditions: [], actions: [{ type: "webhook_event", config: { eventType: "verification.completed", webhookId: "" } }] } },
  { id: "expiry", title: "Stay ahead of expirations", description: "Notify your workspace owner when a verification expires.", icon: MailOutlineRounded, form: { name: "Verification expiration alert", description: "Keep the owner informed about expired requests.", trigger: "verification.expired", environment: "all", conditions: [], actions: [{ type: "email_owner", config: {} }] } }
];
const EMPTY_FORM = { name: "", description: "", trigger: "verification.failed", environment: "all", conditions: [], actions: [{ type: "email_owner", config: {} }] };

export function WorkflowsPage({ user, darkMode }) {
  const ws = useOperationWorkspaces(user);
  const base = "/workspaces/" + encodeURIComponent(ws.workspaceId);
  const canManage = hasWorkspacePermission(ws.workspace?.role, "workflows.manage");
  const canReadWebhooks = hasWorkspacePermission(ws.workspace?.role, "webhooks.read");
  const loader = useCallback(async signal => {
    const [flows, events, hooks] = await Promise.all([
      apiRequest(user, base + "/workflows", { signal }),
      apiRequest(user, base + "/workflows/events", { signal }),
      canReadWebhooks ? apiRequest(user, base + "/webhooks", { signal }).then(result => ({ rows: result.webhooks || [] })).catch(err => ({ rows: [], error: err.message })) : Promise.resolve({ rows: [] })
    ]);
    return { workflows: flows.workflows || [], events: (events.events || []).filter(event => event.id !== "webhook.test"), webhooks: hooks.rows, webhookError: hooks.error || "" };
  }, [user, base, canReadWebhooks]);
  const resource = useOperationResource(ws.workspaceId ? ws.workspaceId + ":" + canReadWebhooks : "", loader);
  const entitlementLoader = useCallback(signal => apiRequest(user, base + "/entitlements", { signal }), [user, base]);
  const entitlements = useOperationResource(ws.workspaceId, entitlementLoader);
  const automationEnabled = Boolean(entitlements.data?.plan?.featureFlags?.automation);
  const [editor, setEditor] = useState(null); const [pauseItem, setPauseItem] = useState(null);
  const [busy, setBusy] = useState(""); const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [environment, setEnvironment] = useState("all");
  useEffect(() => { setEditor(null); setPauseItem(null); setSearch(""); setStatus("all"); setEnvironment("all"); }, [ws.workspaceId]);
  const workflows = useMemo(() => resource.data?.workflows || [], [resource.data]);
  const visible = useMemo(() => workflows.filter(item => {
    const matchesText = [item.name, item.description, item.trigger?.event].some(value => String(value || "").toLowerCase().includes(search.toLowerCase()));
    return matchesText && (status === "all" || (status === "active" ? item.enabled !== false : item.enabled === false)) && (environment === "all" || item.environment === environment);
  }), [workflows, search, status, environment]);
  const events = resource.data?.events || [];
  const createAllowed = canManage && Boolean(events.length);
  function openEditor(form, id) { if (createAllowed) setEditor({ id: id || null, form: JSON.parse(JSON.stringify(form)) }); }
  async function changeStatus(item, enabled) {
    if (busy || !canManage || (enabled && !automationEnabled)) return;
    setBusy(item.id);
    try {
      await apiRequest(user, base + "/workflows/" + encodeURIComponent(item.id), enabled ? { method: "PATCH", body: JSON.stringify({ enabled: true }) } : { method: "DELETE" });
      toast.success(enabled ? "Workflow activated." : "Workflow paused."); setPauseItem(null); resource.refresh();
    } catch (err) { toast.error(err.message || "Unable to update workflow."); } finally { setBusy(""); }
  }
  return <OperationsShell darkMode={darkMode}>
    <OperationsHeader number="03" title="Automation studio" description="Turn verification events into thoughtful, reliable actions." actions={<><Button variant="outlined" startIcon={<RefreshRounded />} disabled={!ws.workspaceId || resource.loading} onClick={() => { resource.refresh(); entitlements.refresh(); }}>Refresh</Button><PrimaryAction startIcon={<AddRounded />} disabled={!createAllowed || Boolean(busy)} onClick={() => openEditor(EMPTY_FORM)}>Create workflow</PrimaryAction></>} />
    <ErrorNotice error={ws.error} retry={ws.refresh} /><ErrorNotice error={resource.error} retry={resource.refresh} />
    <section className="ops-flow-hero"><div><div className="ops-eyebrow">LESS MANUAL WORK. MORE MOMENTUM.</div><h2>A signal comes in.<br /><em>The right action follows.</em></h2><p>Connect a trigger, set the rules, and let Nexus handle the follow-through. Built around your team’s verification process.</p></div><div className="ops-blueprint" aria-label="Workflow structure: event, condition, action"><div className="ops-flow-node"><BoltRounded /><small>01 / When</small><strong>Verification event</strong></div><div className="ops-flow-edge" /><div className="ops-flow-node"><AltRouteRounded /><small>02 / If</small><strong>Your rules match</strong></div><div className="ops-flow-edge" /><div className="ops-flow-node"><ArrowForwardRounded /><small>03 / Then</small><strong>Take action</strong></div></div></section>
    <div className="ops-toolbar"><WorkspaceSelect data={ws} disabled={Boolean(busy)} /><div className="ops-toolbar-spacer" /><span className="ops-updated">{resource.loading ? "Updating workflows" : ws.workspace?.name || "Select a workspace"}</span></div>
    {entitlements.data && !automationEnabled && <PlanNotice feature="Workflow automation" plan={entitlements.data.plan?.name} />}<ErrorNotice error={entitlements.error} retry={entitlements.refresh} />
    {resource.data?.webhookError && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" onClick={resource.refresh}>Retry</Button>}>Webhook options could not be loaded. Other workflow actions remain available.</Alert>}
    <StatGrid items={[{ label: "Total workflows", value: resource.data ? formatCount(workflows.length) : "—", note: "Configured in this workspace", icon: AltRouteRounded }, { label: "Active workflows", value: resource.data ? formatCount(workflows.filter(item => item.enabled !== false).length) : "—", note: automationEnabled ? "Ready to respond to events" : "Runs paused by current plan", icon: BoltRounded }, { label: "Total runs", value: resource.data ? formatCount(workflows.reduce((sum, item) => sum + (Number(item.runCount) || 0), 0)) : "—", note: "Recorded workflow executions", icon: PlayArrowRounded }, { label: "Failed runs", value: resource.data ? formatCount(workflows.reduce((sum, item) => sum + (Number(item.failureCount) || 0), 0)) : "—", note: "Review failures with your team", icon: ShieldOutlined }]} />
    <SectionHeading label="START WITH A BLUEPRINT" title="A head start for your next workflow" description="Choose a template, adjust the rules, and review before activating." />
    <div className="ops-template-grid">{WORKFLOW_TEMPLATES.map(template => <button className="ops-template" key={template.id} disabled={!createAllowed} onClick={() => openEditor(template.form)}><span className="ops-template-icon"><template.icon /></span><strong>{template.title}</strong><p>{template.description}</p><small>Use template <ArrowForwardRounded sx={{ fontSize: 15 }} /></small></button>)}</div>
    <SectionHeading label="YOUR AUTOMATIONS" title="Designed by you. Run by Nexus." description="Every workflow has a clear trigger, a set of conditions, and an action." />
    <div className="ops-toolbar"><TextField className="ops-search" size="small" label="Search workflows" value={search} onChange={e => setSearch(e.target.value)} /><div className="ops-segment" aria-label="Workflow status">{["all", "active", "paused"].map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "all" ? "All workflows" : value === "active" ? "Active" : "Paused"}</button>)}</div><TextField size="small" select label="Environment" value={environment} onChange={e => setEnvironment(e.target.value)} sx={{ minWidth: 130 }}>{["all", "live", "test"].map(value => <MenuItem key={value} value={value}>{value === "all" ? "All environments" : value}</MenuItem>)}</TextField><div className="ops-toolbar-spacer" /><p>{visible.length} workflow(s)</p></div>
    {ws.loading || (resource.loading && !resource.data) ? <Skeleton variant="rounded" height={250} /> : !ws.workspaceId ? <div className="ops-panel"><EmptyState icon={AltRouteRounded} title="Your studio starts with a workspace" description="Create or join a workspace to configure your team’s automation." action={<PrimaryAction href="/workspace">Open workspaces</PrimaryAction>} /></div> : !resource.error && !visible.length ? <div className="ops-panel"><EmptyState icon={AltRouteRounded} title={workflows.length ? "No workflows match" : "Make your first connection"} description={workflows.length ? "Try another search or clear the filters to see your workflows." : "Start with a template above, or build your own workflow. Your automations will appear here."} action={workflows.length ? <Button onClick={() => { setSearch(""); setStatus("all"); setEnvironment("all"); }}>Clear filters</Button> : <PrimaryAction disabled={!createAllowed} onClick={() => openEditor(EMPTY_FORM)}>Build a workflow</PrimaryAction>} /></div> : <div className="ops-workflow-grid">{visible.map(item => <article className="ops-panel ops-workflow-card" key={item.id}><div className="ops-workflow-head"><div><h3>{item.name}</h3><p>{item.description || "A focused workflow for your workspace."}</p></div><Switch size="small" checked={item.enabled !== false} disabled={!canManage || Boolean(busy) || (item.enabled === false && !automationEnabled)} onChange={() => item.enabled === false ? changeStatus(item, true) : setPauseItem(item)} inputProps={{ "aria-label": (item.enabled === false ? "Activate " : "Pause ") + item.name }} /></div><Box sx={{ display: "flex", gap: 1, mb: 2 }}><StatusChip enabled={item.enabled !== false && automationEnabled} label={item.enabled === false ? "Paused" : automationEnabled ? "Active" : "Plan paused"} /><StatusChip label={item.environment === "all" ? "Live + test" : item.environment || "all"} /></Box><div className="ops-workflow-steps"><div className="ops-workflow-step"><BoltRounded /><small>When</small><span>{eventLabel(item.trigger?.event)}</span></div><div className="ops-workflow-step"><AltRouteRounded /><small>If</small><span>{item.conditions?.length ? item.conditions.length + " condition(s) match" : "Every matching event"}</span></div>{(item.actions || []).map((action, index) => <div className="ops-workflow-step" key={index}><ArrowForwardRounded /><small>Then</small><span>{ACTION_LABELS[action.type] || action.type}</span></div>)}</div><div className="ops-workflow-foot"><span>{formatCount(item.runCount)} runs · {formatCount(item.failureCount)} failed<br />Last run: {formatDate(item.lastRunAt, true)}</span><Box sx={{ display: "flex" }}><Button size="small" startIcon={<EditOutlined />} disabled={!canManage || Boolean(busy)} onClick={() => openEditor({ name: item.name, description: item.description || "", trigger: item.trigger?.event, environment: item.environment || "all", conditions: item.conditions || [], actions: item.actions || [] }, item.id)}>Open</Button><Button size="small" startIcon={<PauseRounded />} disabled={!canManage || Boolean(busy) || item.enabled === false} onClick={() => setPauseItem(item)}>Pause</Button></Box></div></article>)}</div>}
    <div className="ops-footer"><span>NEXUS AUTOMATION STUDIO / SIGNAL → ACTION</span><span>Local previews never send emails or webhooks.</span></div>
    <ConfirmPause item={pauseItem} busy={Boolean(busy)} onClose={() => setPauseItem(null)} onConfirm={() => changeStatus(pauseItem, false)} kind="workflow" />
    {editor && <WorkflowEditor key={editor.id || "new"} initial={editor.form} editingId={editor.id} user={user} base={base} events={events} webhooks={resource.data?.webhooks || []} webhookError={resource.data?.webhookError} enabled={automationEnabled} darkMode={darkMode} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); resource.refresh(); }} />}
  </OperationsShell>;
}
