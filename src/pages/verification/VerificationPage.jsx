import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ApiRoundedIcon from "@mui/icons-material/ApiRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { toast } from "react-hot-toast";
import { apiDownload, apiRequest } from "../../services/apiClient.js";
import "./verification.css";

const STATUS_ORDER = ["all", "pending", "verified", "failed", "expired"];
const METHOD_ORDER = ["all", "email", "phone"];
const ENVIRONMENT_ORDER = ["all", "test", "live"];

const STATUS_LABELS = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
  expired: "Expired",
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (options.compact) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function transitionState(update) {
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!reduceMotion && typeof document !== "undefined" && typeof document.startViewTransition === "function") {
    document.startViewTransition(update);
    return;
  }
  update();
}

function maskEmail(value) {
  const email = String(value || "").trim();
  const [local, domain] = email.split("@");
  if (!local || !domain) return "—";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function requestDestination(request) {
  if (request?.method === "email") return maskEmail(request.email);
  if (request?.method === "phone") return request.phoneMasked || "Masked phone unavailable";
  return "Destination unavailable";
}

function methodLabel(method) {
  return method === "phone" ? "Phone" : method === "email" ? "Email" : "Unknown";
}

function riskLabel(request) {
  if (request?.riskScore == null || !Number.isFinite(Number(request.riskScore))) return "Unavailable";
  const score = safeNumber(request?.riskScore);
  if (score >= 80) return request?.disposable ? "High · disposable" : "High";
  return "Standard";
}

function riskValue(request) { return request?.riskScore != null && Number.isFinite(Number(request.riskScore)) ? Number(request.riskScore) : "—"; }

function statusTone(status, darkMode) {
  const tones = {
    verified: {
      text: darkMode ? "oklch(0.88 0.05 158)" : "oklch(0.41 0.08 158)",
      border: darkMode ? "oklch(0.72 0.06 158 / .28)" : "oklch(0.49 0.08 158 / .20)",
      surface: darkMode ? "oklch(0.42 0.05 158 / .12)" : "oklch(0.88 0.04 158 / .36)",
    },
    pending: {
      text: darkMode ? "oklch(0.87 0.025 232)" : "oklch(0.42 0.045 232)",
      border: darkMode ? "oklch(0.76 0.035 232 / .26)" : "oklch(0.49 0.04 232 / .18)",
      surface: darkMode ? "oklch(0.46 0.03 232 / .10)" : "oklch(0.89 0.025 232 / .38)",
    },
    failed: {
      text: darkMode ? "oklch(0.79 0.11 20)" : "oklch(0.45 0.13 20)",
      border: darkMode ? "oklch(0.66 0.12 20 / .28)" : "oklch(0.51 0.12 20 / .18)",
      surface: darkMode ? "oklch(0.48 0.10 20 / .10)" : "oklch(0.90 0.06 20 / .34)",
    },
    expired: {
      text: darkMode ? "oklch(0.72 0.012 255)" : "oklch(0.45 0.014 255)",
      border: darkMode ? "oklch(0.63 0.012 255 / .20)" : "oklch(0.48 0.012 255 / .16)",
      surface: darkMode ? "oklch(0.42 0.010 255 / .10)" : "oklch(0.88 0.008 255 / .32)",
    },
  };
  return tones[status] || tones.pending;
}

function SpectralSurface({ children, darkMode, active = false, sx = {}, className }) {
  return (
    <Box
      className={className}
      sx={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid transparent",
        borderRadius: 3.25,
        background: darkMode
          ? active
            ? "linear-gradient(145deg, rgba(20,22,23,.98), rgba(11,12,14,.98)) padding-box, linear-gradient(115deg, var(--verify-rose), rgba(255,255,255,.13) 28%, var(--verify-opal) 54%, var(--verify-solar) 78%, var(--verify-rose)) border-box"
            : "linear-gradient(145deg, rgba(20,22,23,.97), rgba(11,12,14,.97)) padding-box, linear-gradient(120deg, rgba(255,255,255,.13), rgba(255,255,255,.035) 52%, rgba(255,255,255,.09)) border-box"
          : active
            ? "linear-gradient(145deg, rgba(255,255,252,.99), rgba(246,245,241,.985)) padding-box, linear-gradient(115deg, var(--verify-rose), rgba(108,113,116,.16) 28%, var(--verify-opal) 54%, var(--verify-solar) 78%, var(--verify-rose)) border-box"
            : "linear-gradient(145deg, rgba(255,255,252,.99), rgba(246,245,241,.985)) padding-box, linear-gradient(120deg, rgba(74,79,82,.16), rgba(74,79,82,.05) 52%, rgba(74,79,82,.11)) border-box",
        boxShadow: darkMode
          ? "0 22px 55px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.035)"
          : "0 18px 46px rgba(40,43,44,.07), inset 0 1px 0 rgba(255,255,255,.92)",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function Metric({ icon, label, value, helper, darkMode, spectral = false }) {
  return (
    <SpectralSurface darkMode={darkMode} active={spectral} sx={{ minHeight: 126, p: 2.15 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2.1,
            display: "grid",
            placeItems: "center",
            color: darkMode ? "oklch(0.88 0.01 250)" : "oklch(0.32 0.015 250)",
            background: darkMode ? "rgba(255,255,255,.045)" : "rgba(27,31,33,.038)",
            border: `1px solid ${darkMode ? "rgba(255,255,255,.07)" : "rgba(36,40,42,.07)"}`,
            "& svg": { fontSize: 19 },
          }}
        >
          {icon}
        </Box>
        <Box
          aria-hidden="true"
          sx={{
            width: 34,
            height: "1px",
            background: spectral
              ? "linear-gradient(90deg, transparent, var(--verify-opal), var(--verify-rose), transparent)"
              : darkMode
                ? "linear-gradient(90deg, transparent, rgba(255,255,255,.20), transparent)"
                : "linear-gradient(90deg, transparent, rgba(35,40,43,.22), transparent)",
          }}
        />
      </Box>
      <Typography
        sx={{
          mt: 1.45,
          fontSize: 27,
          lineHeight: 1.05,
          fontWeight: 850,
          letterSpacing: "-.045em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" sx={{ mt: .65, display: "block", fontWeight: 800, letterSpacing: ".075em", fontSize: 9.5, color: "text.primary" }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ display: "block", mt: .25, color: "text.secondary", opacity: .78, lineHeight: 1.5 }}>
        {helper}
      </Typography>
    </SpectralSurface>
  );
}

function StatusChip({ status, darkMode }) {
  const tone = statusTone(status, darkMode);
  return (
    <Chip
      size="small"
      label={STATUS_LABELS[status] || String(status || "Unknown")}
      sx={{
        height: 25,
        fontWeight: 800,
        fontSize: 10.5,
        color: tone.text,
        background: tone.surface,
        border: `1px solid ${tone.border}`,
        "& .MuiChip-label": { px: 1.05 },
      }}
    />
  );
}

function MethodMark({ method, darkMode }) {
  const isPhone = method === "phone";
  return (
    <Box
      sx={{
        width: 34,
        height: 34,
        borderRadius: 2,
        display: "grid",
        placeItems: "center",
        color: darkMode ? "rgba(246,247,247,.84)" : "rgba(24,28,30,.78)",
        background: darkMode ? "rgba(255,255,255,.035)" : "rgba(22,27,29,.035)",
        border: `1px solid ${darkMode ? "rgba(255,255,255,.07)" : "rgba(28,32,35,.07)"}`,
        "& svg": { fontSize: 17 },
      }}
    >
      {isPhone ? <PhoneIphoneRoundedIcon /> : <MailOutlineRoundedIcon />}
    </Box>
  );
}

function SignalTrace({ request, darkMode }) {
  const status = request?.status;
  const finalLabel = status === "verified" ? "Verified" : status === "failed" ? "Failed" : status === "expired" ? "Expired" : "Awaiting proof";
  const isFinal = ["verified", "failed", "expired"].includes(status);
  const finalTime = status === "verified" ? request?.verifiedAt : isFinal ? request?.updatedAt : null;
  const stages = [
    { label: "Created", detail: formatDate(request?.createdAt, { compact: true }), complete: true },
    { label: "Challenge", detail: request?.delivery ? String(request.delivery).toUpperCase() : "Issued", complete: true },
    { label: finalLabel, detail: finalTime ? formatDate(finalTime, { compact: true }) : status === "pending" ? "In progress" : "Time unavailable", complete: isFinal },
  ];

  return (
    <Box sx={{ mt: 1.4 }}>
      <Typography variant="caption" sx={{ fontWeight: 850, letterSpacing: ".13em", fontSize: 9, color: "text.secondary" }}>SIGNAL TRACE</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", mt: 1.35 }}>
        {stages.map((stage, index) => {
          const terminalTone = statusTone(status, darkMode);
          const active = index < 2 || stage.complete;
          return (
            <Box key={stage.label} sx={{ position: "relative", pr: index < stages.length - 1 ? 1 : 0 }}>
              {index < stages.length - 1 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: 17,
                    right: -1,
                    top: 6,
                    height: "1px",
                    background: index === 1 && status === "pending"
                      ? "linear-gradient(90deg, rgba(190,194,196,.34), var(--verify-opal), var(--verify-rose), rgba(190,194,196,.20))"
                      : darkMode
                        ? "rgba(255,255,255,.12)"
                        : "rgba(31,35,37,.12)",
                    backgroundSize: index === 1 && status === "pending" ? "220% 100%" : "auto",
                    animation: index === 1 && status === "pending" ? "verifySpectralFlow 3.8s ease-in-out infinite" : "none",
                  }}
                />
              )}
              <Box
                sx={{
                  width: 13,
                  height: 13,
                  borderRadius: "50%",
                  position: "relative",
                  zIndex: 1,
                  background: active
                    ? index === 2 && isFinal
                      ? terminalTone.text
                      : darkMode ? "#D8DADB" : "#353A3D"
                    : darkMode ? "#34383B" : "#D5D7D6",
                  boxShadow: active ? `0 0 0 4px ${darkMode ? "rgba(255,255,255,.045)" : "rgba(26,30,32,.045)"}` : "none",
                }}
              />
              <Typography sx={{ mt: 1.05, fontSize: 11.5, fontWeight: 800 }}>{stage.label}</Typography>
              <Typography variant="caption" sx={{ display: "block", mt: .2, color: "text.secondary", opacity: .72, lineHeight: 1.35 }}>{stage.detail}</Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function VerificationInspector({ request, open, onClose, darkMode }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copyId = async () => {
    if (!request?.id) return;
    try {
      await navigator.clipboard.writeText(request.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Unable to copy request ID.");
    }
  };

  const detailRows = request ? [
    ["Environment", request.environment ? String(request.environment).toUpperCase() : "—"],
    ["Risk score", riskValue(request) === "—" ? "Unavailable" : `${riskValue(request)} · ${riskLabel(request)}`],
    ["Created", formatDate(request.createdAt)],
    ["Expires", formatDate(request.expiresAt)],
    ["Verified", formatDate(request.verifiedAt)],
    ["Attempts", request.attempts == null ? "—" : `${safeNumber(request.attempts)}${request.maxAttempts != null ? ` / ${safeNumber(request.maxAttempts)}` : ""}`],
    ["External user", request.externalUserId || "Not supplied"],
  ] : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 470 },
          maxWidth: "100vw",
          "--verify-rose": "#bac4d2",
          "--verify-opal": "#91adc9",
          "--verify-solar": "#cbd2da",
          color: darkMode ? "#F2F3F2" : "#171A1C",
          backgroundColor: darkMode ? "#0D0E10" : "#FFFFFC",
          backgroundImage: darkMode
            ? "radial-gradient(circle at 90% 0%, color-mix(in oklch, var(--verify-rose) 11%, transparent), transparent 25%), linear-gradient(160deg, #161819, #0D0E10 72%)"
            : "radial-gradient(circle at 90% 0%, color-mix(in oklch, var(--verify-opal) 14%, transparent), transparent 26%), linear-gradient(160deg, #FFFFFC, #F4F3EF 72%)",
          borderLeft: `1px solid ${darkMode ? "rgba(255,255,255,.08)" : "rgba(32,36,38,.09)"}`,
          boxShadow: darkMode ? "-24px 0 70px rgba(0,0,0,.34)" : "-24px 0 70px rgba(32,35,37,.12)",
        },
      }}
      ModalProps={{ keepMounted: true }}
    >
      {request && (
        <Box sx={{ p: { xs: 2.1, sm: 2.7 }, minHeight: "100%" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 850, fontSize: 9, letterSpacing: ".16em", color: "text.secondary" }}>VERIFICATION INSPECTOR</Typography>
              <Box sx={{ mt: .9, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.035em" }}>{methodLabel(request.method)} verification</Typography>
                <StatusChip status={request.status} darkMode={darkMode} />
              </Box>
              <Typography variant="body2" sx={{ mt: .65, color: "text.secondary" }}>{requestDestination(request)}</Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close verification inspector" sx={{ mt: -.5 }}><CloseRoundedIcon /></IconButton>
          </Box>

          <SpectralSurface darkMode={darkMode} active={request.status === "pending"} sx={{ mt: 2.5, p: 2.2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
                <Box sx={{ width: 38, height: 38, borderRadius: 2.2, display: "grid", placeItems: "center", background: darkMode ? "rgba(255,255,255,.045)" : "rgba(26,30,32,.04)", border: `1px solid ${darkMode ? "rgba(255,255,255,.07)" : "rgba(26,30,32,.07)"}` }}><FingerprintRoundedIcon sx={{ fontSize: 19 }} /></Box>
                <Box><Typography sx={{ fontWeight: 850 }}>Proof state</Typography><Typography variant="caption" sx={{ color: "text.secondary" }}>Derived from the real verification request.</Typography></Box>
              </Box>
              {request.status === "verified" && <CheckCircleRoundedIcon sx={{ color: statusTone("verified", darkMode).text }} />}
            </Box>
            <SignalTrace request={request} darkMode={darkMode} />
          </SpectralSurface>

          <Box sx={{ mt: 2.6 }}>
            <Typography variant="caption" sx={{ fontWeight: 850, fontSize: 9, letterSpacing: ".15em", color: "text.secondary" }}>REQUEST ID</Typography>
            <Box sx={{ mt: .75, display: "flex", alignItems: "center", gap: .8, p: 1.15, borderRadius: 2, border: `1px solid ${darkMode ? "rgba(255,255,255,.07)" : "rgba(28,32,35,.08)"}`, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(24,28,30,.025)" }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>{request.id}</Typography>
              <Tooltip title={copied ? "Copied" : "Copy ID"}><IconButton size="small" onClick={copyId} aria-label="Copy verification request ID">{copied ? <CheckCircleRoundedIcon fontSize="small" /> : <ContentCopyRoundedIcon fontSize="small" />}</IconButton></Tooltip>
            </Box>
          </Box>

          <Divider sx={{ my: 2.5, borderColor: darkMode ? "rgba(255,255,255,.07)" : "rgba(30,34,36,.08)" }} />

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 850, fontSize: 9, letterSpacing: ".15em", color: "text.secondary" }}>PROPERTIES</Typography>
            <Box sx={{ mt: 1 }}>
              {detailRows.map(([label, value]) => (
                <Box key={label} sx={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 1.2, py: 1.05, borderBottom: `1px solid ${darkMode ? "rgba(255,255,255,.045)" : "rgba(30,34,36,.055)"}` }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>{label}</Typography>
                  <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 700, wordBreak: "break-word" }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {Array.isArray(request.riskSignals) && request.riskSignals.length > 0 && (
            <Box sx={{ mt: 2.4 }}>
              <Typography variant="caption" sx={{ fontWeight: 850, fontSize: 9, letterSpacing: ".15em", color: "text.secondary" }}>RISK SIGNALS</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: .65, mt: 1 }}>
                {request.riskSignals.map((signal) => <Chip key={signal} size="small" label={String(signal).replaceAll("_", " ")} sx={{ height: 26, fontWeight: 750, fontSize: 10.5 }} />)}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Drawer>
  );
}

function RequestCard({ request, darkMode, onOpen }) {
  const isPending = request.status === "pending";
  return (
    <SpectralSurface
      darkMode={darkMode}
      active={isPending}
      sx={{
        p: 1.55,
        cursor: "pointer",
        transition: "transform 170ms cubic-bezier(.22,1,.36,1), box-shadow 170ms ease",
        "&:hover": { transform: "translateY(-2px)" },
        "&:focus-visible": { outline: "2px solid var(--verify-opal)", outlineOffset: 3 },
      }}
    >
      <Box role="button" tabIndex={0} aria-label={`Open ${methodLabel(request.method)} verification ${request.id}`} onClick={() => onOpen(request)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(request); } }} sx={{ "&:focus-visible": { outline: "2px solid #355eaa", outlineOffset: 4, borderRadius: 1 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.3, alignItems: "flex-start" }}>
          <Box sx={{ display: "flex", gap: 1.1, minWidth: 0 }}>
            <MethodMark method={request.method} darkMode={darkMode} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 850, fontSize: 13.5 }}>{methodLabel(request.method)}</Typography>
              <Typography variant="caption" sx={{ mt: .1, display: "block", color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{requestDestination(request)}</Typography>
            </Box>
          </Box>
          <StatusChip status={request.status} darkMode={darkMode} />
        </Box>
        <Box sx={{ mt: 1.35, pt: 1.1, borderTop: `1px solid ${darkMode ? "rgba(255,255,255,.055)" : "rgba(30,34,36,.06)"}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Box><Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontSize: 9.5 }}>ENVIRONMENT</Typography><Typography variant="caption" sx={{ fontWeight: 800 }}>{String(request.environment || "—").toUpperCase()}</Typography></Box>
          <Box><Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontSize: 9.5 }}>RISK</Typography><Typography variant="caption" sx={{ fontWeight: 800 }}>{riskValue(request)} · {riskLabel(request)}</Typography></Box>
        </Box>
        <Box sx={{ mt: 1.05, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{formatDate(request.createdAt, { compact: true })}</Typography>
          <ArrowForwardRoundedIcon sx={{ fontSize: 16, opacity: .46 }} />
        </Box>
      </Box>
    </SpectralSurface>
  );
}

export function VerificationPage({ user, darkMode }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [usage, setUsage] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [dataError, setDataError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const dataController = useRef(null), workspaceController = useRef(null), exportController = useRef(null);
  const exportLock = useRef(false);
  const queryParams = useMemo(() => new URLSearchParams({ history: "1", page: String(page), limit: "25", q: search, status: statusFilter, method: methodFilter, environment: environmentFilter, from: dateFrom, to: dateTo, sort }).toString(), [page, search, statusFilter, methodFilter, environmentFilter, dateFrom, dateTo, sort]);
  const context = `${user?.uid}|${workspaceId}|${queryParams}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const identityRef = useRef(user?.uid);
  identityRef.current = user?.uid;
  const [loadedContext, setLoadedContext] = useState("");
  const invalidDates = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  useEffect(() => { const timer = setTimeout(() => { setSearch(queryText.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [queryText]);

  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId) || null, [workspaces, workspaceId]);

  const quota = usage?.quota || {};
  const used = Number.isFinite(Number(quota.used))
    ? Number(quota.used)
    : safeNumber(usage?.usage?.verificationRequests ?? usage?.verificationRequests, 0);
  const limit = quota.limit == null
    ? usage?.limit == null ? null : safeNumber(usage.limit, null)
    : safeNumber(quota.limit, null);
  const quotaKnown = typeof quota.unlimited === "boolean" || limit != null;
  const unlimited = quota.unlimited === true;
  const remaining = quota.remaining == null ? (unlimited || limit == null ? null : Math.max(0, limit - used)) : safeNumber(quota.remaining, null);
  const quotaPercent = quota.percent != null && Number.isFinite(Number(quota.percent))
    ? Math.min(100, Math.max(0, Number(quota.percent)))
    : !unlimited && limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : null;
  const quotaReached = typeof quota.reached === "boolean" ? quota.reached : (!unlimited && limit != null && used >= limit);

  const verifiedCount = useMemo(() => requests.filter((request) => request.status === "verified").length, [requests]);
  const pendingCount = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);
  const highRiskCount = useMemo(() => requests.filter((request) => safeNumber(request.riskScore) >= 80).length, [requests]);

  const filteredRequests = requests;

  const loadWorkspaces = useCallback(async () => {
    workspaceController.current?.abort();
    const controller = new AbortController(); workspaceController.current = controller;
    const uid = user?.uid;
    setWorkspaceError("");
    try {
      const result = await apiRequest(user, "/workspaces", { signal: controller.signal });
      if (controller.signal.aborted || identityRef.current !== uid) return;
      const rows = Array.isArray(result.workspaces) ? result.workspaces : [];
      setWorkspaces(rows);
      setWorkspaceId((current) => current || rows[0]?.id || "");
      if (!rows.length) setLoading(false);
    } catch (error) {
      if (controller.signal.aborted || identityRef.current !== uid) return;
      setWorkspaceError(error.message || "Unable to load workspaces.");
      setLoading(false);
      throw error;
    }
  }, [user]);

  const loadData = useCallback(async (id, { silent = false } = {}) => {
    if (!id || invalidDates) return;
    dataController.current?.abort();
    const controller = new AbortController(); dataController.current = controller;
    const captured = `${user?.uid}|${id}|${queryParams}`;
    const current = () => !controller.signal.aborted && contextRef.current === captured;
    if (!silent) setLoading(true);
    setRefreshing(silent);
    try {
      const month = new Date().toISOString().slice(0, 7);
      const [usageData, requestData] = await Promise.all([
        apiRequest(user, `/workspaces/${encodeURIComponent(id)}/usage?month=${month}`, { signal: controller.signal }),
        apiRequest(user, `/workspaces/${encodeURIComponent(id)}/verification-requests?${queryParams}`, { signal: controller.signal }),
      ]);
      if (!current()) return;
      const rows = Array.isArray(requestData.verificationRequests) ? requestData.verificationRequests : [];
      setDataError("");
      setUsage(usageData);
      setRequests(rows);
      setTotal(safeNumber(requestData.total));
      setSelectedRequest(selected => selected ? rows.find(row => row.id === selected.id) || null : null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (!current()) return;
      setDataError(error.message || "Unable to load verification data.");
      if (!silent) toast.error(error.message || "Unable to load verification data.");
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); setLoadedContext(captured); }
    }
  }, [user, queryParams, invalidDates]);

  useEffect(() => {
    if (!user) return undefined;
    setWorkspaces([]); setWorkspaceId(""); setRequests([]); setUsage(null); setLoading(true);
    loadWorkspaces().catch(() => { });
    return () => workspaceController.current?.abort();
  }, [loadWorkspaces, user]);

  useEffect(() => { setUsage(null); setLastUpdatedAt(null); }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    setSelectedRequest(null);
    setRequests([]);
    setDataError(""); setTotal(0);
    loadData(workspaceId).catch(() => { });
    return () => { dataController.current?.abort(); exportController.current?.abort(); exportLock.current = false; setExporting(false); };
  }, [loadData, workspaceId]);

  useEffect(() => {
    if (!workspaceId || invalidDates) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && !refreshing) loadData(workspaceId, { silent: true }).catch(() => { });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadData, refreshing, invalidDates, workspaceId]);

  const refresh = async () => {
    if (!workspaceId || refreshing || invalidDates) return;
    await loadData(workspaceId, { silent: true });
  };
  const resetFilters = () => { setQueryText(""); setSearch(""); setStatusFilter("all"); setMethodFilter("all"); setEnvironmentFilter("all"); setDateFrom(""); setDateTo(""); setSort("newest"); setPage(1); };
  const exportPage = async () => {
    if (exportLock.current || invalidDates || loading || dataError) return;
    const captured = context; const controller = new AbortController(); exportController.current = controller;
    exportLock.current = true; setExporting(true);
    try {
      const blob = await apiDownload(user, `/workspaces/${encodeURIComponent(workspaceId)}/verification-history.csv?${queryParams}`, { signal: controller.signal });
      if (controller.signal.aborted || contextRef.current !== captured) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "nexus-verification-page.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Verification page exported.");
    } catch (error) { if (!controller.signal.aborted && contextRef.current === captured) toast.error(error.message || "Export failed."); }
    finally { if (exportController.current === controller) { exportLock.current = false; setExporting(false); } }
  };

  const periodLabel = useMemo(() => {
    const start = usage?.period?.start;
    const resetsAt = usage?.period?.resetsAt;
    if (!start || !resetsAt) return "Current monthly period";
    const startDate = new Date(start);
    const resetDate = new Date(resetsAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(resetDate.getTime())) return "Current monthly period";
    return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${resetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, [usage]);

  const baseText = darkMode ? "#F4F4F1" : "#171A1C";
  const mutedText = darkMode ? "rgba(234,235,233,.60)" : "rgba(34,39,41,.58)";
  const hairline = darkMode ? "rgba(255,255,255,.075)" : "rgba(30,34,36,.08)";

  if (workspaceError || (!workspaces.length && !loading)) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, position: "relative", zIndex: 1 }}>
        <Alert
          severity={workspaceError ? "error" : "info"}
          action={workspaceError ? <Button color="inherit" size="small" onClick={() => loadWorkspaces().catch(() => { })}>Retry</Button> : <Button color="inherit" size="small" onClick={() => navigate("/workspace")}>Open Workspace</Button>}
        >
          {workspaceError || "Create a workspace first, then connect your application with a Nexus API key."}
        </Alert>
      </Container>
    );
  }

  return (
    <Box className="verification-console"
      sx={{
        "--verify-rose": "#bac4d2",
        "--verify-opal": "#91adc9",
        "--verify-solar": "#cbd2da",
        "--verify-ice": "oklch(0.86 0.025 232)",
        color: baseText,
        minHeight: "100%",
        position: "relative",
        isolation: "isolate",
        "@media (color-gamut: p3)": {
          "--verify-rose": "#bac4d2",
          "--verify-opal": "#91adc9",
          "--verify-solar": "#cbd2da",
          "--verify-ice": "color(display-p3 .70 .84 .90)",
        },
        "@keyframes verifySpectralFlow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "@keyframes verifyBreath": {
          "0%, 100%": { opacity: .34, transform: "scale(1)" },
          "50%": { opacity: .55, transform: "scale(1.04)" },
        },
        "@keyframes verifySpin": {
          to: { transform: "rotate(360deg)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "&, & *": { scrollBehavior: "auto !important" },
          "& *": { animationDuration: "0.001ms !important", animationIterationCount: "1 !important" },
        },
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          background: darkMode
            ? "radial-gradient(circle at 78% 4%, color-mix(in oklch, var(--verify-opal) 7%, transparent), transparent 27%), radial-gradient(circle at 16% 76%, color-mix(in oklch, var(--verify-rose) 5%, transparent), transparent 31%), linear-gradient(180deg, rgba(255,255,255,.012), transparent 44%)"
            : "radial-gradient(circle at 78% 4%, color-mix(in oklch, var(--verify-opal) 8%, transparent), transparent 27%), radial-gradient(circle at 16% 76%, color-mix(in oklch, var(--verify-rose) 6%, transparent), transparent 31%), linear-gradient(180deg, rgba(20,24,26,.018), transparent 44%)",
        },
      }}
    >
      <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 2.7, lg: 3.2 }, position: "relative", zIndex: 1 }}>
        <SpectralSurface
          className="verification-hero"
          darkMode={darkMode}
          active
          sx={{
            p: { xs: 2, sm: 2.4, lg: 2.6 },
            mb: 2.2,
            background: darkMode
              ? "linear-gradient(145deg, rgba(20,22,23,.985), rgba(11,12,14,.985)) padding-box, linear-gradient(112deg, rgba(255,255,255,.10), var(--verify-rose), rgba(255,255,255,.11) 33%, var(--verify-opal) 58%, var(--verify-solar), rgba(255,255,255,.10)) border-box"
              : "linear-gradient(145deg, rgba(255,255,252,.995), rgba(246,245,241,.99)) padding-box, linear-gradient(112deg, rgba(54,59,62,.11), var(--verify-rose), rgba(54,59,62,.10) 33%, var(--verify-opal) 58%, var(--verify-solar), rgba(54,59,62,.10)) border-box",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2.5, flexWrap: "wrap" }}>
            <Box sx={{ maxWidth: 760 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.15 }}>
                <Box sx={{ width: 25, height: 25, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${hairline}`, background: darkMode ? "rgba(255,255,255,.035)" : "rgba(27,31,33,.03)" }}><FingerprintRoundedIcon sx={{ fontSize: 13 }} /></Box>
                <Typography variant="caption" sx={{ fontWeight: 900, fontSize: 9.5, letterSpacing: ".18em", color: mutedText }}>IDENTITY OPERATIONS</Typography>
              </Box>
              <Typography component="h1" sx={{ fontSize: { xs: 30, sm: 36, lg: 40 }, lineHeight: 1.1, fontWeight: 850, letterSpacing: "-.045em" }}>
                Verification
              </Typography>
              <Typography sx={{ mt: 1.25, color: mutedText, fontSize: { xs: 13.5, sm: 14.5 }, lineHeight: 1.7, maxWidth: 690 }}>
                Inspect real verification traffic, quota state, risk signals, and proof outcomes across your workspace environments.
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", width: { xs: "100%", md: "auto" } }}>
              <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 220 } }}>
                <InputLabel>Workspace</InputLabel>
                <Select value={workspaceId} label="Workspace" onChange={(event) => { setWorkspaceId(event.target.value); resetFilters(); }} sx={{ borderRadius: 2.2, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.55)" }}>
                  {workspaces.map((ws) => <MenuItem key={ws.id} value={ws.id}>{ws.name || ws.id}</MenuItem>)}
                </Select>
              </FormControl>
              <Tooltip title="Refresh real verification data">
                <span><IconButton onClick={refresh} disabled={refreshing || !workspaceId} aria-label="Refresh verification data" sx={{ width: 42, height: 42, border: `1px solid ${hairline}`, borderRadius: 2.2 }}><RefreshRoundedIcon sx={{ fontSize: 19, animation: refreshing ? "verifySpin 900ms linear infinite" : "none" }} /></IconButton></span>
              </Tooltip>
              <Button variant="contained" startIcon={<CodeRoundedIcon />} onClick={() => navigate("/developer")} sx={{ minHeight: 42, px: 2, borderRadius: 2.2, fontWeight: 850, color: darkMode ? "#111315" : "#F9F8F4", background: darkMode ? "linear-gradient(180deg,#F3F3EF,#C9CDCC)" : "linear-gradient(180deg,#25282A,#121416)", boxShadow: "none", "&:hover": { boxShadow: "none", filter: "brightness(1.04)" } }}>
                Developer Portal
              </Button>
            </Box>
          </Box>

          <Box sx={{ mt: 2.5, pt: 1.7, borderTop: `1px solid ${hairline}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.4, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", gap: .7, flexWrap: "wrap" }}>
              {usage?.planId && <Chip size="small" label={String(usage.planId).toUpperCase()} sx={{ height: 26, fontWeight: 850, fontSize: 10 }} />}
              {workspace?.role && <Chip size="small" variant="outlined" label={String(workspace.role).toUpperCase()} sx={{ height: 26, fontWeight: 800, fontSize: 10, borderColor: hairline }} />}
              <Chip size="small" variant="outlined" label="REQUEST HISTORY" sx={{ height: 26, fontWeight: 800, fontSize: 9.5, borderColor: hairline }} />
            </Box>
            <Typography variant="caption" sx={{ color: mutedText }}>
              {lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for verification telemetry"}
            </Typography>
          </Box>
        </SpectralSurface>

        {workspace && (
          <Alert
            severity="info"
            icon={<ApiRoundedIcon />}
            sx={{ mb: 2.2, borderRadius: 2.5, border: `1px solid ${hairline}`, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.62)", "& .MuiAlert-message": { width: "100%" } }}
          >
            Verification creation remains API-driven. Start with a <strong>test</strong> API key in Developer Portal; live requests use the workspace owner's current subscription quota.
          </Alert>
        )}

        {dataError && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2.4 }} action={<Button color="inherit" size="small" onClick={refresh}>Retry</Button>}>
            {dataError}
          </Alert>
        )}

        {loading && !loadedContext && !invalidDates ? (
          <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.4 }}>
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} variant="rounded" height={126} sx={{ borderRadius: 3.25 }} />)}
            </Box>
            <Skeleton variant="rounded" height={380} sx={{ mt: 1.6, borderRadius: 3.25 }} />
          </Box>
        ) : (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.4, mb: 1.6 }}>
              <Metric icon={<ApiRoundedIcon />} label="MONTHLY REQUESTS" value={quota.used != null || usage?.usage?.verificationRequests != null || usage?.verificationRequests != null ? used.toLocaleString("en-IN") : "—"} helper={!quotaKnown ? "Quota information unavailable" : unlimited ? "Unlimited by the current configured plan" : `${remaining == null ? "—" : remaining.toLocaleString("en-IN")} remaining · ${periodLabel}`} darkMode={darkMode} spectral={quotaReached} />
              <Metric icon={<CheckCircleRoundedIcon />} label="VERIFIED" value={verifiedCount.toLocaleString("en-IN")} helper="Verified on this results page" darkMode={darkMode} />
              <Metric icon={<TimelineRoundedIcon />} label="PENDING" value={pendingCount.toLocaleString("en-IN")} helper={pendingCount ? "Updates every 15 seconds while visible" : "No pending requests on this page"} darkMode={darkMode} spectral={pendingCount > 0} />
              <Metric icon={<ShieldOutlinedIcon />} label="HIGH RISK" value={highRiskCount.toLocaleString("en-IN")} helper="Risk score ≥ 80 on this page" darkMode={darkMode} spectral={highRiskCount > 0} />
            </Box>

            <SpectralSurface darkMode={darkMode} sx={{ p: { xs: 1.8, sm: 2.2 }, mb: 1.6 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) auto" }, gap: 2, alignItems: "center" }}>
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Usage envelope</Typography>
                      <Typography variant="caption" sx={{ color: mutedText }}>{periodLabel}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
                      {!quotaKnown ? "Unavailable" : unlimited ? "Unlimited" : `${used.toLocaleString("en-IN")} / ${limit == null ? "—" : limit.toLocaleString("en-IN")}`}
                    </Typography>
                  </Box>
                  {!unlimited && quotaPercent != null ? (
                    <Box sx={{ mt: 1.25 }}>
                      <LinearProgress
                        variant="determinate"
                        value={quotaPercent}
                        sx={{
                          height: 7,
                          borderRadius: 99,
                          background: darkMode ? "rgba(255,255,255,.055)" : "rgba(28,32,34,.055)",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 99,
                            background: quotaReached
                              ? "linear-gradient(90deg, oklch(0.66 0.12 20), var(--verify-rose))"
                              : "linear-gradient(90deg, #B7BBBC, var(--verify-opal), var(--verify-solar))",
                            transition: "transform 650ms cubic-bezier(.22,1,.36,1)",
                          },
                        }}
                      />
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: .65 }}>
                        <Typography variant="caption" sx={{ color: mutedText }}>{quotaReached ? "Monthly verification limit reached" : `${quotaPercent.toFixed(quotaPercent % 1 ? 1 : 0)}% used`}</Typography>
                        {remaining != null && <Typography variant="caption" sx={{ color: mutedText }}>{remaining.toLocaleString("en-IN")} remaining</Typography>}
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="caption" sx={{ mt: 1, display: "block", color: mutedText }}>{quotaKnown ? "No fixed verification quota is configured for this plan." : "Quota information unavailable. Refresh to try again."}</Typography>
                  )}
                </Box>
                <Box sx={{ minWidth: { md: 170 }, p: 1.35, borderRadius: 2.4, border: `1px solid ${hairline}`, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(24,28,30,.025)" }}>
                  <Typography variant="caption" sx={{ display: "block", color: mutedText, fontWeight: 700 }}>Workspace</Typography>
                  <Typography sx={{ mt: .2, fontWeight: 850, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{workspace?.name || workspaceId}</Typography>
                </Box>
              </Box>
            </SpectralSurface>

            <SpectralSurface darkMode={darkMode} sx={{ minHeight: 360 }}>
              <Box sx={{ p: { xs: 1.65, sm: 2.1 }, borderBottom: `1px solid ${hairline}` }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 1.5, flexWrap: "wrap" }}>
                  <Box>
                    <Typography sx={{ fontWeight: 900, letterSpacing: "-.02em", fontSize: 18 }}>Request history</Typography>
                    <Typography variant="caption" sx={{ color: mutedText }}>Search your request history by ID, email, masked phone, or external user.</Typography>
                  </Box>
                  <TextField
                    size="small"
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder="Search requests…"
                    inputProps={{ "aria-label": "Search verification requests" }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, opacity: .56 }} /></InputAdornment> }}
                    sx={{ width: { xs: "100%", sm: 270 }, "& .MuiOutlinedInput-root": { borderRadius: 2.2, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.55)" } }}
                  />
                </Box>

                <Box sx={{ mt: 1.5, display: "flex", gap: .7, flexWrap: "wrap", alignItems: "center" }}>
                  {STATUS_ORDER.map((status) => <Chip key={status} clickable size="small" label={status === "all" ? "All status" : STATUS_LABELS[status]} onClick={() => { setStatusFilter(status); setPage(1); }} variant={statusFilter === status ? "filled" : "outlined"} sx={{ height: 28, fontWeight: 750, fontSize: 10.5, borderColor: hairline, background: statusFilter === status ? (darkMode ? "rgba(255,255,255,.10)" : "rgba(24,28,30,.09)") : "transparent" }} />)}
                  <Divider flexItem orientation="vertical" sx={{ mx: .25, borderColor: hairline, display: { xs: "none", sm: "block" } }} />
                  {METHOD_ORDER.map((method) => <Chip key={method} clickable size="small" label={method === "all" ? "All methods" : methodLabel(method)} onClick={() => { setMethodFilter(method); setPage(1); }} variant={methodFilter === method ? "filled" : "outlined"} sx={{ height: 28, fontWeight: 750, fontSize: 10.5, borderColor: hairline, background: methodFilter === method ? (darkMode ? "rgba(255,255,255,.10)" : "rgba(24,28,30,.09)") : "transparent" }} />)}
                  <Divider flexItem orientation="vertical" sx={{ mx: .25, borderColor: hairline, display: { xs: "none", sm: "block" } }} />
                  {ENVIRONMENT_ORDER.map((environment) => <Chip key={environment} clickable size="small" label={environment === "all" ? "All env" : environment.toUpperCase()} onClick={() => { setEnvironmentFilter(environment); setPage(1); }} variant={environmentFilter === environment ? "filled" : "outlined"} sx={{ height: 28, fontWeight: 750, fontSize: 10.5, borderColor: hairline, background: environmentFilter === environment ? (darkMode ? "rgba(255,255,255,.10)" : "rgba(24,28,30,.09)") : "transparent" }} />)}
                </Box>
                <Box className="verification-history-controls">
                  <TextField size="small" type="date" label="From (UTC)" value={dateFrom} InputLabelProps={{ shrink: true }} error={invalidDates} onChange={event => { setDateFrom(event.target.value); setPage(1); }} />
                  <TextField size="small" type="date" label="To (UTC)" value={dateTo} InputLabelProps={{ shrink: true }} error={invalidDates} onChange={event => { setDateTo(event.target.value); setPage(1); }} />
                  <TextField select size="small" label="Order" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><MenuItem value="newest">Newest first</MenuItem><MenuItem value="oldest">Oldest first</MenuItem></TextField>
                  <Button onClick={resetFilters} sx={{ textTransform: "none" }}>Reset filters</Button>
                  {["owner", "admin", "developer", "analyst"].includes(workspace?.role) && <Button startIcon={<DownloadRoundedIcon />} variant="outlined" disabled={exporting || refreshing || loading || invalidDates || Boolean(dataError) || !requests.length} onClick={exportPage} sx={{ textTransform: "none", borderRadius: 2 }}>{exporting ? "Exporting…" : "Export this page"}</Button>}
                </Box>
              </Box>

              {(loading || loadedContext !== context) && !invalidDates ? (<Box sx={{ p: 4 }} role="status"><LinearProgress /><Typography sx={{ mt: 2 }}>Updating request history…</Typography></Box>) : dataError ? (<Box sx={{ p: 4 }}><Typography>Request history could not be updated. Please retry.</Typography></Box>) : invalidDates ? (<Box sx={{ p: 4 }}><Alert severity="warning">Start date must be before the end date.</Alert></Box>) : total === 0 && !search && statusFilter === "all" && methodFilter === "all" && environmentFilter === "all" && !dateFrom && !dateTo ? (
                <Box sx={{ py: 7.5, px: 2.5, textAlign: "center", maxWidth: 620, mx: "auto" }}>
                  <Box sx={{ width: 56, height: 56, mx: "auto", mb: 1.6, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${hairline}`, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(24,28,30,.025)" }}><FingerprintRoundedIcon sx={{ fontSize: 24, opacity: .7 }} /></Box>
                  <Typography sx={{ fontWeight: 900, letterSpacing: "-.02em" }}>No verification requests yet</Typography>
                  <Box className="verification-start-steps"><Box><Typography variant="overline">01 / CONNECT</Typography><Typography variant="body2">Create a test API key</Typography></Box><Box><Typography variant="overline">02 / SEND</Typography><Typography variant="body2">Send a test verification</Typography></Box><Box><Typography variant="overline">03 / INSPECT</Typography><Typography variant="body2">Follow the proof outcome</Typography></Box></Box>
                  <Typography variant="body2" sx={{ mt: .7, color: mutedText, lineHeight: 1.65 }}>Create a test API key in Developer Portal and send your first request to <code>POST /v1/verifications</code>. Nexus will display the real request here.</Typography>
                  <Button variant="outlined" startIcon={<CodeRoundedIcon />} onClick={() => navigate("/developer")} sx={{ mt: 2, borderRadius: 2.2, fontWeight: 800 }}>Open Developer Portal</Button>
                </Box>
              ) : filteredRequests.length === 0 ? (
                <Box sx={{ py: 6, px: 2.5, textAlign: "center" }}>
                  <SearchRoundedIcon sx={{ fontSize: 28, opacity: .4 }} />
                  <Typography sx={{ mt: 1, fontWeight: 850 }}>No matching requests</Typography>
                  <Typography variant="body2" sx={{ mt: .45, color: mutedText }}>Try another search term, return to the first page, or reset the filters.</Typography>
                  <Button onClick={resetFilters}>Reset filters and page</Button>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: { xs: "grid", md: "none" }, gridTemplateColumns: "1fr", gap: 1.05, p: 1.2 }}>
                    {filteredRequests.map((request) => <RequestCard key={request.id} request={request} darkMode={darkMode} onOpen={(request) => transitionState(() => setSelectedRequest(request))} />)}
                  </Box>

                  <Box sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
                    <Table size="small" sx={{ minWidth: 850 }}>
                      <TableHead>
                        <TableRow>
                          {["Status", "Method", "Destination", "Environment", "Risk", "Created", ""].map((heading) => <TableCell key={heading || "action"} sx={{ py: 1.4, color: mutedText, fontWeight: 850, fontSize: 9.5, letterSpacing: ".09em", borderColor: hairline }}>{heading.toUpperCase()}</TableCell>)}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredRequests.map((request) => (
                          <TableRow
                            key={request.id}
                            hover
                            tabIndex={0}
                            role="button"
                            aria-label={`Open ${methodLabel(request.method)} verification ${request.id}`}
                            onClick={() => transitionState(() => setSelectedRequest(request))}
                            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); transitionState(() => setSelectedRequest(request)); } }}
                            sx={{ cursor: "pointer", "& td": { borderColor: hairline }, "&:focus-visible": { outline: "2px solid var(--verify-opal)", outlineOffset: -2 }, "&:hover": { background: darkMode ? "rgba(255,255,255,.025) !important" : "rgba(25,29,31,.024) !important" } }}
                          >
                            <TableCell><StatusChip status={request.status} darkMode={darkMode} /></TableCell>
                            <TableCell><Box sx={{ display: "flex", alignItems: "center", gap: .9 }}><MethodMark method={request.method} darkMode={darkMode} /><Typography variant="body2" sx={{ fontWeight: 800 }}>{methodLabel(request.method)}</Typography></Box></TableCell>
                            <TableCell><Typography variant="body2" sx={{ fontWeight: 650 }}>{requestDestination(request)}</Typography></TableCell>
                            <TableCell><Chip size="small" variant="outlined" label={String(request.environment || "—").toUpperCase()} sx={{ height: 24, fontWeight: 800, fontSize: 9.5, borderColor: hairline }} /></TableCell>
                            <TableCell><Box><Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{riskValue(request)}</Typography><Typography variant="caption" sx={{ color: mutedText }}>{riskLabel(request)}</Typography></Box></TableCell>
                            <TableCell><Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>{formatDate(request.createdAt, { compact: true })}</Typography></TableCell>
                            <TableCell align="right"><ArrowForwardRoundedIcon sx={{ fontSize: 17, opacity: .45 }} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                </>
              )}
              <Box className="verification-history-footer" sx={{ borderTop: `1px solid ${hairline}` }}>
                <Typography variant="caption" color="text.secondary">{requests.length ? `${(page - 1) * 25 + 1}–${Math.min((page - 1) * 25 + requests.length, total)} of ${total.toLocaleString()} matching requests` : `${total.toLocaleString()} matching requests · No records on this page`} · Counts above reflect this page · Export includes this page only</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Button disabled={page <= 1 || refreshing || invalidDates} onClick={() => setPage(value => value - 1)}>Previous</Button><Typography variant="caption">Page {page}</Typography><Button disabled={page * 25 >= total || refreshing || invalidDates} onClick={() => setPage(value => value + 1)}>Next</Button></Box>
              </Box>
            </SpectralSurface>
          </>
        )}
      </Container>

      <VerificationInspector request={loadedContext === context ? selectedRequest : null} open={loadedContext === context && Boolean(selectedRequest)} onClose={() => transitionState(() => setSelectedRequest(null))} darkMode={darkMode} />
    </Box>
  );
}
