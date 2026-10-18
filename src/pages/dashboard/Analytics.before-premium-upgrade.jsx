import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Container, FormControl, Grid, InputLabel, MenuItem, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { toast } from "react-hot-toast";
import { apiDownload, apiRequest } from "../../services/apiClient.js";
import { GText } from "../../components/common/GText.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { DonutChart } from "../../components/charts/DonutChart.jsx";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";
import { NEON } from "../../constants/theme";

export function Analytics({ user, darkMode }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [range, setRange] = useState(30);
  const [environment, setEnvironment] = useState("all");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [exporting, setExporting] = useState(false);

  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId) || null, [workspaces, workspaceId]);

  const loadWorkspaces = useCallback(async () => {
    setWorkspaceError("");
    try {
      const result = await apiRequest(user, "/workspaces");
      const rows = Array.isArray(result.workspaces) ? result.workspaces : [];
      setWorkspaces(rows);
      setWorkspaceId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
      if (!rows.length) setLoading(false);
    } catch (error) {
      setWorkspaceError(error.message || "Unable to load workspaces.");
      setLoading(false);
      throw error;
    }
  }, [user]);

  const loadAnalytics = useCallback(async(id) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(id)}/analytics?range=${range}&environment=${environment}`);
      setAnalytics(result.analytics || null);
    } catch (error) {
      toast.error(error.message || "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [user, range, environment]);

  useEffect(() => { if (user) loadWorkspaces().catch(() => {}); }, [user, loadWorkspaces]);
  useEffect(() => { if (workspaceId) loadAnalytics(workspaceId); }, [workspaceId, loadAnalytics]);

  const exportCsv = async () => {
    if (!workspaceId) return;
    setExporting(true);
    try {
      const blob = await apiDownload(user, `/workspaces/${encodeURIComponent(workspaceId)}/reports/verification.csv?range=${range}&environment=${environment}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-verification-${environment}-${range}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message || "Export failed.");
    } finally { setExporting(false); }
  };

  const series = analytics?.series || [];
  const topSignals = analytics?.topRiskSignals || [];

  return (
    <Container maxWidth="xl" sx={{ py: 3, position: "relative", zIndex: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: { xs: "flex-start", md: "center" }, flexWrap: "wrap", mb: 3 }}>
        <Box><Typography variant="h5" sx={{ fontWeight: 900 }}><GText>Analytics</GText></Typography><Typography variant="body2" sx={{ opacity: .45, mt: .5 }}>Real workspace-scoped verification intelligence. No registration-form data, simulated numbers or cross-tenant records.</Typography></Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Workspace</InputLabel><Select value={workspaceId} label="Workspace" onChange={(e) => setWorkspaceId(e.target.value)}>{workspaces.map((ws) => <MenuItem key={ws.id} value={ws.id}>{ws.name || ws.id}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 110 }}><InputLabel>Range</InputLabel><Select value={range} label="Range" onChange={(e) => setRange(Number(e.target.value))}><MenuItem value={7}>7 days</MenuItem><MenuItem value={30}>30 days</MenuItem><MenuItem value={90}>90 days</MenuItem><MenuItem value={365}>1 year</MenuItem></Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 105 }}><InputLabel>Env</InputLabel><Select value={environment} label="Env" onChange={(e) => setEnvironment(e.target.value)}><MenuItem value="all">All</MenuItem><MenuItem value="live">Live</MenuItem><MenuItem value="test">Test</MenuItem></Select></FormControl>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => loadAnalytics(workspaceId)} disabled={!workspaceId}>Refresh</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!hasWorkspacePermission(workspace?.role, "reports.export") || !workspaceId || exporting}>Export CSV</Button>
        </Box>
      </Box>

      {workspaceError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => loadWorkspaces().catch(() => {})}>Retry</Button>}>{workspaceError}</Alert>}
      {!workspaceError && !loading && !workspaces.length && <Alert severity="info" sx={{ mb: 2 }}>Create a workspace first to start viewing workspace analytics.</Alert>}

      {!loading && analytics?.detailTruncated && <Alert severity="info" sx={{ mb: 2 }}>Trend totals are based on server-side daily aggregates. Detailed records used for drilldowns are capped at 5,000 requests per query window.</Alert>}

      {workspaceError || !workspaces.length ? null : loading || !analytics ? <Grid container spacing={2}>{[1,2,3,4,5,6].map((i) => <Grid item xs={12} sm={6} lg={i < 5 ? 3 : 6} key={i}><Skeleton variant="rounded" height={150} /></Grid>)}</Grid> : (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[["Requests", analytics.totals.requests, NEON.blue], ["Verified", analytics.totals.verified, NEON.green], ["Failed", analytics.totals.failed, NEON.orange], ["Expired", analytics.totals.expired, NEON.pink]].map(([label, value, color]) => <Grid item xs={12} sm={6} lg={3} key={label}><Card sx={{ height: "100%", background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent><Typography variant="caption" sx={{ opacity: .5, fontWeight: 700 }}>{label}</Typography><Typography variant="h4" sx={{ fontWeight: 900, mt: .5, color }}>{Number(value || 0).toLocaleString("en-IN")}</Typography><Typography variant="caption" sx={{ opacity: .42 }}>{label === "Requests" ? `${Number(analytics.comparison?.requests || 0) >= 0 ? "+" : ""}${analytics.comparison?.requests || 0}% vs previous` : "Server-derived metric"}</Typography></CardContent></Card></Grid>)}
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} lg={8}><Card sx={{ height: "100%", background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent sx={{ p: 2.5 }}><Typography sx={{ fontWeight: 800 }}>Requests by day</Typography><Typography variant="caption" sx={{ opacity: .45, display: "block", mb: 2 }}>Creation volume for {analytics.range.days} days</Typography><BarChart data={series.map((d) => ({ label: d.day.slice(5), value: d.requests }))} color={NEON.blue} height={180} /></CardContent></Card></Grid>
            <Grid item xs={12} md={6} lg={2}><Card sx={{ height: "100%", background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent><Typography sx={{ fontWeight: 800, mb: 2 }}>Methods</Typography><DonutChart data={analytics.methodBreakdown || []} size={100} /></CardContent></Card></Grid>
            <Grid item xs={12} md={6} lg={2}><Card sx={{ height: "100%", background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent><Typography sx={{ fontWeight: 800, mb: 2 }}>Risk</Typography><DonutChart data={analytics.riskBreakdown || []} size={100} /></CardContent></Card></Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={7}><Card sx={{ background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent><Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}><FilterAltOutlinedIcon sx={{ color: NEON.orange }} /><Typography sx={{ fontWeight: 800 }}>Top risk signals</Typography></Box>{topSignals.length === 0 ? <Typography variant="body2" sx={{ opacity: .45 }}>No risk signals recorded in this period.</Typography> : topSignals.map((item) => <Box key={item.label} sx={{ display: "flex", justifyContent: "space-between", py: 1, borderBottom: "1px solid rgba(99,102,241,.06)" }}><Typography variant="body2">{item.label}</Typography><Chip size="small" label={item.value} /></Box>)}</CardContent></Card></Grid>
            <Grid item xs={12} md={5}><Card sx={{ background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent><Typography sx={{ fontWeight: 800, mb: 1.5 }}>Current quota</Typography><Typography variant="h4" sx={{ fontWeight: 900 }}>{Number(analytics.usage.used || 0).toLocaleString("en-IN")}{analytics.usage.limit == null ? "" : ` / ${Number(analytics.usage.limit).toLocaleString("en-IN")}`}</Typography><Typography variant="caption" sx={{ opacity: .45 }}>{analytics.usage.limit == null ? "Unlimited configured quota" : `${analytics.usage.percent}% used this month · ${Number(analytics.usage.remaining).toLocaleString("en-IN")} remaining`}</Typography><Box sx={{ mt: 2, height: 8, borderRadius: 99, background: `${NEON.blue}12`, overflow: "hidden" }}><Box sx={{ height: "100%", width: `${analytics.usage.percent}%`, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})` }} /></Box></CardContent></Card></Grid>
          </Grid>

          <Card sx={{ background: darkMode ? "rgba(15,18,28,.72)" : "rgba(255,255,255,.84)", border: "1px solid rgba(99,102,241,.10)" }}><CardContent sx={{ p: 0 }}><Box sx={{ p: 2.5, borderBottom: "1px solid rgba(99,102,241,.08)" }}><Typography sx={{ fontWeight: 800 }}>Recent verification requests</Typography><Typography variant="caption" sx={{ opacity: .45 }}>{workspace?.name || workspaceId}</Typography></Box><Box sx={{ overflowX: "auto" }}><Table size="small"><TableHead><TableRow><TableCell>ID</TableCell><TableCell>Method</TableCell><TableCell>Status</TableCell><TableCell>Environment</TableCell><TableCell>Risk</TableCell><TableCell>Created</TableCell></TableRow></TableHead><TableBody>{analytics.recentRequests.map((row) => <TableRow key={row.id} hover><TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>{row.id}</TableCell><TableCell sx={{ textTransform: "capitalize" }}>{row.method}</TableCell><TableCell><Chip size="small" label={row.status} sx={{ textTransform: "capitalize", fontWeight: 700 }} /></TableCell><TableCell>{row.environment}</TableCell><TableCell>{Number(row.riskScore || 0)}</TableCell><TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</TableCell></TableRow>)}</TableBody></Table></Box></CardContent></Card>
        </>
      )}
    </Container>
  );
}
