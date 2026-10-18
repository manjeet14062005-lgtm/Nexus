import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Card, Chip, Container, FormControl, InputLabel, LinearProgress, MenuItem, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { ArrowForward, Code, Refresh, ShieldOutlined, Timeline, MailOutline, PhoneOutlined, NorthEast } from "@mui/icons-material";
import { apiRequest } from "../../services/apiClient.js";
import { StatCard } from "../../components/common/StatCard.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { SaaSOnboardingChecklist } from "../../components/common/SaaSOnboardingChecklist.jsx";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";

const panel = { p: { xs: 2.25, md: 3 }, height: "100%" };
const number = (value) => Number(value || 0).toLocaleString();

export function SaaSDashboardPage({ user, darkMode }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [range, setRange] = useState(30);
  const [environment, setEnvironment] = useState("all");
  const [result, setResult] = useState(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId), [workspaces, workspaceId]);
  const queryKey = `${workspaceId}:${range}:${environment}:${revision}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWorkspaceLoading(true);
    setWorkspaceError("");
    setWorkspaces([]);
    setWorkspaceId("");
    if (!user) { setWorkspaceLoading(false); return () => controller.abort(); }
    apiRequest(user, "/workspaces", { signal: controller.signal }).then((data) => {
      if (!active) return;
      const rows = Array.isArray(data.workspaces) ? data.workspaces : [];
      setWorkspaces(rows);
      setWorkspaceId(rows[0]?.id || "");
    }).catch((error) => { if (active) setWorkspaceError(error.message || "Unable to load workspaces."); })
      .finally(() => { if (active) setWorkspaceLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [user, workspaceRevision]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    let active = true;
    const controller = new AbortController();
    apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/analytics?range=${range}&environment=${environment}`, { signal: controller.signal })
      .then((data) => {
        if (!data.analytics) throw new Error("The dashboard response was incomplete. Please retry.");
        if (active) setResult({ key: queryKey, user, analytics: data.analytics, updated: new Date() });
      })
      .catch((error) => { if (active) setResult({ key: queryKey, user, error: error.message || "Unable to load analytics." }); });
    return () => { active = false; controller.abort(); };
  }, [user, workspaceId, range, environment, queryKey]);

  const current = result?.key === queryKey && result?.user === user ? result : null;
  const loading = workspaceLoading || (!!workspaceId && !current);
  const analytics = current?.analytics;
  const totals = analytics?.totals || {};
  const usage = analytics?.usage || {};
  const series = analytics?.series || [];
  const requests = analytics?.recentRequests || [];
  const canDevelop = hasWorkspacePermission(workspace?.role, "api_keys.create");
  const usagePercent = usage.limit > 0 ? Math.min(100, Math.max(0, Number(usage.used || 0) / usage.limit * 100)) : 0;

  return <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 }, px: { lg: 4 } }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3 }}>
      <Box><Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 600, mb: 1 }}>Workspace</Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 650, letterSpacing: "-.045em", lineHeight: 1.2 }}>Overview</Typography>
        <Typography sx={{ color: "text.secondary", mt: 1, maxWidth: 600 }}>Your verification activity, team and infrastructure. All in one place.</Typography>
      </Box>
      <Button component={RouterLink} to="/developer" variant="outlined" startIcon={<Code />} sx={{ display: { xs: "none", md: "inline-flex" }, flexShrink: 0 }}>Developer portal</Button>
    </Box>

    {workspaceError && <Alert severity="error" action={<Button onClick={() => setWorkspaceRevision((v) => v + 1)}>Retry</Button>} sx={{ mb: 3 }}>{workspaceError}</Alert>}
    {!workspaceLoading && !workspaceError && !workspaces.length && <Card sx={{ ...panel, py: 6, textAlign: "center" }}>
      <Box component="img" src="/assets/nexus-network-light.svg" alt="" sx={{ width: 300, maxWidth: "100%", borderRadius: 3, bgcolor: "#edf5f0", mb: 3 }} />
      <Typography variant="h4">Your next great product starts here.</Typography><Typography color="text.secondary" sx={{ my: 2 }}>Create a workspace to connect your application and invite your team.</Typography>
      <Button component={RouterLink} to="/workspace" variant="contained" endIcon={<ArrowForward />}>Create a workspace</Button>
    </Card>}

    {!!workspaces.length && <>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", mb: 3, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
        <FormControl size="small" sx={{ minWidth: 160, flex: { xs: "1 1 100%", sm: "0 1 220px" } }}><InputLabel id="overview-workspace">Workspace</InputLabel><Select labelId="overview-workspace" value={workspaceId} label="Workspace" onChange={(e) => setWorkspaceId(e.target.value)}>{workspaces.map((ws) => <MenuItem key={ws.id} value={ws.id}>{ws.name || ws.id}</MenuItem>)}</Select></FormControl>
        <FormControl size="small" sx={{ flex: { xs: 1, sm: "0 0 140px" } }}><InputLabel id="overview-range">Period</InputLabel><Select labelId="overview-range" value={range} label="Period" onChange={(e) => setRange(Number(e.target.value))}>{[7, 30, 90, 365].map((days) => <MenuItem value={days} key={days}>Last {days} days</MenuItem>)}</Select></FormControl>
        <FormControl size="small" sx={{ flex: { xs: 1, sm: "0 0 175px" } }}><InputLabel id="overview-env">Environment</InputLabel><Select labelId="overview-env" value={environment} label="Environment" onChange={(e) => setEnvironment(e.target.value)}><MenuItem value="all">All environments</MenuItem><MenuItem value="test">Test</MenuItem><MenuItem value="live">Live</MenuItem></Select></FormControl>
        <Box sx={{ flex: 1, display: { xs: "none", md: "block" } }} />
        {current?.updated && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", lg: "block" } }}>Updated {current.updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Typography>}
        <Button aria-label="Refresh dashboard" startIcon={<Refresh />} disabled={loading} onClick={() => setRevision((v) => v + 1)} sx={{ color: "text.secondary", minWidth: 40, "& .MuiButton-startIcon": { mr: { xs: 0, sm: 1 }, ml: 0 } }}><Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Refresh</Box></Button>
      </Box>
      {current?.error && <Alert severity="error" sx={{ mb: 3 }} action={<Button onClick={() => setRevision((v) => v + 1)}>Retry</Button>}>{current.error}</Alert>}
    </>}

    {loading && <Box aria-label="Loading dashboard" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={140} />)}<Skeleton variant="rounded" height={300} sx={{ gridColumn: "1 / -1" }} /></Box>}

    {analytics && <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: { xs: 1.25, md: 2 }, mb: 3 }}>
        <StatCard label="Verification requests" value={number(totals.requests)} sub="Across the selected period" color="#8b9dff" />
        <StatCard label="Success rate" value={Number(totals.requests) > 0 ? `${Number(totals.verificationRate || 0)}%` : "—"} sub={Number(totals.requests) > 0 ? "Completed verifications" : "Awaiting your first request"} color="#5bc7a4" />
        <StatCard label="Failed or expired" value={number(Number(totals.failed || 0) + Number(totals.expired || 0))} sub="Requests to investigate" color="#e8b66b" />
        <StatCard label="High-risk requests" value={number(totals.highRisk)} sub="Flagged by risk assessment" color="#dc8298" />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.8fr) minmax(280px, 1fr)" }, gap: 2.5, mb: 3 }}>
        <Card sx={panel}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 3 }}><Box><Typography component="h2" variant="h6">Verification activity</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Request volume over the last {range} days</Typography></Box><Chip label={environment === "all" ? "All environments" : `${environment} mode`} size="small" variant="outlined" sx={{ textTransform: "capitalize" }} /></Box>
          {Number(totals.requests) > 0 ? <><BarChart data={series.map((d) => ({ label: d.day.slice(5), value: d.requests }))} color="#8295ef" height={200} /><Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>{[series[0], series[series.length - 1]].filter(Boolean).map((d, i) => <Typography key={i} variant="caption" color="text.secondary">{d.day}</Typography>)}</Box></> : <Box sx={{ minHeight: 210, display: "grid", placeContent: "center", textAlign: "center", backgroundImage: "linear-gradient(var(--nexus-border) 1px, transparent 1px)", backgroundSize: "100% 42px" }}><Box sx={{ bgcolor: "background.paper", p: 2 }}><Timeline sx={{ color: "text.secondary", fontSize: 30, mb: 1 }} /><Typography sx={{ fontWeight: 600 }}>A clear view starts with your first request.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>Activity will appear here as your application connects.</Typography>{canDevelop && <Button component={RouterLink} to="/developer" endIcon={<ArrowForward />} sx={{ mt: 1 }}>Start integrating</Button>}</Box></Box>}
        </Card>
        <Card sx={{ ...panel, color: "#183e2b", bgcolor: "#edf5f0", position: "relative", overflow: "hidden", borderColor: "#c8ded2" }}>
          <Box component="img" src="/assets/nexus-network-light.svg" alt="" sx={{ position: "absolute", width: 360, right: -70, top: -38, opacity: .65, pointerEvents: "none" }} />
          <Box sx={{ position: "relative", pt: 13 }}><Typography sx={{ color: "#28734f", fontSize: 12, fontWeight: 600 }}>Build your next connection</Typography><Typography sx={{ fontSize: 25, letterSpacing: "-.04em", fontWeight: 600, mt: 1, maxWidth: 270 }}>Make trust part of your product.</Typography><Typography sx={{ color: "#486354", mt: 1, mb: 2, fontSize: 13, maxWidth: 280 }}>Manage API keys, explore the integration guide and connect your first workflow.</Typography><Button component={RouterLink} to="/developer" endIcon={<NorthEast />} sx={{ color: "#246542", p: 0, "&:hover": { bgcolor: "transparent" } }}>Explore developer tools</Button></Box>
        </Card>
      </Box>
      <SaaSOnboardingChecklist user={user} workspaceId={workspaceId} workspaceRole={workspace?.role} darkMode={darkMode} />
      {analytics.detailTruncated && <Alert severity="info" sx={{ mb: 3 }}>Totals include daily aggregates. Detailed breakdowns show up to 5,000 recent requests.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2.5, mb: 3 }}>
        <Card sx={panel}><Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}><Typography component="h2" variant="h6">Monthly usage</Typography><Chip label={analytics.plan?.name || "Current plan"} size="small" variant="outlined" /></Box><Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}><Typography sx={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.04em" }}>{number(usage.used)}</Typography><Typography color="text.secondary">/ {usage.limit == null ? "unlimited" : number(usage.limit)} verifications</Typography></Box><LinearProgress aria-label="Monthly verification quota used" variant="determinate" value={usagePercent} sx={{ height: 8, borderRadius: 1, my: 2.5, bgcolor: darkMode ? "#526071" : "#cbd5e1", border: "1px solid", borderColor: darkMode ? "#718096" : "#94a3b8" }} /><Typography variant="body2" color="text.secondary">{usage.limit == null ? "Your workspace has no configured quota." : `${number(Math.max(0, Number(usage.limit) - Number(usage.used || 0)))} production verifications remaining this month.`}</Typography></Card>
        <Card sx={panel}><Typography component="h2" variant="h6" sx={{ mb: 2 }}>Verification channels</Typography>{[{ method: "email", label: "Email verification", icon: <MailOutline /> }, { method: "phone", label: "Phone verification", icon: <PhoneOutlined /> }].map((channel) => { const count = (analytics.methodBreakdown || []).filter((item) => item.label === channel.method).reduce((sum, item) => sum + Number(item.value || 0), 0); return <Box key={channel.method} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}><Box sx={{ color: "text.secondary", display: "flex" }}>{channel.icon}</Box><Typography sx={{ flex: 1 }}>{channel.label}</Typography><Typography sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{number(count)}</Typography></Box>; })}</Card>
      </Box>
      <Card><Box sx={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, borderBottom: "1px solid", borderColor: "divider" }}><Box><Typography component="h2" variant="h6">Recent requests</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>The latest activity in {workspace?.name || "your workspace"}</Typography></Box><Button component={RouterLink} to="/verification" endIcon={<ArrowForward />} size="small">View all</Button></Box>
        {!requests.length ? <Box sx={{ textAlign: "center", py: 5, px: 2 }}><ShieldOutlined sx={{ color: "text.secondary", mb: 1.5 }} /><Typography sx={{ fontWeight: 600 }}>No requests in this view</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>Send a verification request or choose a different period and environment.</Typography></Box> : <Box sx={{ overflowX: "auto" }}><Table size="small"><TableHead><TableRow>{["Request", "Channel", "Status", "Environment", "Risk", "Created"].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{requests.slice(0, 8).map((row) => <TableRow hover key={row.id}><TableCell sx={{ fontFamily: "monospace" }}>{row.id}</TableCell><TableCell>{row.method}</TableCell><TableCell><Chip label={row.status} size="small" color={row.status === "verified" ? "success" : "default"} variant="outlined" /></TableCell><TableCell>{row.environment}</TableCell><TableCell>{Number(row.riskScore || 0)}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</TableCell></TableRow>)}</TableBody></Table></Box>}
      </Card>
    </>}
    <Box sx={{ mt: 4, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1, color: "text.secondary" }}><Typography variant="caption">Nexus / Verification infrastructure</Typography><Button component={RouterLink} to="/support" size="small" sx={{ color: "text.secondary", minHeight: 24, p: 0 }}>Need a hand? Get support <NorthEast sx={{ fontSize: 13, ml: .5 }} /></Button></Box>
  </Container>;
}
