import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import { toast } from "react-hot-toast";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { apiDownload } from "../../services/apiClient.js";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";
import { analyticsCssVars } from "./tokens.js";
import { useAnalyticsData } from "./hooks/useAnalyticsData.js";
import { useAnalyticsAppearance } from "./hooks/useAnalyticsAppearance.js";
import { AnalyticsMotionProvider, useAnalyticsMotion } from "./motion/AnalyticsMotionProvider.jsx";
import { AnalyticsControlBar } from "./components/AnalyticsControlBar.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { ShortcutsSheet } from "./components/ShortcutsSheet.jsx";
import { AnalyticsHero } from "./components/AnalyticsHero.jsx";
import { KpiStrip } from "./components/KpiStrip.jsx";
import { TrendChart } from "./components/TrendChart.jsx";
import { MethodPanel, RiskPanel } from "./components/MethodRiskPanels.jsx";
import { OutcomeBreakdown } from "./components/OutcomeBreakdown.jsx";
import { CalendarHeatmap, QuotaPanel } from "./components/HeatmapQuotaPanels.jsx";
import { RecentRequests } from "./components/RecentRequests.jsx";
import { InsightsStrip } from "./components/InsightsStrip.jsx";
import { AnalyticsError, AnalyticsSkeleton, EmptyDataState, EmptyWorkspaceState } from "./components/AnalyticsStates.jsx";
import { finiteNumber } from "./utils.js";

function SourceNotice({ children, tone = "info" }) {
  const warning = tone === "warning";
  const color = warning ? "var(--an-warning)" : "var(--an-primary-fg)";
  const Icon = warning ? WarningAmberRoundedIcon : InfoOutlinedIcon;
  return (
    <Box sx={{ p: 1.2, borderRadius: 2, display: "flex", alignItems: "flex-start", gap: .8, border: `1px solid color-mix(in oklch, ${color} 17%, transparent)`, background: `color-mix(in oklch, ${color} 5%, var(--an-surface))` }}>
      <Icon sx={{ mt: .05, fontSize: 17, color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: "var(--an-text-2)", lineHeight: 1.55 }}>{children}</Typography>
    </Box>
  );
}

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase?.();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

function AnalyticsPageBody({ user, darkMode = false }) {
  const navigate = useNavigate();
  const data = useAnalyticsData(user);
  const { accent, setAccent } = useAnalyticsAppearance();
  const { level, ambientEnabled, performanceNotice, dismissPerformanceNotice } = useAnalyticsMotion();
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportState, setExportState] = useState("idle");
  const [activeDay, setActiveDay] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);

  const canExport = hasWorkspacePermission(data.activeWorkspace?.role, "reports.export");

  const handleExport = useCallback(async () => {
    if (!data.activeWorkspace?.id || !canExport || exportState === "loading") return;
    setExportState("loading");
    try {
      const query = new URLSearchParams({ range: String(data.range), environment: data.environment }).toString();
      const blob = await apiDownload(user, `/workspaces/${encodeURIComponent(data.activeWorkspace.id)}/reports/verification.csv?${query}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexus-verification-report-${data.environment}-${data.range}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportState("success");
      window.setTimeout(() => setExportState("idle"), 1400);
    } catch (exportError) {
      setExportState("idle");
      toast.error(exportError?.message || "Unable to export this analytics report.");
    }
  }, [canExport, data.activeWorkspace, data.environment, data.range, exportState, user]);

  const analyticsContextKey = `${data.activeWorkspace?.id || ""}|${data.analytics?.range?.start || ""}|${data.analytics?.range?.end || ""}|${data.analytics?.environment || ""}`;
  useEffect(() => {
    const rows = Array.isArray(data.analytics?.series) ? data.analytics.series : [];
    setSelectedRange(rows.length ? { start: 0, end: rows.length - 1 } : null);
    setActiveDay(rows.length ? rows[rows.length - 1]?.day || null : null);
  }, [analyticsContextKey, data.analytics?.series]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
        return;
      }
      if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const rangeKeys = { "1": 7, "2": 30, "3": 90, "4": 365 };
      if (rangeKeys[key]) {
        event.preventDefault();
        data.setRange(rangeKeys[key]);
      } else if (key === "r") {
        event.preventDefault();
        data.refresh();
      } else if (key === "e" && canExport) {
        event.preventDefault();
        handleExport();
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canExport, data, handleExport]);

  if (!user) return <Navigate to="/" replace />;

  const hasData = Boolean(data.analytics);
  const noActivity = hasData && finiteNumber(data.analytics?.totals?.requests, 0) === 0;

  return (
    <Box
      data-analytics-page
      data-motion-level={level}
      sx={{
        ...analyticsCssVars(darkMode, accent),
        minHeight: "100%",
        width: "100%",
        maxWidth: "100%",
        overflowX: "clip",
        p: { xs: 1.25, sm: 2, lg: 2.6 },
        color: "var(--an-text)",
        background: "var(--an-page)",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        isolation: "isolate",
        transition: level === "off" ? "none" : "background 250ms ease,color 250ms ease",
        "& *": { boxSizing: "border-box" },
        "& button, & input, & textarea, & select": { fontFamily: "inherit" },
        "& [data-tabular]": { fontVariantNumeric: "tabular-nums slashed-zero" },
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          zIndex: -3,
          pointerEvents: "none",
          opacity: darkMode ? .94 : .8,
          background: "radial-gradient(44% 40% at 10% 10%,color-mix(in oklch,var(--an-primary) 9%,transparent),transparent 72%),radial-gradient(42% 40% at 88% 14%,color-mix(in oklch,var(--an-aurora) 8%,transparent),transparent 70%),radial-gradient(34% 38% at 68% 84%,color-mix(in oklch,var(--an-danger) 5%,transparent),transparent 75%)",
          animation: ambientEnabled ? "analyticsAuroraDrift 18s ease-in-out infinite alternate" : "none",
          transform: "translate3d(0,0,0)",
        },
        "&::after": {
          content: '""',
          position: "fixed",
          inset: 0,
          zIndex: -2,
          pointerEvents: "none",
          backgroundImage: "var(--an-grain)",
          opacity: .018,
          mixBlendMode: darkMode ? "screen" : "multiply",
        },
        "@keyframes analyticsAuroraDrift": { "0%": { transform: "translate3d(-1%,0,0) scale(1)" }, "100%": { transform: "translate3d(1.5%,-1%,0) scale(1.03)" } },
        "@keyframes analyticsHeroShimmer": { "0%,78%": { transform: "translateX(-85%) skewX(-12deg)", opacity: 0 }, "82%": { opacity: 1 }, "92%,100%": { transform: "translateX(85%) skewX(-12deg)", opacity: 0 } },
        "@keyframes analyticsSkeletonShimmer": { from: { backgroundPosition: "160% 0" }, to: { backgroundPosition: "-80% 0" } },
        "@keyframes analyticsEarnedSweep": { from: { transform: "translateX(-130%) skewX(-20deg)" }, to: { transform: "translateX(150%) skewX(-20deg)" } },
        "@media (prefers-reduced-motion: reduce)": { "&, & *": { scrollBehavior: "auto !important" } },
        "@media (prefers-reduced-transparency: reduce)": { "&::before, &::after": { opacity: 0 } },
        "@media print": {
          p: 0,
          background: "#fff !important",
          color: "#0B1020 !important",
          "&::before, &::after": { display: "none" },
          "& nav[aria-label='Analytics controls']": { display: "none !important" },
          "& button": { display: "none !important" },
          "& section, & article": { breakInside: "avoid", boxShadow: "none !important", background: "#fff !important", borderColor: "#D9DDE8 !important" },
        },
      }}
    >
      <Box sx={{ maxWidth: 1580, mx: "auto" }}>
        <Box sx={{ mb: 1.7, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box><Typography sx={{ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 910, letterSpacing: "-.045em", color: "var(--an-text)" }}>Analytics</Typography><Typography variant="body2" sx={{ mt: .3, color: "var(--an-text-3)" }}>Verification performance, risk, usage, and request detail from your workspace.</Typography></Box>
        </Box>

        {performanceNotice && (
          <Box role="status" sx={{ mb: 1.1, px: 1.2, py: .9, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, border: "1px solid color-mix(in oklch,var(--an-warning) 20%,transparent)", background: "var(--an-semantic-warning-bg)" }}>
            <Typography variant="caption" sx={{ color: "var(--an-text-2)", fontWeight: 720 }}>Smooth mode enabled for better performance. Analytics motion has been reduced automatically.</Typography>
            <Button size="small" onClick={dismissPerformanceNotice} startIcon={<CloseRoundedIcon />} sx={{ minHeight: 36, color: "var(--an-text-2)", textTransform: "none" }}>Dismiss</Button>
          </Box>
        )}

        {data.workspaceLoading ? (
          <AnalyticsSkeleton />
        ) : data.workspaceError ? (
          <AnalyticsError title="We couldn’t load your workspaces." message={data.workspaceError} onRetry={data.retryWorkspaces} />
        ) : data.workspaces.length === 0 ? (
          <EmptyWorkspaceState onCreateWorkspace={() => navigate("/workspace")} />
        ) : (
          <>
            <AnalyticsControlBar
              workspaces={data.workspaces}
              workspaceId={data.workspaceId}
              onWorkspace={data.setWorkspaceId}
              range={data.range}
              onRange={data.setRange}
              environment={data.environment}
              onEnvironment={data.setEnvironment}
              refreshing={data.refreshing}
              updatedAt={data.updatedAt}
              canExport={canExport}
              exportState={exportState}
              onRefresh={data.refresh}
              onExport={handleExport}
              onOpenCommands={() => setCommandOpen(true)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              accent={accent}
              onAccent={setAccent}
            />

            <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} workspaces={data.workspaces} range={data.range} environment={data.environment} canExport={canExport} onWorkspace={data.setWorkspaceId} onRange={data.setRange} onEnvironment={data.setEnvironment} onRefresh={data.refresh} onExport={handleExport} />
            <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

            {data.initialLoading && !hasData ? (
              <AnalyticsSkeleton />
            ) : !hasData && data.error ? (
              <AnalyticsError message={data.error} onRetry={data.refresh} />
            ) : noActivity ? (
              <Box sx={{ display: "grid", gap: 1 }}>{data.error && <AnalyticsError title="We couldn’t refresh analytics." message={data.error} onRetry={data.refresh} compact />}<EmptyDataState onOpenDeveloper={() => navigate("/developer")} onRefresh={data.refresh} /></Box>
            ) : hasData ? (
              <Box sx={{ display: "grid", gap: 1.25 }}>
                {data.error && <AnalyticsError title="We couldn’t refresh analytics." message={data.error} onRetry={data.refresh} compact />}
                {data.analytics?.analyticsSource === "legacy-detail-fallback" && <SourceNotice tone="warning">This response is using the legacy detail fallback source. Values remain server-derived, but the daily-rollup source was not used for this selection.</SourceNotice>}
                {data.analytics?.detailTruncated && <SourceNotice>Detail-based breakdowns are capped at 5,000 rows for this response. Aggregate totals continue to come from the server’s daily aggregates, so detail-based distributions may not represent every request.</SourceNotice>}

                <AnalyticsHero analytics={data.analytics} refreshing={data.refreshing} showingStaleSelection={data.showingStaleSelection} />
                <KpiStrip analytics={data.analytics} selectedRange={selectedRange} activeDay={activeDay} />
                <InsightsStrip analytics={data.analytics} />
                <TrendChart series={data.analytics?.series || []} activeDay={activeDay} onActiveDay={setActiveDay} selectedRange={selectedRange} onSelectedRange={setSelectedRange} />

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,.9fr) minmax(0,1.1fr)" }, gap: 1.25, alignItems: "stretch" }}><MethodPanel totals={data.analytics?.totals || {}} /><RiskPanel analytics={data.analytics} /></Box>
                <OutcomeBreakdown totals={data.analytics?.totals || {}} />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.28fr) minmax(320px,.72fr)" }, gap: 1.25, alignItems: "stretch" }}><CalendarHeatmap series={data.analytics?.series || []} activeDay={activeDay} onActiveDay={setActiveDay} /><QuotaPanel usage={data.analytics?.usage} plan={data.analytics?.plan} /></Box>
                <RecentRequests requests={data.analytics?.recentRequests || []} activeDay={activeDay} onActiveDay={setActiveDay} />
              </Box>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );
}

export function AnalyticsPage(props) {
  return <AnalyticsMotionProvider><AnalyticsPageBody {...props} /></AnalyticsMotionProvider>;
}
