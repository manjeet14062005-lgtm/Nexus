import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { apiPublic } from "../../services/apiClient.js";
import { NEON } from "../../constants/theme";

export function StatusPage({ darkMode }) {
  const [status, setStatus] = useState("checking");
  const [data, setData] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const result = await apiPublic("/health");
      setData(result);
      setStatus(result.status === "ok" ? "operational" : "degraded");
      setCheckedAt(new Date());
    } catch (_) {
      setStatus("down");
      setCheckedAt(new Date());
    }
  }, []);
  useEffect(() => { check(); const id = setInterval(check, 60000); return () => clearInterval(id); }, [check]);
  const ok = status === "operational";
  return <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}><Box sx={{ mb: 4 }}><Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: "-.04em" }}>Nexus Status</Typography><Typography sx={{ opacity: .5, mt: 1 }}>Current service liveness for the public Nexus API.</Typography></Box><Card sx={{ background: darkMode ? "rgba(15,18,28,.78)" : "rgba(255,255,255,.9)" }}><CardContent sx={{ p: { xs: 2.5, md: 4 } }}><Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}><Box sx={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", background: ok ? `${NEON.green}15` : `${NEON.pink}15`, color: ok ? NEON.green : NEON.pink }}>{ok ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}</Box><Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 850 }}>{status === "checking" ? "Checking services…" : ok ? "All systems operational" : status === "down" ? "API unavailable" : "Service status degraded"}</Typography><Typography variant="caption" sx={{ opacity: .42 }}>{checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : "Checking now"}</Typography></Box><Button variant="outlined" startIcon={<RefreshIcon />} onClick={check}>Refresh</Button></Box><Divider sx={{ my: 3 }} /><Stack spacing={1.2}><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 1.5, borderRadius: 2, background: "rgba(15,23,42,.025)" }}><Typography variant="body2">Nexus API</Typography><Chip label={ok ? "Operational" : "Unavailable"} size="small" color={ok ? "success" : "error"} /></Box><Typography variant="caption" sx={{ opacity: .4 }}>This public page intentionally exposes liveness only. Dependency and configuration details stay behind the authenticated admin health endpoint.</Typography>{data?.requestId && <Typography variant="caption" sx={{ opacity: .32 }}>Check ID: {data.requestId}</Typography>}</Stack></CardContent></Card><Alert severity="info" sx={{ mt: 2.5 }}>For account-specific issues, sign in and open Support Center to create or track a ticket.</Alert></Container>;
}
