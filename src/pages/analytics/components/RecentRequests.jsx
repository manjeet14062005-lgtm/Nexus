import { analyticsPortalContainer } from "./portalContainer.js";
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { motion } from "motion/react";
import { toast } from "react-hot-toast";
import { AnalyticsSurface } from "./AnalyticsSurface.jsx";
import { finiteNumber, requestDay, requestMatchesSearch, sortRequests } from "../utils.js";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusMeta(status) {
  const value = String(status || "unknown").toLowerCase();
  if (value === "verified" || value === "completed" || value === "success") return { label: status || "Verified", color: "var(--an-success)", Icon: CheckCircleRoundedIcon };
  if (value === "failed" || value === "rejected") return { label: status || "Failed", color: "var(--an-danger)", Icon: ErrorOutlineRoundedIcon };
  if (value === "expired") return { label: status || "Expired", color: "var(--an-warning)", Icon: ScheduleRoundedIcon };
  if (value === "pending" || value === "created" || value === "sent") return { label: status || "Pending", color: "var(--an-primary-fg)", Icon: HourglassTopRoundedIcon };
  return { label: status || "Unknown", color: "var(--an-text-3)", Icon: InfoOutlinedIcon };
}

function StatusChip({ status }) {
  const meta = statusMeta(status);
  return (
    <Chip size="small" icon={<meta.Icon sx={{ fontSize: "14px !important" }} />} label={meta.label} sx={{ height: 25, borderRadius: 99, textTransform: "capitalize", fontSize: 10.5, fontWeight: 780, color: meta.color, background: `color-mix(in oklch, ${meta.color} 8%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 15%, transparent)`, "& .MuiChip-icon": { color: meta.color } }} />
  );
}

function RiskMeter({ value }) {
  const score = Math.max(0, Math.min(100, finiteNumber(value, 0)));
  const color = score >= 70 ? "var(--an-danger)" : score >= 40 ? "var(--an-warning)" : "var(--an-success)";
  return (
    <Box sx={{ minWidth: 86 }} aria-label={`Risk score ${score}`}>
      <Box sx={{ display: "flex", alignItems: "center", gap: .7 }}><Box sx={{ flex: 1, height: 5, borderRadius: 99, background: "var(--an-surface-soft)", overflow: "hidden" }}><Box sx={{ width: `${score}%`, height: "100%", borderRadius: 99, background: color }} /></Box><Typography variant="caption" sx={{ minWidth: 24, textAlign: "right", color: "var(--an-text-2)", fontWeight: 760, fontVariantNumeric: "tabular-nums" }}>{score}</Typography></Box>
    </Box>
  );
}

async function copyValue(value, successMessage = "Copied") {
  if (value === null || value === undefined || value === "") return false;
  try {
    await navigator.clipboard?.writeText(String(value));
    toast.success(successMessage);
    return true;
  } catch {
    toast.error("Could not copy this value.");
    return false;
  }
}

function CopyIdButton({ id, copiedId, onCopy }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: .35, minWidth: 0 }}>
      <Typography component="code" sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: "var(--an-text-2)" }}>{id || "—"}</Typography>
      {id && <Tooltip title={copiedId === id ? "Copied" : "Copy request ID"}><IconButton size="small" aria-label={`Copy request ID ${id}`} onClick={(event) => { event.stopPropagation(); onCopy(id); }} sx={{ width: 44, height: 44, color: "var(--an-text-3)" }}>{copiedId === id ? <DoneRoundedIcon sx={{ fontSize: 15, color: "var(--an-success)" }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}</IconButton></Tooltip>}
    </Box>
  );
}

function RequestDrawer({ request, onClose }) {
  const { level } = useAnalyticsMotion();
  const fields = request ? [
    { label: "Request ID", value: request.id, mono: true },
    { label: "Method", value: request.method },
    { label: "Status", value: request.status },
    { label: "Environment", value: request.environment },
    { label: "Risk score", value: request.riskScore, risk: true },
    { label: "Created", value: request.createdAt ? formatTimestamp(request.createdAt) : null },
  ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "") : [];

  return (
    <Drawer container={analyticsPortalContainer}
      anchor="right"
      open={Boolean(request)}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100vw", background: "var(--an-surface)", color: "var(--an-text)", borderLeft: "1px solid var(--an-border)", boxShadow: "-24px 0 70px rgba(20,28,48,.13)" } }}
    >
      <Box component={motion.div} initial={level === "full" ? { opacity: 0, x: 18, filter: "blur(4px)" } : level === "reduced" ? { opacity: 0 } : false} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={level === "full" ? { type: "spring", stiffness: 260, damping: 30 } : { duration: level === "off" ? 0 : .15 }} sx={{ minHeight: "100%" }}>
        <Box sx={{ p: 2.2, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, borderBottom: "1px solid var(--an-border)" }}>
          <Box><Typography sx={{ fontSize: 19, fontWeight: 880, letterSpacing: "-.025em" }}>Request details</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>Only whitelisted analytics fields are rendered.</Typography></Box>
          <IconButton aria-label="Close request details" onClick={onClose} sx={{ width: 44, height: 44, color: "var(--an-text-2)" }}><CloseRoundedIcon /></IconButton>
        </Box>

        <Box sx={{ p: 2.2 }}>
          {request?.status && <StatusChip status={request.status} />}
          <Box sx={{ mt: 2, display: "grid", gap: 1 }}>
            {fields.map((field) => (
              <Box key={field.label} sx={{ p: 1.35, borderRadius: 1.8, border: "1px solid var(--an-border)", background: "var(--an-surface-soft)" }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography variant="caption" sx={{ color: "var(--an-text-3)", fontWeight: 720 }}>{field.label}</Typography>{!field.risk && <IconButton aria-label={`Copy ${field.label}`} onClick={() => copyValue(field.value, `${field.label} copied`)} sx={{ width: 32, height: 32, color: "var(--an-text-3)" }}><ContentCopyRoundedIcon sx={{ fontSize: 14 }} /></IconButton>}</Box>
                {field.risk ? <Box sx={{ mt: .55 }}><RiskMeter value={field.value} /></Box> : <Typography sx={{ mt: .1, fontSize: 13, fontWeight: 760, textTransform: ["Method", "Status", "Environment"].includes(field.label) ? "capitalize" : "none", color: "var(--an-text)", fontFamily: field.mono ? '"JetBrains Mono", monospace' : "inherit", wordBreak: field.mono ? "break-all" : "normal" }}>{String(field.value)}</Typography>}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}

export function RecentRequests({ requests, activeDay, onActiveDay }) {
  const { level } = useAnalyticsMotion();
  const rows = useMemo(() => Array.isArray(requests) ? requests : [], [requests]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selected, setSelected] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const filtered = useMemo(() => sortRequests(rows.filter((row) => requestMatchesSearch(row, search)), sortKey, sortDirection), [rows, search, sortDirection, sortKey]);

  const changeSort = (key) => {
    if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "createdAt" || key === "riskScore" ? "desc" : "asc");
    }
  };

  const copyId = async (id) => {
    const copied = await copyValue(id, "Request ID copied");
    if (!copied) return;
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => current === id ? "" : current), 1600);
  };

  const Header = ({ column, children, align = "left" }) => (
    <TableCell align={align} sx={{ color: "var(--an-text-3)", fontSize: 10.5, fontWeight: 800, borderBottomColor: "var(--an-border)", whiteSpace: "nowrap" }}>
      <TableSortLabel active={sortKey === column} direction={sortKey === column ? sortDirection : "asc"} onClick={() => changeSort(column)} sx={{ color: "inherit !important", "& .MuiTableSortLabel-icon": { color: "var(--an-text-3) !important" } }}>{children}</TableSortLabel>
    </TableCell>
  );

  return (
    <AnalyticsSurface sx={{ p: { xs: 1.4, sm: 2 } }} accent="var(--an-info)" interactive>
      <Box sx={{ display: "flex", alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 1.2, flexDirection: { xs: "column", sm: "row" }, mb: 1.5 }}>
        <Box><Typography sx={{ fontSize: 15.5, fontWeight: 850, letterSpacing: "-.02em", color: "var(--an-text)" }}>Recent requests</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)" }}>The latest {rows.length} requests returned by analytics.</Typography></Box>
        <TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, method, status…" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: "var(--an-text-3)" }} /></InputAdornment> }} sx={{ width: { xs: "100%", sm: 285 }, "& .MuiOutlinedInput-root": { minHeight: 44, borderRadius: 2, color: "var(--an-text)", background: "var(--an-surface-soft)", "& fieldset": { borderColor: "var(--an-border)" }, "&.Mui-focused fieldset": { borderColor: "var(--an-primary)", boxShadow: "0 0 0 3px var(--an-focus)" } } }} />
      </Box>

      {filtered.length === 0 ? (
        <Box sx={{ py: 5, textAlign: "center" }}><Typography sx={{ fontWeight: 820, color: "var(--an-text)" }}>{rows.length === 0 ? "No recent requests" : "No matching requests"}</Typography><Typography variant="body2" sx={{ mt: .5, color: "var(--an-text-3)" }}>{rows.length === 0 ? "Requests will appear here when the server returns recent verification detail." : "Try a different request ID, method, status, environment, or risk score."}</Typography></Box>
      ) : (
        <>
          <TableContainer sx={{ display: { xs: "none", md: "block" }, maxHeight: 520, border: "1px solid var(--an-border)", borderRadius: 2, overflow: "auto" }}>
            <Table stickyHeader size="small" aria-label="Recent verification requests">
              <TableHead><TableRow sx={{ "& th": { background: "var(--an-surface)" } }}><Header column="id">Request</Header><Header column="method">Method</Header><Header column="status">Status</Header><Header column="environment">Environment</Header><Header column="riskScore" align="right">Risk</Header><Header column="createdAt" align="right">Created</Header></TableRow></TableHead>
              <TableBody>
                {filtered.map((request, index) => {
                  const day = requestDay(request);
                  const highlighted = Boolean(activeDay && day === activeDay);
                  return (
                    <TableRow
                      component={motion.tr}
                      layout={level === "full" ? "position" : false}
                      transition={level === "full" ? { type: "spring", stiffness: 360, damping: 34 } : { duration: 0 }}
                      key={request.id || `${day}-${index}`}
                      hover
                      onMouseEnter={() => day && onActiveDay?.(day)}
                      onFocus={() => day && onActiveDay?.(day)}
                      onClick={() => setSelected(request)}
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(request); } }}
                      sx={{ cursor: "pointer", background: highlighted ? "color-mix(in oklch,var(--an-primary) 5%,transparent)" : "transparent", "& td": { borderBottomColor: "var(--an-border)" }, "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: -2 } }}
                    >
                      <TableCell><CopyIdButton id={request.id} copiedId={copiedId} onCopy={copyId} /></TableCell>
                      <TableCell sx={{ color: "var(--an-text-2)", textTransform: "capitalize", fontSize: 11.5 }}>{request.method || "—"}</TableCell>
                      <TableCell><StatusChip status={request.status} /></TableCell>
                      <TableCell sx={{ color: "var(--an-text-2)", textTransform: "capitalize", fontSize: 11.5 }}>{request.environment || "—"}</TableCell>
                      <TableCell align="right"><RiskMeter value={request.riskScore} /></TableCell>
                      <TableCell align="right" sx={{ color: "var(--an-text-2)", fontSize: 11, whiteSpace: "nowrap", fontFamily: '"JetBrains Mono",monospace', fontVariantNumeric: "tabular-nums" }}>{formatTimestamp(request.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: { xs: "grid", md: "none" }, gap: .8 }}>
            {filtered.map((request, index) => {
              const day = requestDay(request);
              const highlighted = Boolean(activeDay && day === activeDay);
              return (
                <Button key={request.id || `${day}-${index}`} onMouseEnter={() => day && onActiveDay?.(day)} onFocus={() => day && onActiveDay?.(day)} onClick={() => setSelected(request)} sx={{ p: 1.3, minHeight: 96, display: "block", textAlign: "left", textTransform: "none", borderRadius: 2, border: highlighted ? "1px solid color-mix(in oklch,var(--an-primary) 30%,var(--an-border))" : "1px solid var(--an-border)", background: highlighted ? "color-mix(in oklch,var(--an-primary) 5%,var(--an-surface-soft))" : "var(--an-surface-soft)", color: "var(--an-text)", "&:focus-visible": { outline: "2px solid var(--an-primary)", outlineOffset: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><StatusChip status={request.status} /><Typography variant="caption" sx={{ color: "var(--an-text-3)", textTransform: "capitalize" }}>{request.method || "—"} · {request.environment || "—"}</Typography></Box>
                  <Box sx={{ mt: .9, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography component="code" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: "var(--an-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{request.id || "—"}</Typography><Typography variant="caption" sx={{ color: "var(--an-text-3)", whiteSpace: "nowrap", fontFamily: '"JetBrains Mono",monospace' }}>{formatTimestamp(request.createdAt)}</Typography></Box>
                  <Box sx={{ mt: .8 }}><RiskMeter value={request.riskScore} /></Box>
                </Button>
              );
            })}
          </Box>
        </>
      )}

      <RequestDrawer request={selected} onClose={() => setSelected(null)} />
    </AnalyticsSurface>
  );
}
