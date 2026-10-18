import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import DomainVerificationRoundedIcon from "@mui/icons-material/DomainVerificationRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import PolicyRoundedIcon from "@mui/icons-material/PolicyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { apiDownload, apiRequest } from "../../services/apiClient.js";
import { useUserProfile } from "../../contexts/UserProfileContext";
import { WorkspaceReauthentication } from "../../components/common/WorkspaceReauthentication";
import { useSearchParams } from "react-router-dom";
import "./security.css";
import { toast } from "react-hot-toast";

const RETENTION_OPTIONS = [30, 60, 90, 180, 365];

const SPECTRUM = {
  ink: "#070908",
  carbon: "#0D100F",
  graphite: "#161A18",
  graphiteSoft: "#202521",
  pearl: "#F7F5EF",
  porcelain: "#FCFBF7",
  platinum: "#B8C0BB",
  titanium: "#7D8983",
  chrome: "#D4D8D5",
  champagne: "#71869F",
  brass: "#B99052",
  emerald: "#587A91",
  mint: "#7CAE9B",
  steelCyan: "#6E9DA8",
  coolSteel: "#8295A6",
  olive: "#987C54",
  warmGold: "#C6A666",
  amber: "#D28A3F",
  copper: "#B96E4D",
  roseMetal: "#A96A6E",
  critical: "#C35B5B",
  success: "#4F8669",
};

const TAB_META = [
  { label: "Overview", accent: SPECTRUM.champagne, icon: <ShieldRoundedIcon /> },
  { label: "Threat Activity", accent: SPECTRUM.amber, icon: <WarningAmberRoundedIcon /> },
  { label: "Access Policies", accent: SPECTRUM.olive, icon: <PolicyRoundedIcon /> },
  { label: "Audit Trail", accent: SPECTRUM.copper, icon: <HistoryRoundedIcon /> },
  { label: "Sessions", accent: SPECTRUM.steelCyan, icon: <DevicesRoundedIcon /> },
];

const SEVERITY_TONE = {
  low: SPECTRUM.coolSteel,
  medium: SPECTRUM.amber,
  warning: SPECTRUM.amber,
  high: SPECTRUM.roseMetal,
  critical: SPECTRUM.critical,
  success: SPECTRUM.success,
};

const SOURCE_TONE = {
  security: SPECTRUM.amber,
  activity: SPECTRUM.steelCyan,
  api: SPECTRUM.copper,
};

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = safeDate(value);
  if (!date) return "Timestamp unavailable";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSync(value) {
  if (!value) return "Not synced yet";
  return `Synced ${value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function isFeatureUnavailable(error) {
  return Number(error?.status) === 402 || error?.data?.code === "FEATURE_NOT_INCLUDED";
}

export function withinDateRange(value, from, to) {
  if (!from && !to) return true;
  const date = safeDate(value);
  return Boolean(date && (!from || date >= new Date(`${from}T00:00:00`)) && (!to || date <= new Date(`${to}T23:59:59.999`)));
}

function SpectralMetric({ icon, label, value, caption, accent, darkMode, loading }) {
  return (
    <Box className="security-metric"
      sx={{
        minHeight: 126,
        p: 2.1,
        borderRadius: 3,
        position: "relative",
        overflow: "hidden",
        border: "1px solid transparent",
        background: darkMode
          ? `linear-gradient(145deg,rgba(17,21,19,.96),rgba(8,10,9,.96)) padding-box,
             linear-gradient(135deg,${accent}55,rgba(255,255,255,.055) 42%,rgba(255,255,255,.018) 70%,${accent}20) border-box`
          : `linear-gradient(145deg,rgba(255,255,252,.98),rgba(247,246,241,.96)) padding-box,
             linear-gradient(135deg,${accent}48,rgba(70,79,73,.10) 42%,rgba(255,255,255,.7) 70%,${accent}22) border-box`,
        boxShadow: darkMode
          ? "0 18px 46px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.035)"
          : "0 16px 38px rgba(32,38,34,.055), inset 0 1px 0 rgba(255,255,255,.84)",
        transition: "transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease, filter 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: darkMode
            ? `0 24px 54px rgba(0,0,0,.26), 0 0 0 1px ${accent}10`
            : `0 22px 48px rgba(32,38,34,.075), 0 0 0 1px ${accent}0E`,
          filter: "brightness(1.018)",
        },
        "&::before": {
          content: '""',
          position: "absolute",
          width: 150,
          height: 150,
          right: -62,
          top: -74,
          borderRadius: "50%",
          background: `radial-gradient(circle,${accent}22 0%,${accent}0C 38%,transparent 72%)`,
          pointerEvents: "none",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          left: 18,
          right: 18,
          top: 0,
          height: "1px",
          background: `linear-gradient(90deg,transparent,${accent}72,transparent)`,
          opacity: 0.58,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2.1,
            display: "grid",
            placeItems: "center",
            color: accent,
            background: `${accent}10`,
            border: `1px solid ${accent}1C`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,.08)`,
            "& svg": { fontSize: 18 },
          }}
        >
          {icon}
        </Box>
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 0 4px ${accent}10, 0 0 16px ${accent}44`,
          }}
        />
      </Box>

      <Box sx={{ mt: 1.55 }}>
        {loading ? (
          <Skeleton width={72} height={34} />
        ) : (
          <Typography
            sx={{
              fontSize: 23,
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-.035em",
              fontVariantNumeric: "tabular-nums",
              wordBreak: "break-word",
            }}
          >
            {value}
          </Typography>
        )}
        <Typography variant="caption" sx={{ mt: 0.5, display: "block", fontWeight: 760, color: "text.primary" }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ mt: 0.12, display: "block", color: "text.secondary", opacity: 0.72 }}>
          {caption}
        </Typography>
      </Box>
    </Box>
  );
}

function SectionShell({ children, darkMode, accent = SPECTRUM.platinum, sx = {} }) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: "1px solid transparent",
        background: darkMode
          ? `linear-gradient(145deg,rgba(14,17,16,.97),rgba(8,10,9,.95)) padding-box,
             linear-gradient(135deg,${accent}26,rgba(255,255,255,.045) 44%,rgba(255,255,255,.015)) border-box`
          : `linear-gradient(145deg,rgba(255,255,252,.98),rgba(248,247,243,.95)) padding-box,
             linear-gradient(135deg,${accent}28,rgba(70,79,73,.09) 44%,rgba(255,255,255,.9)) border-box`,
        boxShadow: darkMode
          ? "0 18px 48px rgba(0,0,0,.16), inset 0 1px 0 rgba(255,255,255,.025)"
          : "0 16px 40px rgba(32,38,34,.05), inset 0 1px 0 rgba(255,255,255,.86)",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function EmptyState({ icon, title, description, accent }) {
  return (
    <Box sx={{ py: 6, px: 3, textAlign: "center", maxWidth: 560, mx: "auto" }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          mx: "auto",
          mb: 1.7,
          borderRadius: 3,
          display: "grid",
          placeItems: "center",
          color: accent,
          background: `${accent}0C`,
          border: `1px solid ${accent}1C`,
          boxShadow: `0 16px 36px ${accent}0A, inset 0 1px 0 rgba(255,255,255,.12)`,
          "& svg": { fontSize: 24 },
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>{title}</Typography>
      <Typography variant="body2" sx={{ mt: 0.65, color: "text.secondary", lineHeight: 1.65 }}>
        {description}
      </Typography>
    </Box>
  );
}

function StatusLine({ icon, title, description, state, accent, darkMode }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.35,
        px: 1.4,
        py: 1.25,
        borderRadius: 2.3,
        border: `1px solid ${accent}16`,
        background: darkMode ? `linear-gradient(90deg,${accent}08,transparent 72%)` : `linear-gradient(90deg,${accent}08,transparent 72%)`,
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          color: accent,
          background: `${accent}0E`,
          border: `1px solid ${accent}18`,
          "& svg": { fontSize: 17 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 780 }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.12 }}>
          {description}
        </Typography>
      </Box>
      <Chip
        label={state}
        size="small"
        sx={{
          height: 24,
          fontSize: 10,
          fontWeight: 800,
          color: accent,
          background: `${accent}0E`,
          border: `1px solid ${accent}1B`,
        }}
      />
    </Box>
  );
}

export function AdvancedSecurityPage({ user, darkMode = false }) {
  const { profile, profileLoading, profileError } = useUserProfile();
  const [params] = useSearchParams();
  const returnedWorkspace = params.get("reauthWorkspace");
  const [dirty, setDirty] = useState(false), [domains, setDomains] = useState("");
  const [pendingWorkspace, setPendingWorkspace] = useState("");
  const [clearDialog, setClearDialog] = useState(false), [reauth, setReauth] = useState("");
  const [exporting, setExporting] = useState(false);
  const workspaceRequest = useRef(null), securityRequest = useRef(null), dirtyRef = useRef(false), mutation = useRef(false), exportLock = useRef(false);
  const context = useRef("");
  const savedPolicy = useRef(null);
  const draftContext = useRef("");
  const restored = useRef("");
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");

  const [securityEvents, setSecurityEvents] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [policy, setPolicy] = useState(null);

  const [securityError, setSecurityError] = useState(null);
  const [auditError, setAuditError] = useState(null);
  const [policyError, setPolicyError] = useState(null);

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const [eventQuery, setEventQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditSource, setAuditSource] = useState("all");
  const [eventFrom, setEventFrom] = useState(""), [eventTo, setEventTo] = useState("");
  const [auditFrom, setAuditFrom] = useState(""), [auditTo, setAuditTo] = useState("");
  const [eventPage, setEventPage] = useState(0), [auditPage, setAuditPage] = useState(0);
  useEffect(() => { setEventPage(0); setAuditPage(0); }, [workspaceId, eventQuery, severityFilter, auditQuery, auditSource, eventFrom, eventTo, auditFrom, auditTo]);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [revokedAt, setRevokedAt] = useState(null);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId) || null,
    [workspaces, workspaceId]
  );

  const contextKey = `${user?.uid || ""}:${workspaceId}`;
  context.current = contextKey;
  dirtyRef.current = dirty;
  const draftKey = `nexus-security-draft:${contextKey}`;
  const editPolicy = (next) => { setDirty(true); setPolicy(next); };
  useEffect(() => {
    if (!dirty || !policy || draftContext.current !== contextKey) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ policy, domains })); } catch (_) { /* Storage is optional. */ }
  }, [dirty, policy, domains, draftKey, contextKey]);
  const canManage = ["owner", "admin"].includes(String(workspace?.role || "").toLowerCase());
  const policyFeatureUnavailable = isFeatureUnavailable(policyError);
  const auditFeatureUnavailable = isFeatureUnavailable(auditError);

  const loadWorkspaces = useCallback(async () => {
    workspaceRequest.current?.abort();
    const controller = new AbortController(); workspaceRequest.current = controller;
    setWorkspaceLoading(true); setWorkspaceError("");
    try {
      const result = await apiRequest(user, "/workspaces", { signal: controller.signal });
      if (controller.signal.aborted) return;
      const rows = Array.isArray(result.workspaces) ? result.workspaces : [];
      setWorkspaces(rows);
      setWorkspaceId(current => rows.some(row => row.id === current) ? current : rows[0]?.id || "");
    } catch (error) { if (!controller.signal.aborted) setWorkspaceError(error.message || "Unable to load workspaces."); }
    finally { if (!controller.signal.aborted) setWorkspaceLoading(false); }
  }, [user]);

  const loadSecurity = useCallback(async (id = workspaceId, { silent = false } = {}) => {
    if (!id || !user) return;
    securityRequest.current?.abort();
    const controller = new AbortController(); securityRequest.current = controller;
    const key = `${user.uid}:${id}`;
    if (silent) setRefreshing(true); else setLoading(true);
    const [events, policies, audit] = await Promise.allSettled([
      apiRequest(user, `/workspaces/${encodeURIComponent(id)}/security-events?limit=100`, { signal: controller.signal }),
      apiRequest(user, `/workspaces/${encodeURIComponent(id)}/security-policy`, { signal: controller.signal }),
      apiRequest(user, `/workspaces/${encodeURIComponent(id)}/audit-log?limit=100`, { signal: controller.signal }),
    ]);
    if (controller.signal.aborted || context.current !== key) return;
    setSecurityEvents(events.status === "fulfilled" ? events.value.events || [] : []);
    setSecurityError(events.status === "rejected" ? events.reason : null);
    setAuditEvents(audit.status === "fulfilled" ? audit.value.events || [] : []);
    setAuditError(audit.status === "rejected" ? audit.reason : null);
    if (policies.status === "fulfilled") {
      savedPolicy.current = policies.value.policy || null;
      setPolicyError(null);
      if (!dirtyRef.current) {
        draftContext.current = key;
        let draft;
        try { draft = JSON.parse(sessionStorage.getItem(`nexus-security-draft:${key}`)); } catch (_) { /* Optional draft. */ }
        setPolicy(draft?.policy || savedPolicy.current);
        setDomains(draft?.domains ?? (savedPolicy.current?.allowedInviteDomains || []).join(", "));
        if (draft?.policy) { dirtyRef.current = true; setDirty(true); }
      }
    } else {
      setPolicyError(policies.reason);
      if (!dirtyRef.current) setPolicy(null);
    }
    setLastSyncedAt(new Date()); setLoading(false); setRefreshing(false);
  }, [user, workspaceId]);

  useEffect(() => {
    setWorkspaces([]); setWorkspaceId("");
    loadWorkspaces();
    return () => { workspaceRequest.current?.abort(); securityRequest.current?.abort(); context.current = ""; };
  }, [loadWorkspaces]);
  useEffect(() => {
    if (returnedWorkspace && restored.current !== returnedWorkspace && workspaces.some(row => row.id === returnedWorkspace)) {
      restored.current = returnedWorkspace; setWorkspaceId(returnedWorkspace); setTab(2);
    }
  }, [returnedWorkspace, workspaces]);
  useEffect(() => {
    dirtyRef.current = false; setDirty(false); setPolicy(null); setDomains(""); savedPolicy.current = null;
    setSecurityEvents([]); setAuditEvents([]); setSecurityError(null); setAuditError(null); setPolicyError(null);
    setLastSyncedAt(null); setLoading(Boolean(workspaceId)); setRefreshing(false); setReauth("");
    setSaving(false); setRevokingSessions(false); setExporting(false); setRevokedAt(null); setRevokeDialogOpen(false); setClearDialog(false);
    if (!workspaceId) return undefined;
    loadSecurity(workspaceId);
    const timer = window.setInterval(() => { if (!mutation.current) loadSecurity(workspaceId, { silent: true }); }, 45000);
    return () => { clearInterval(timer); securityRequest.current?.abort(); };
  }, [workspaceId, loadSecurity]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const filteredSecurityEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    return securityEvents.filter((event) => {
      const severity = String(event.severity || "low").toLowerCase();
      if (!withinDateRange(event.createdAt || event.ts, eventFrom, eventTo)) return false;
      if (severityFilter !== "all" && severity !== severityFilter) return false;
      if (!query) return true;
      return `${event.message || ""} ${event.type || ""} ${event.actorUid || ""}`.toLowerCase().includes(query);
    });
  }, [securityEvents, eventQuery, severityFilter, eventFrom, eventTo]);

  const filteredAuditEvents = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    return auditEvents.filter((event) => {
      if (!withinDateRange(event.createdAt, auditFrom, auditTo)) return false;
      if (auditSource !== "all" && event.source !== auditSource) return false;
      if (!query) return true;
      return `${event.message || ""} ${event.type || ""} ${event.actor || ""} ${event.requestId || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [auditEvents, auditQuery, auditSource, auditFrom, auditTo]);

  const identityChecks = useMemo(
    () => [
      {
        label: "Email verification",
        description: "Primary account email verification state.",
        done: Boolean(user?.emailVerified),
        icon: <EmailRoundedIcon />,
        accent: SPECTRUM.emerald,
      },
      {
        label: "Verified phone",
        description: profileLoading ? "Checking your saved profile…" : profileError ? "Phone verification status could not be loaded." : "Your verified Nexus contact number.",
        done: !profileLoading && !profileError && profile?.phoneVerified === true && Boolean(profile?.phone),
        icon: <PhoneIphoneRoundedIcon />,
        accent: SPECTRUM.steelCyan,
      },
      {
        label: "Linked Google identity",
        description: "Optional sign-in method. Email and password accounts do not need to link Google.",
        optional: true,
        done: Boolean(user?.providerData?.some((provider) => ["google", "google.com"].includes(provider.providerId))),
        icon: <FingerprintRoundedIcon />,
        accent: SPECTRUM.champagne,
      },
    ],
    [user, profile, profileLoading, profileError]
  );


  const severeLoadedCount = securityEvents.filter((event) => ["high", "critical"].includes(String(event.severity || "").toLowerCase())).length;
  const latestSecurityEvent = securityEvents[0] || null;
  const currentTabAccent = TAB_META[tab]?.accent || SPECTRUM.champagne;

  const telemetryState = workspaceId
    ? loading
      ? "Syncing telemetry"
      : securityError && auditError && policyError
      ? "Telemetry unavailable"
      : securityError || (auditError && !auditFeatureUnavailable) || (policyError && !policyFeatureUnavailable)
      ? "Partial telemetry"
      : "Telemetry synced"
    : "No workspace selected";

  const discardDraft = () => {
    setDirty(false); dirtyRef.current = false; setPolicy(savedPolicy.current);
    setDomains((savedPolicy.current?.allowedInviteDomains || []).join(", "));
    try { sessionStorage.removeItem(draftKey); } catch (_) { /* Optional storage. */ }
  };
  const savePolicy = async (confirmedClear = false) => {
    if (!workspaceId || !canManage || !policy || !dirty || mutation.current || reauth === "policy") return;
    const list = domains.trim() ? domains.split(",").map(value => value.trim().toLowerCase().replace(/^@/, "")) : [];
    if (list.length > 50 || list.some(value => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value))) {
      toast.error("Enter valid domains separated by commas, such as example.com."); return;
    }
    if (!list.length && savedPolicy.current?.allowedInviteDomains?.length && !confirmedClear) { setClearDialog(true); return; }
    const key = contextKey, storageKey = draftKey;
    mutation.current = true; setSaving(true);
    try {
      const result = await apiRequest(user, `/workspaces/${encodeURIComponent(workspaceId)}/security-policy`, { method: "PATCH", body: JSON.stringify({ ...policy, allowedInviteDomains: list }) });
      if (context.current !== key) return;
      savedPolicy.current = result.policy; setPolicy(result.policy); setDomains((result.policy?.allowedInviteDomains || []).join(", "));
      setDirty(false); dirtyRef.current = false; setClearDialog(false); setReauth("");
      try { sessionStorage.removeItem(storageKey); } catch (_) { /* Optional storage. */ }
      toast.success("Workspace security policy saved.");
      await loadSecurity(workspaceId, { silent: true });
    } catch (error) {
      if (context.current !== key) return;
      setClearDialog(false);
      if (error.data?.code === "RECENT_AUTH_REQUIRED") setReauth("policy");
      toast.error(error.message || "Unable to save security policy. Your draft is preserved.");
    } finally { mutation.current = false; if (context.current === key) setSaving(false); }
  };
  const exportAudit = async () => {
    if (!workspaceId || exportLock.current) return;
    const key = contextKey;
    exportLock.current = true; setExporting(true);
    try {
      const blob = await apiDownload(user, `/workspaces/${encodeURIComponent(workspaceId)}/audit-log.csv?limit=250`);
      if (context.current !== key) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `nexus-audit-${workspaceId}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      toast.success("Audit log exported.");
    } catch (error) { if (context.current === key) toast.error(error.message || "Unable to export audit log."); }
    finally { exportLock.current = false; setExporting(false); }
  };
  const revokeAllSessions = async () => {
    if (mutation.current || reauth === "sessions") return;
    const key = contextKey; mutation.current = true; setRevokingSessions(true);
    try {
      const result = await apiRequest(user, "/account/security/revoke-all-sessions", { method: "POST" });
      if (context.current !== key) return;
      setRevokedAt(result.revokedAt || new Date().toISOString()); setRevokeDialogOpen(false); setReauth("");
      toast.success("Sessions revoked. Existing access may continue until its token expires.");
    } catch (error) {
      if (context.current !== key) return;
      if (error.data?.code === "RECENT_AUTH_REQUIRED") setReauth("sessions");
      toast.error(error.message || "Unable to revoke active sessions.");
    } finally { mutation.current = false; if (context.current === key) setRevokingSessions(false); }
  };

  const panelBorder = darkMode ? "rgba(191,201,195,.11)" : "rgba(65,75,68,.10)";
  const subtleBorder = darkMode ? "rgba(191,201,195,.075)" : "rgba(65,75,68,.07)";
  const innerBg = darkMode ? "rgba(255,255,255,.025)" : "rgba(70,79,73,.028)";

  return (
    <Box className="security-upgrade" data-theme={darkMode ? "dark" : "light"}
      sx={{
        minHeight: "100%",
        p: { xs: 1.5, sm: 2.2, lg: 3 },
        position: "relative",
        isolation: "isolate",
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          backgroundImage: darkMode
            ? `linear-gradient(rgba(184,192,187,.018) 1px,transparent 1px),
               linear-gradient(90deg,rgba(184,192,187,.018) 1px,transparent 1px),
               radial-gradient(circle at 12% 9%,${SPECTRUM.champagne}0B,transparent 27%),
               radial-gradient(circle at 91% 13%,${SPECTRUM.steelCyan}09,transparent 31%),
               radial-gradient(circle at 68% 78%,${SPECTRUM.copper}07,transparent 34%)`
            : `linear-gradient(rgba(88,99,91,.015) 1px,transparent 1px),
               linear-gradient(90deg,rgba(88,99,91,.015) 1px,transparent 1px),
               radial-gradient(circle at 12% 9%,${SPECTRUM.champagne}10,transparent 27%),
               radial-gradient(circle at 91% 13%,${SPECTRUM.steelCyan}0C,transparent 31%),
               radial-gradient(circle at 68% 78%,${SPECTRUM.copper}09,transparent 34%)`,
          backgroundSize: "36px 36px,36px 36px,auto,auto,auto",
          maskImage: "linear-gradient(to bottom,black,transparent 92%)",
          opacity: darkMode ? 0.9 : 0.72,
        },
        "@media (prefers-reduced-motion: reduce)": {
          "&, & *": {
            scrollBehavior: "auto !important",
            transitionDuration: "0.01ms !important",
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
          },
        },
      }}
    >
      <Box className="security-hero"
        sx={{
          p: { xs: 2.25, sm: 2.8, lg: 3.2 },
          borderRadius: 3.6,
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${panelBorder}`,
          background: darkMode
            ? `radial-gradient(100% 170% at 2% -25%,${SPECTRUM.champagne}10 0%,transparent 48%),
               radial-gradient(90% 150% at 100% 5%,${SPECTRUM.steelCyan}0D 0%,transparent 48%),
               radial-gradient(65% 125% at 64% 130%,${SPECTRUM.copper}08 0%,transparent 52%),
               linear-gradient(135deg,#111412 0%,#080A09 60%,#111512 100%)`
            : `radial-gradient(100% 170% at 2% -25%,${SPECTRUM.champagne}22 0%,transparent 48%),
               radial-gradient(90% 150% at 100% 5%,${SPECTRUM.steelCyan}14 0%,transparent 48%),
               radial-gradient(65% 125% at 64% 130%,${SPECTRUM.copper}0D 0%,transparent 52%),
               linear-gradient(135deg,#FFFDF8 0%,#F7F6F1 60%,#F5F8F7 100%)`,
          boxShadow: darkMode
            ? "0 32px 78px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.026)"
            : "0 28px 66px rgba(34,39,36,.065), inset 0 1px 0 rgba(255,255,255,.88)",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: "7%",
            right: "7%",
            height: "1px",
            background: `linear-gradient(90deg,transparent,${SPECTRUM.champagne}72,${SPECTRUM.steelCyan}4A,${SPECTRUM.copper}30,transparent)`,
          },
          "&::after": {
            content: '""',
            position: "absolute",
            width: 360,
            height: 360,
            right: -150,
            top: -235,
            borderRadius: "50%",
            background: `radial-gradient(circle,${SPECTRUM.chrome}13 0%,${SPECTRUM.steelCyan}0C 38%,transparent 70%)`,
            pointerEvents: "none",
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
            gap: 2.5,
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box sx={{ maxWidth: 790 }}>
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.7,
                px: 1.1,
                py: 0.58,
                mb: 1.45,
                borderRadius: 99,
                border: `1px solid ${SPECTRUM.chrome}18`,
                background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.48)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.13)",
              }}
            >
              <SecurityRoundedIcon sx={{ fontSize: 14, color: darkMode ? SPECTRUM.chrome : SPECTRUM.titanium }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 850,
                  letterSpacing: ".12em",
                  fontSize: 9.5,
                  color: darkMode ? SPECTRUM.chrome : SPECTRUM.titanium,
                }}
              >
                NEXUS / TRUST & ACCESS
              </Typography>
            </Box>

            <Typography className="security-title"
              sx={{
                fontSize: { xs: 28, sm: 33, lg: 38 },
                lineHeight: 1.04,
                fontWeight: 930,
                letterSpacing: "-.048em",
                width: "fit-content",
                background: darkMode
                  ? `linear-gradient(108deg,#F2F0EA 0%,${SPECTRUM.chrome} 26%,${SPECTRUM.champagne} 50%,${SPECTRUM.steelCyan} 74%,#EDF0EE 100%)`
                  : `linear-gradient(108deg,#151917 0%,${SPECTRUM.titanium} 26%,${SPECTRUM.brass} 50%,${SPECTRUM.steelCyan} 74%,#151917 100%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Security, with clarity.
            </Typography>

            <Typography variant="body1" sx={{ mt: 1.05, maxWidth: 690, color: "text.secondary", lineHeight: 1.72 }}>
              Your account protection. Your workspace controls. A clear view of what needs attention.
            </Typography>

            <Box sx={{ mt: 1.35, display: "flex", alignItems: "center", gap: 1.1, flexWrap: "wrap" }}>
              <Chip
                size="small"
                icon={<ShieldRoundedIcon sx={{ fontSize: "14px !important" }} />}
                label={telemetryState}
                sx={{
                  height: 27,
                  fontWeight: 800,
                  color:
                    telemetryState === "Telemetry synced"
                      ? SPECTRUM.success
                      : telemetryState === "Partial telemetry"
                      ? SPECTRUM.amber
                      : telemetryState === "Telemetry unavailable"
                      ? SPECTRUM.critical
                      : SPECTRUM.titanium,
                  background: "rgba(255,255,255,.025)",
                  border: `1px solid ${panelBorder}`,
                }}
              />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {formatSync(lastSyncedAt)}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.8,
              width: { xs: "100%", md: "auto" },
              flexWrap: "wrap",
            }}
          >
            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 250 } }} disabled={workspaceLoading || !workspaces.length}>
              <InputLabel>Workspace</InputLabel>
              <Select
                value={workspaceId}
                label="Workspace"
                onChange={(event) => dirty ? setPendingWorkspace(event.target.value) : setWorkspaceId(event.target.value)}
                disabled={saving || revokingSessions || exporting}
                sx={{
                  borderRadius: 2.2,
                  background: darkMode ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.58)",
                  backdropFilter: "blur(12px)",
                  "& fieldset": { borderColor: panelBorder },
                  "&:hover fieldset": { borderColor: `${SPECTRUM.chrome}35 !important` },
                }}
              >
                {workspaces.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name || item.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tooltip title="Refresh security telemetry">
              <span>
                <IconButton
                  aria-label="Refresh security telemetry"
                  disabled={!workspaceId || loading || refreshing}
                  onClick={() => loadSecurity(workspaceId, { silent: true })}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2.2,
                    color: SPECTRUM.steelCyan,
                    border: `1px solid ${panelBorder}`,
                    background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.56)",
                    "&:hover": {
                      borderColor: `${SPECTRUM.steelCyan}45`,
                      background: `${SPECTRUM.steelCyan}09`,
                    },
                  }}
                >
                  <RefreshRoundedIcon
                    sx={{
                      fontSize: 19,
                      animation: refreshing ? "securitySpin 850ms linear infinite" : "none",
                      "@keyframes securitySpin": {
                        "0%": { transform: "rotate(0deg)" },
                        "100%": { transform: "rotate(360deg)" },
                      },
                    }}
                  />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {workspaceError && (
        <Alert severity="error" sx={{ mt: 2, borderRadius: 2.5 }}>
          {workspaceError}
        </Alert>
      )}

      {!workspace && !workspaceLoading && !workspaceError && (
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2.5 }}>
          Create or join a workspace to inspect workspace-scoped security controls.
        </Alert>
      )}

      <Box
        sx={{
          mt: 2,
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4,minmax(0,1fr))" },
          gap: 1.4,
        }}
      >
        <SpectralMetric
          darkMode={darkMode}
          accent={user?.emailVerified ? SPECTRUM.emerald : SPECTRUM.amber}
          icon={<VerifiedUserRoundedIcon />}
          label="Account email"
          value={user?.emailVerified ? "Verified" : "Unverified"}
          caption="Authenticated account state"
          loading={false}
        />
        <SpectralMetric
          darkMode={darkMode}
          accent={SPECTRUM.amber}
          icon={<TimelineRoundedIcon />}
          label="Security signals loaded"
          value={securityError ? "—" : securityEvents.length}
          caption={securityError ? "Security stream unavailable" : severeLoadedCount ? `${severeLoadedCount} high / critical in loaded window` : "Latest 100 maximum"}
          loading={loading || workspaceLoading}
        />
        <SpectralMetric
          darkMode={darkMode}
          accent={SPECTRUM.copper}
          icon={<ArticleRoundedIcon />}
          label="Audit records loaded"
          value={auditFeatureUnavailable ? "Plan gated" : auditError ? "—" : auditEvents.length}
          caption={auditFeatureUnavailable ? "Requires advanced security" : auditError ? "Audit stream unavailable" : "Latest 100 maximum"}
          loading={loading || workspaceLoading}
        />
        <SpectralMetric
          darkMode={darkMode}
          accent={SPECTRUM.olive}
          icon={<AdminPanelSettingsRoundedIcon />}
          label="Audit retention"
          value={policyFeatureUnavailable ? "Plan gated" : policyError ? "—" : policy?.auditLogRetentionDays ? `${policy.auditLogRetentionDays}d` : "—"}
          caption={policyFeatureUnavailable ? "Requires advanced security" : policyError ? "Policy unavailable" : "Server policy value"}
          loading={loading || workspaceLoading}
        />
      </Box>

      <SectionShell darkMode={darkMode} accent={currentTabAccent} sx={{ mt: 2, overflow: "hidden" }}>
        <Box
          sx={{
            px: { xs: 0.8, sm: 1.4 },
            borderBottom: `1px solid ${subtleBorder}`,
            background: darkMode ? "rgba(255,255,255,.012)" : "rgba(250,250,247,.48)",
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Security command center sections"
            sx={{
              minHeight: 54,
              "& .MuiTabs-indicator": {
                height: 2.5,
                borderRadius: 99,
                background: `linear-gradient(90deg,${currentTabAccent},${SPECTRUM.chrome})`,
                boxShadow: `0 0 16px ${currentTabAccent}40`,
                transition: "background 220ms ease, box-shadow 220ms ease",
              },
              "& .MuiTab-root": {
                minHeight: 54,
                minWidth: 120,
                textTransform: "none",
                fontSize: 12,
                fontWeight: 720,
                color: "text.secondary",
                gap: 0.7,
                "& svg": { fontSize: 17 },
              },
              "& .Mui-selected": { color: `${currentTabAccent} !important` },
            }}
          >
            {TAB_META.map((item) => (
              <Tab key={item.label} icon={item.icon} iconPosition="start" label={item.label} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ p: { xs: 1.6, sm: 2.2, lg: 2.6 }, minHeight: 470 }}>
          {tab === 0 && (workspaceLoading || loading) && <Skeleton variant="rounded" height={320} />}
          {tab === 0 && !workspaceLoading && !loading && !workspaceId && <EmptyState icon={<ShieldRoundedIcon />} title={workspaceError ? "Workspace access unavailable" : "Choose a workspace"} description={workspaceError || "Create or join a workspace to view its security controls."} accent={SPECTRUM.coolSteel} />}
          {tab === 0 && !workspaceLoading && !loading && Boolean(workspaceId) && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.08fr .92fr" }, gap: 1.5 }}>
              <SectionShell darkMode={darkMode} accent={SPECTRUM.emerald} sx={{ p: { xs: 1.8, sm: 2.15 } }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1.6 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Account protection</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Verification and sign-in methods for your personal account.
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label="Your account"
                    sx={{
                      height: 25,
                      fontSize: 10,
                      fontWeight: 800,
                      color: SPECTRUM.emerald,
                      background: `${SPECTRUM.emerald}0E`,
                      border: `1px solid ${SPECTRUM.emerald}1B`,
                    }}
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.85 }}>
                  {identityChecks.map((check) => (
                    <StatusLine
                      key={check.label}
                      icon={check.icon}
                      title={check.label}
                      description={check.description}
                      state={check.optional ? (check.done ? "Linked" : "Optional") : check.label === "Verified phone" && (profileLoading || profileError) ? (profileLoading ? "Checking" : "Unavailable") : check.done ? "Verified" : "Needs attention"}
                      accent={check.done ? check.accent : SPECTRUM.titanium}
                      darkMode={darkMode}
                    />
                  ))}
                </Box>
                <Button href="/account?section=profile" sx={{ mt: 1.5 }}>Manage account verification →</Button>
              </SectionShell>

              <SectionShell darkMode={darkMode} accent={SPECTRUM.amber} sx={{ p: { xs: 1.8, sm: 2.15 } }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Latest security signal</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Most recent event returned by the workspace security stream.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      display: "grid",
                      placeItems: "center",
                      color: SPECTRUM.amber,
                      background: `${SPECTRUM.amber}0E`,
                      border: `1px solid ${SPECTRUM.amber}1A`,
                    }}
                  >
                    <WarningAmberRoundedIcon sx={{ fontSize: 18 }} />
                  </Box>
                </Box>

                {loading ? (
                  <Skeleton variant="rounded" height={126} sx={{ borderRadius: 2.4 }} />
                ) : securityError ? (
                  <Alert severity="warning" sx={{ borderRadius: 2.2 }}>
                    {securityError.message || "Security events are unavailable."}
                  </Alert>
                ) : latestSecurityEvent ? (
                  <Box
                    sx={{
                      p: 1.6,
                      borderRadius: 2.4,
                      background: `${SEVERITY_TONE[String(latestSecurityEvent.severity || "low").toLowerCase()] || SPECTRUM.coolSteel}08`,
                      border: `1px solid ${SEVERITY_TONE[String(latestSecurityEvent.severity || "low").toLowerCase()] || SPECTRUM.coolSteel}18`,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {latestSecurityEvent.message || latestSecurityEvent.type || "Security event"}
                      </Typography>
                      <Chip
                        size="small"
                        label={String(latestSecurityEvent.severity || "low")}
                        sx={{
                          height: 22,
                          fontSize: 9.5,
                          fontWeight: 800,
                          color: SEVERITY_TONE[String(latestSecurityEvent.severity || "low").toLowerCase()] || SPECTRUM.coolSteel,
                          background: "rgba(255,255,255,.02)",
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ mt: 0.7, display: "block", color: "text.secondary" }}>
                      {formatDateTime(latestSecurityEvent.createdAt || latestSecurityEvent.ts)}
                    </Typography>
                  </Box>
                ) : (
                  <EmptyState
                    icon={<ShieldRoundedIcon />}
                    title="No security events recorded"
                    description="Security events will appear here as activity is recorded for this workspace."
                    accent={SPECTRUM.amber}
                  />
                )}
              </SectionShell>

              <SectionShell darkMode={darkMode} accent={SPECTRUM.olive} sx={{ p: { xs: 1.8, sm: 2.15 }, gridColumn: { lg: "1 / -1" } }}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,minmax(0,1fr))" }, gap: 1 }}>
                  <StatusLine
                    icon={<DomainVerificationRoundedIcon />}
                    title="Invitation domain policy"
                    description={
                      policyFeatureUnavailable
                        ? "Advanced security is not included in this workspace plan."
                        : policyError
                        ? "Policy state could not be loaded."
                        : policy?.allowedInviteDomains?.length
                        ? `${policy.allowedInviteDomains.length} approved domain${policy.allowedInviteDomains.length === 1 ? "" : "s"}.`
                        : "No invitation-domain restriction configured."
                    }
                    state={policyFeatureUnavailable ? "Plan gated" : policyError ? "Unavailable" : policy?.allowedInviteDomains?.length ? "Restricted" : "Open"}
                    accent={SPECTRUM.olive}
                    darkMode={darkMode}
                  />
                  <StatusLine
                    icon={<ArticleRoundedIcon />}
                    title="Audit visibility"
                    description={
                      auditFeatureUnavailable
                        ? "Audit access requires advanced security."
                        : auditError
                        ? "Audit records could not be loaded."
                        : `${auditEvents.length} record${auditEvents.length === 1 ? "" : "s"} loaded from the latest window.`
                    }
                    state={auditFeatureUnavailable ? "Plan gated" : auditError ? "Unavailable" : "Available"}
                    accent={SPECTRUM.copper}
                    darkMode={darkMode}
                  />
                  <StatusLine
                    icon={<LockRoundedIcon />}
                    title="Server enforcement"
                    description="Security-policy changes use authenticated server routes and recent-auth checks."
                    state="Server-side"
                    accent={SPECTRUM.steelCyan}
                    darkMode={darkMode}
                  />
                </Box>
              </SectionShell>
            </Box>
          )}

          {tab === 1 && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: { xs: "stretch", md: "center" },
                  justifyContent: "space-between",
                  gap: 1.2,
                  mb: 1.7,
                  flexDirection: { xs: "column", md: "row" },
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Threat activity</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Security events from this workspace, ordered by most recent.
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                  <TextField
                    size="small"
                    value={eventQuery}
                    onChange={(event) => setEventQuery(event.target.value)}
                    placeholder="Search events"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon sx={{ fontSize: 17, color: "text.secondary" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      minWidth: { xs: "100%", sm: 230 },
                      "& .MuiOutlinedInput-root": { height: 38, borderRadius: 2, background: innerBg },
                      "& fieldset": { borderColor: subtleBorder },
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Severity</InputLabel>
                    <Select value={severityFilter} label="Severity" onChange={(event) => setSeverityFilter(event.target.value)} sx={{ height: 38, borderRadius: 2 }}>
                      {['all', 'low', 'medium', 'warning', 'high', 'critical', 'success'].map((severity) => (
                        <MenuItem key={severity} value={severity}>
                          {severity === "all" ? "All severities" : severity[0].toUpperCase() + severity.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <TextField label="Events from date" type="date" size="small" InputLabelProps={{ shrink: true }} value={eventFrom} onChange={event => setEventFrom(event.target.value)} />
                <TextField label="Events to date" type="date" size="small" InputLabelProps={{ shrink: true }} value={eventTo} onChange={event => setEventTo(event.target.value)} />
              </Box>
              {loading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                  {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} variant="rounded" height={70} sx={{ borderRadius: 2.2 }} />
                  ))}
                </Box>
              ) : securityError ? (
                <Alert severity="error" sx={{ borderRadius: 2.3 }}>
                  {securityError.message || "Unable to load security events."}
                </Alert>
              ) : filteredSecurityEvents.length === 0 ? (
                <EmptyState
                  icon={<SecurityRoundedIcon />}
                  title={securityEvents.length ? "No events match your filters" : "No security events recorded"}
                  description={securityEvents.length ? "Adjust the search or severity filter." : "Security events will appear here as activity is recorded for this workspace."}
                  accent={SPECTRUM.amber}
                />
              ) : (
                <Box sx={{ position: "relative" }}>
                  <Box
                    sx={{
                      position: "absolute",
                      left: 20,
                      top: 22,
                      bottom: 22,
                      width: "1px",
                      pointerEvents: "none",
                      background: `linear-gradient(${SPECTRUM.amber}44,${SPECTRUM.critical}24,transparent)`,
                    }}
                  />
                  {filteredSecurityEvents.slice(eventPage * 20, (eventPage + 1) * 20).map((event, index) => {
                    const severity = String(event.severity || "low").toLowerCase();
                    const tone = SEVERITY_TONE[severity] || SPECTRUM.coolSteel;
                    const createdAt = event.createdAt || event.ts || null;
                    return (
                      <Box
                        key={event.id || `${event.type || "event"}-${createdAt || index}`}
                        sx={{
                          position: "relative",
                          display: "flex",
                          gap: 1.35,
                          py: 1.05,
                          px: 0.7,
                          borderRadius: 2.3,
                          transition: "background 160ms ease, transform 160ms cubic-bezier(.22,1,.36,1)",
                          "&:hover": { background: `${tone}06`, transform: "translateX(2px)" },
                        }}
                      >
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            mt: 0.1,
                            borderRadius: "50%",
                            flexShrink: 0,
                            zIndex: 1,
                            display: "grid",
                            placeItems: "center",
                            color: tone,
                            background: darkMode ? SPECTRUM.carbon : SPECTRUM.porcelain,
                            border: `1px solid ${tone}28`,
                            boxShadow: index === 0 ? `0 0 0 4px ${tone}08,0 0 20px ${tone}18` : "none",
                          }}
                        >
                          {severity === "critical" || severity === "high" ? (
                            <ErrorOutlineRoundedIcon sx={{ fontSize: 18 }} />
                          ) : severity === "success" ? (
                            <TaskAltRoundedIcon sx={{ fontSize: 18 }} />
                          ) : (
                            <WarningAmberRoundedIcon sx={{ fontSize: 17 }} />
                          )}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0, pt: 0.15 }}>
                          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 790, lineHeight: 1.45 }}>
                                {event.message || event.type || "Security event"}
                              </Typography>
                              <Typography variant="caption" sx={{ mt: 0.28, display: "block", color: "text.secondary" }}>
                                {formatDateTime(createdAt)}
                              </Typography>
                            </Box>
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                              <Chip
                                size="small"
                                label={severity}
                                sx={{ height: 21, fontSize: 9, fontWeight: 800, color: tone, background: `${tone}0D`, border: `1px solid ${tone}18` }}
                              />
                              {event.type && (
                                <Chip size="small" label={event.type} sx={{ height: 21, fontSize: 9, color: "text.secondary", background: innerBg }} />
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
              {filteredSecurityEvents.length > 0 && <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mt: 2, flexWrap: "wrap" }}><Typography variant="caption" color="text.secondary">Page {eventPage + 1} · {filteredSecurityEvents.length} matching records in the latest {securityEvents.length} loaded</Typography><Box><Button disabled={!eventPage} onClick={() => setEventPage(page => page - 1)}>Previous</Button><Button disabled={(eventPage + 1) * 20 >= filteredSecurityEvents.length} onClick={() => setEventPage(page => page + 1)}>Next</Button></Box></Box>}
            </Box>
          )}

          {tab === 2 && (
            <Box>
              {policyFeatureUnavailable ? (
                <SectionShell darkMode={darkMode} accent={SPECTRUM.olive} sx={{ p: { xs: 2, sm: 2.4 } }}>
                  <Alert severity="info" sx={{ borderRadius: 2.3, background: "transparent" }}>
                    Advanced security controls are available on Pro and Enterprise plans. Nexus is not showing inactive policy controls as if they were enabled.
                  </Alert>
                </SectionShell>
              ) : policyError && !policy ? (
                <Alert severity="error" sx={{ borderRadius: 2.3 }}>
                  {policyError.message || "Unable to load the workspace security policy."}
                </Alert>
              ) : loading && !policy ? (
                <Skeleton variant="rounded" height={310} sx={{ borderRadius: 3 }} />
              ) : !policy ? (
                <EmptyState icon={<PolicyRoundedIcon />} title="Policy unavailable" description="The workspace security policy could not be resolved." accent={SPECTRUM.olive} />
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.08fr .92fr" }, gap: 1.5 }}>
                  <SectionShell darkMode={darkMode} accent={SPECTRUM.olive} sx={{ p: { xs: 1.8, sm: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1.8 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Workspace access policy</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Confirm your identity before changing workspace access or retention.
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={canManage ? "Editable" : "Read only"}
                        sx={{
                          height: 25,
                          fontSize: 10,
                          fontWeight: 800,
                          color: canManage ? SPECTRUM.olive : SPECTRUM.titanium,
                          background: canManage ? `${SPECTRUM.olive}0D` : innerBg,
                          border: `1px solid ${canManage ? `${SPECTRUM.olive}1C` : subtleBorder}`,
                        }}
                      />
                    </Box>

                    <TextField
                      fullWidth
                      label="Approved invitation domains"
                      value={domains}
                      onChange={event => { setDomains(event.target.value); setDirty(true); }}
                      disabled={!canManage || saving}
                      helperText="Optional. Example: example.com, acme.co.in. Leave blank to allow all domains."
                    />

                    <Box sx={{ mt: 1.7, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,minmax(0,1fr))" }, gap: 1.2 }}>
                      {[
                        ["auditLogRetentionDays", "Audit retention", SPECTRUM.copper],
                        ["apiLogRetentionDays", "API log retention", SPECTRUM.steelCyan],
                        ["webhookDeliveryRetentionDays", "Webhook retention", SPECTRUM.warmGold],
                      ].map(([field, label, accent]) => (
                        <FormControl key={field} size="small" disabled={!canManage || saving}>
                          <InputLabel>{label}</InputLabel>
                          <Select
                            value={policy[field] || 90}
                            label={label}
                            onChange={(event) => editPolicy((current) => ({ ...current, [field]: Number(event.target.value) }))}
                            sx={{
                              borderRadius: 2.1,
                              background: `${accent}05`,
                              "& fieldset": { borderColor: `${accent}1B` },
                            }}
                          >
                            {RETENTION_OPTIONS.map((days) => (
                              <MenuItem key={days} value={days}>
                                {days} days
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ))}
                    </Box>

                    {dirty && <Alert severity="info" sx={{ mt: 2 }}>Unsaved changes. Background refresh will not replace your draft.</Alert>}
                    {reauth === "policy" && <WorkspaceReauthentication user={user} workspaceId={workspaceId} returnPath="/security" description="Your draft is preserved. After verification, review it and select Save again." onVerified={() => { setReauth(""); toast.success("Identity verified. Review and save your draft."); }} />}
                    {canManage && (
                      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}>
                        <Button disabled={!dirty || saving} onClick={discardDraft}>Discard changes</Button>
                        <Button
                          variant="contained"
                          onClick={() => savePolicy()}
                          disabled={saving || !dirty || reauth === "policy"}
                          sx={{
                            minHeight: 40,
                            px: 2.2,
                            borderRadius: 2.15,
                            fontWeight: 800,
                            color: darkMode ? "#10130F" : "#161811",
                            background: `linear-gradient(105deg,${SPECTRUM.olive},${SPECTRUM.warmGold})`,
                            boxShadow: `0 12px 28px ${SPECTRUM.olive}22, inset 0 1px 0 rgba(255,255,255,.25)`,
                            "&:hover": {
                              background: `linear-gradient(105deg,#9DA76B,#D0B170)`,
                              transform: "translateY(-1px)",
                              boxShadow: `0 16px 34px ${SPECTRUM.olive}2A`,
                            },
                          }}
                        >
                          {saving ? "Saving…" : "Save security policy"}
                        </Button>
                      </Box>
                    )}
                  </SectionShell>

                  <SectionShell darkMode={darkMode} accent={SPECTRUM.warmGold} sx={{ p: { xs: 1.8, sm: 2.25 } }}>
                    <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Policy interpretation</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25, mb: 1.5 }}>
                      A readable view of the real policy currently loaded from the server.
                    </Typography>

                    <StatusLine
                      icon={<DomainVerificationRoundedIcon />}
                      title="Invitation domains"
                      description={
                        policy.allowedInviteDomains?.length
                          ? policy.allowedInviteDomains.join(", ")
                          : "No domain allow-list is configured."
                      }
                      state={policy.allowedInviteDomains?.length ? "Restricted" : "Open"}
                      accent={SPECTRUM.olive}
                      darkMode={darkMode}
                    />
                    <Box sx={{ height: 0.8 }} />
                    <StatusLine
                      icon={<HistoryRoundedIcon />}
                      title="Audit retention"
                      description={`${policy.auditLogRetentionDays} days retained by the configured policy.`}
                      state={`${policy.auditLogRetentionDays}d`}
                      accent={SPECTRUM.copper}
                      darkMode={darkMode}
                    />
                    <Box sx={{ height: 0.8 }} />
                    <StatusLine
                      icon={<ManageSearchRoundedIcon />}
                      title="API log retention"
                      description={`${policy.apiLogRetentionDays} days retained by the configured policy.`}
                      state={`${policy.apiLogRetentionDays}d`}
                      accent={SPECTRUM.steelCyan}
                      darkMode={darkMode}
                    />
                    <Box sx={{ height: 0.8 }} />
                    <StatusLine
                      icon={<TimelineRoundedIcon />}
                      title="Webhook delivery retention"
                      description={`${policy.webhookDeliveryRetentionDays} days retained by the configured policy.`}
                      state={`${policy.webhookDeliveryRetentionDays}d`}
                      accent={SPECTRUM.warmGold}
                      darkMode={darkMode}
                    />

                    {policy.updatedAt && (
                      <Typography variant="caption" sx={{ mt: 1.35, display: "block", color: "text.secondary" }}>
                        Last policy update: {formatDateTime(policy.updatedAt)}
                      </Typography>
                    )}
                  </SectionShell>
                </Box>
              )}
            </Box>
          )}

          {tab === 3 && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: { xs: "stretch", md: "center" },
                  justifyContent: "space-between",
                  gap: 1.2,
                  mb: 1.7,
                  flexDirection: { xs: "column", md: "row" },
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Audit trail</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Workspace activity, security changes, and API requests in one audit trail.
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                  <TextField
                    size="small"
                    value={auditQuery}
                    onChange={(event) => setAuditQuery(event.target.value)}
                    placeholder="Search audit records"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon sx={{ fontSize: 17, color: "text.secondary" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      minWidth: { xs: "100%", sm: 230 },
                      "& .MuiOutlinedInput-root": { height: 38, borderRadius: 2, background: innerBg },
                      "& fieldset": { borderColor: subtleBorder },
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 118 }}>
                    <InputLabel>Source</InputLabel>
                    <Select value={auditSource} label="Source" onChange={(event) => setAuditSource(event.target.value)} sx={{ height: 38, borderRadius: 2 }}>
                      <MenuItem value="all">All sources</MenuItem>
                      <MenuItem value="security">Security</MenuItem>
                      <MenuItem value="activity">Activity</MenuItem>
                      <MenuItem value="api">API</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadRoundedIcon />}
                    onClick={exportAudit}
                    disabled={exporting || !workspaceId || auditFeatureUnavailable || Boolean(auditError) || !["owner", "admin", "analyst"].includes(String(workspace?.role || "").toLowerCase())}
                    sx={{
                      minHeight: 38,
                      borderRadius: 2,
                      borderColor: `${SPECTRUM.copper}2A`,
                      color: SPECTRUM.copper,
                      background: `${SPECTRUM.copper}05`,
                      "&:hover": { borderColor: `${SPECTRUM.copper}48`, background: `${SPECTRUM.copper}0A` },
                    }}
                  >
                    Export CSV
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                <TextField label="Audit from date" type="date" size="small" InputLabelProps={{ shrink: true }} value={auditFrom} onChange={event => setAuditFrom(event.target.value)} />
                <TextField label="Audit to date" type="date" size="small" InputLabelProps={{ shrink: true }} value={auditTo} onChange={event => setAuditTo(event.target.value)} />
              </Box>
              {auditFeatureUnavailable ? (
                <Alert severity="info" sx={{ borderRadius: 2.3 }}>
                  Audit log access is available on Pro and Enterprise plans.
                </Alert>
              ) : loading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                  {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} variant="rounded" height={72} sx={{ borderRadius: 2.2 }} />
                  ))}
                </Box>
              ) : auditError ? (
                <Alert severity="error" sx={{ borderRadius: 2.3 }}>
                  {auditError.message || "Unable to load audit records."}
                </Alert>
              ) : filteredAuditEvents.length === 0 ? (
                <EmptyState
                  icon={<ArticleRoundedIcon />}
                  title={auditEvents.length ? "No audit records match your filters" : "No audit records yet"}
                  description={auditEvents.length ? "Adjust the audit search or source filter." : "Server-recorded workspace activity, security, and API events will appear here."}
                  accent={SPECTRUM.copper}
                />
              ) : (
                <Box sx={{ borderRadius: 2.7, border: `1px solid ${subtleBorder}`, overflow: "hidden" }}>
                  {filteredAuditEvents.slice(auditPage * 20, (auditPage + 1) * 20).map((event, index) => {
                    const tone = SOURCE_TONE[event.source] || SPECTRUM.titanium;
                    return (
                      <Box
                        key={event.id}
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.8fr) minmax(170px,.7fr) minmax(135px,.45fr)" },
                          gap: { xs: 0.65, md: 1.2 },
                          alignItems: "center",
                          px: 1.45,
                          py: 1.25,
                          borderBottom: index === filteredAuditEvents.length - 1 ? "none" : `1px solid ${subtleBorder}`,
                          transition: "background 150ms ease",
                          "&:hover": { background: `${tone}05` },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.7, minWidth: 0 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: tone, boxShadow: `0 0 12px ${tone}45` }} />
                            <Typography variant="body2" sx={{ fontWeight: 760, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {event.message}
                            </Typography>
                          </Box>
                          <Typography variant="caption" sx={{ mt: 0.3, ml: 1.55, display: "block", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {event.type} · {event.actor}
                            {event.requestId ? ` · ${event.requestId}` : ""}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                          {formatDateTime(event.createdAt)}
                        </Typography>
                        <Chip
                          size="small"
                          label={event.source || "event"}
                          sx={{ justifySelf: { md: "end" }, width: "fit-content", height: 22, fontSize: 9.5, fontWeight: 800, color: tone, background: `${tone}0C`, border: `1px solid ${tone}18` }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}
              {filteredAuditEvents.length > 0 && <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mt: 2, flexWrap: "wrap" }}><Typography variant="caption" color="text.secondary">Page {auditPage + 1} · {filteredAuditEvents.length} matching records in the latest {auditEvents.length} loaded</Typography><Box><Button disabled={!auditPage} onClick={() => setAuditPage(page => page - 1)}>Previous</Button><Button disabled={(auditPage + 1) * 20 >= filteredAuditEvents.length} onClick={() => setAuditPage(page => page + 1)}>Next</Button></Box></Box>}
            </Box>
          )}

          {tab === 4 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.05fr .95fr" }, gap: 1.5 }}>
              <SectionShell darkMode={darkMode} accent={SPECTRUM.steelCyan} sx={{ p: { xs: 1.8, sm: 2.25 } }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>Session protection</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Sign out all devices when you suspect someone else has access to your account.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2.1,
                      display: "grid",
                      placeItems: "center",
                      color: SPECTRUM.steelCyan,
                      background: `${SPECTRUM.steelCyan}0D`,
                      border: `1px solid ${SPECTRUM.steelCyan}1A`,
                    }}
                  >
                    <DevicesRoundedIcon sx={{ fontSize: 18 }} />
                  </Box>
                </Box>

                <Alert
                  severity="info"
                  sx={{
                    borderRadius: 2.2,
                    background: `${SPECTRUM.steelCyan}07`,
                    border: `1px solid ${SPECTRUM.steelCyan}16`,
                    color: "inherit",
                    "& .MuiAlert-icon": { color: SPECTRUM.steelCyan },
                  }}
                >
                  This action signs out all devices as their access tokens expire. Individual device management is not available yet.
                </Alert>

                {revokedAt && (
                  <Alert severity="success" sx={{ mt: 1.2, borderRadius: 2.2 }}>
                    Refresh tokens were revoked at {formatDateTime(revokedAt)}.
                  </Alert>
                )}

                <Box
                  sx={{
                    mt: 1.6,
                    p: 1.55,
                    borderRadius: 2.4,
                    border: `1px solid ${SPECTRUM.steelCyan}18`,
                    background: `${SPECTRUM.steelCyan}05`,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    Revoke all sessions
                  </Typography>
                  <Typography variant="caption" sx={{ mt: 0.35, display: "block", color: "text.secondary", lineHeight: 1.55 }}>
                    Devices you still use will need to sign in again when their current access expires.
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<LogoutRoundedIcon />}
                    onClick={() => setRevokeDialogOpen(true)}
                    sx={{ mt: 1.35, minHeight: 38, borderRadius: 2 }}
                  >
                    Revoke all sessions
                  </Button>
                </Box>
              </SectionShell>

              <SectionShell darkMode={darkMode} accent={SPECTRUM.coolSteel} sx={{ p: { xs: 1.8, sm: 2.25 } }}>
                <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>What is available now</Typography>
                <Typography variant="caption" sx={{ mt: 0.25, mb: 1.4, display: "block", color: "text.secondary" }}>
                  Understand the scope of your account session controls.
                </Typography>
                <StatusLine
                  icon={<VerifiedUserRoundedIcon />}
                  title="Authenticated account"
                  description="This page operates with the current authenticated Nexus account."
                  state="Active"
                  accent={SPECTRUM.emerald}
                  darkMode={darkMode}
                />
                <Box sx={{ height: 0.8 }} />
                <StatusLine
                  icon={<LogoutRoundedIcon />}
                  title="Global session revocation"
                  description="You can revoke sessions across all devices associated with your account."
                  state="Available"
                  accent={SPECTRUM.steelCyan}
                  darkMode={darkMode}
                />
                <Box sx={{ height: 0.8 }} />
                <StatusLine
                  icon={<DevicesRoundedIcon />}
                  title="Device inventory"
                  description="Individual device details and sign-out controls are not available yet."
                  state="Not implemented"
                  accent={SPECTRUM.titanium}
                  darkMode={darkMode}
                />
              </SectionShell>
            </Box>
          )}
        </Box>
      </SectionShell>

      {workspace && (
        <Typography variant="caption" sx={{ mt: 1.5, display: "block", color: "text.secondary", opacity: 0.66 }}>
          Workspace: {workspace.name || workspace.id} · Role: {workspace.role || "unknown"}
        </Typography>
      )}

      <Dialog open={Boolean(pendingWorkspace)} onClose={() => setPendingWorkspace("")}>
        <DialogTitle>Discard unsaved policy changes?</DialogTitle><DialogContent>Your draft has not been saved. Discard it to switch workspaces.</DialogContent>
        <DialogActions><Button onClick={() => setPendingWorkspace("")}>Keep editing</Button><Button onClick={() => { discardDraft(); setWorkspaceId(pendingWorkspace); setPendingWorkspace(""); }}>Discard & switch</Button></DialogActions>
      </Dialog>
      <Dialog open={clearDialog} onClose={() => !saving && setClearDialog(false)}>
        <DialogTitle>Allow invitations from any domain?</DialogTitle><DialogContent>Removing the domain list allows your team to invite any email domain. Existing memberships are unchanged.</DialogContent>
        <DialogActions><Button disabled={saving} onClick={() => setClearDialog(false)}>Keep restrictions</Button><Button disabled={saving} onClick={() => savePolicy(true)}>Allow all domains</Button></DialogActions>
      </Dialog>
      <Dialog
        open={revokeDialogOpen}
        onClose={() => !revokingSessions && setRevokeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3.2,
            border: `1px solid ${SPECTRUM.critical}28`,
            background: darkMode ? SPECTRUM.carbon : SPECTRUM.porcelain,
            backgroundImage: `radial-gradient(circle at 88% 0%,${SPECTRUM.critical}10,transparent 30%)`,
            boxShadow: darkMode ? "0 30px 90px rgba(0,0,0,.58)" : "0 30px 90px rgba(34,39,36,.16)",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900, letterSpacing: "-.02em" }}>Revoke all sessions?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
            You will need to sign in again on devices you use. Existing access tokens may remain valid until they expire.
          </Typography>
          {reauth === "sessions" && <WorkspaceReauthentication user={user} workspaceId={workspaceId} returnPath="/security" description="Verification does not revoke any sessions. Confirm this action again when ready." onVerified={() => { setReauth(""); toast.success("Identity verified. Confirm session revocation when ready."); }} />}
          <Alert severity="warning" sx={{ mt: 1.6, borderRadius: 2.2 }}>
            Devices you still use may need to sign in again.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.6, gap: 0.5 }}>
          <Button onClick={() => setRevokeDialogOpen(false)} disabled={revokingSessions}>
            Cancel
          </Button>
          <Button variant="contained" color="error" startIcon={<LogoutRoundedIcon />} onClick={revokeAllSessions} disabled={revokingSessions || reauth === "sessions"} sx={{ borderRadius: 2.1 }}>
            {revokingSessions ? "Revoking…" : "Revoke all sessions"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
