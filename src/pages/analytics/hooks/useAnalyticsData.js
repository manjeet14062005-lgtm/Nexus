import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../../services/apiClient.js";

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

export function useAnalyticsData(user) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [range, setRange] = useState(30);
  const [environment, setEnvironment] = useState("all");
  const [analytics, setAnalytics] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadedContext, setLoadedContext] = useState(null);
  const analyticsRef = useRef(null);
  const requestIdRef = useRef(0);
  const analyticsControllerRef = useRef(null);
  const workspaceControllerRef = useRef(null);

  useEffect(() => {
    analyticsRef.current = analytics;
  }, [analytics]);

  const loadWorkspaces = useCallback(async () => {
    if (!user) return [];
    workspaceControllerRef.current?.abort();
    const controller = new AbortController();
    workspaceControllerRef.current = controller;
    setWorkspaceLoading(true);
    setWorkspaceError("");
    try {
      const result = await apiRequest(user, "/workspaces", { signal: controller.signal });
      if (controller.signal.aborted) return [];
      const rows = Array.isArray(result?.workspaces) ? result.workspaces : [];
      setWorkspaces(rows);
      setWorkspaceId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || "";
      });
      return rows;
    } catch (loadError) {
      if (isAbortError(loadError) || controller.signal.aborted) return [];
      const message = loadError?.message || "Unable to load workspaces.";
      setWorkspaceError(message);
      setWorkspaces([]);
      setWorkspaceId("");
      return [];
    } finally {
      if (workspaceControllerRef.current === controller) {
        setWorkspaceLoading(false);
        workspaceControllerRef.current = null;
      }
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user || !workspaceId) {
      analyticsControllerRef.current?.abort();
      setAnalytics(null);
      analyticsRef.current = null;
      setError("");
      setInitialLoading(false);
      setRefreshing(false);
      setLoadedContext(null);
      return null;
    }

    analyticsControllerRef.current?.abort();
    const controller = new AbortController();
    analyticsControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isFirstLoad = !analyticsRef.current;
    if (isFirstLoad) setInitialLoading(true);
    else setRefreshing(true);
    setError("");

    const context = { workspaceId, range, environment };
    try {
      const query = new URLSearchParams({ range: String(range), environment }).toString();
      const result = await apiRequest(
        user,
        `/workspaces/${encodeURIComponent(workspaceId)}/analytics?${query}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted || requestId !== requestIdRef.current) return null;
      const next = result?.analytics || null;
      setAnalytics(next);
      analyticsRef.current = next;
      setLoadedContext(context);
      setUpdatedAt(new Date());
      setError("");
      return next;
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current || isAbortError(loadError)) return null;
      setError(loadError?.message || "Unable to load analytics for this workspace.");
      return null;
    } finally {
      if (requestId === requestIdRef.current && analyticsControllerRef.current === controller) {
        setInitialLoading(false);
        setRefreshing(false);
        analyticsControllerRef.current = null;
      }
    }
  }, [environment, range, user, workspaceId]);

  useEffect(() => {
    loadWorkspaces();
    return () => workspaceControllerRef.current?.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    loadAnalytics();
    return () => analyticsControllerRef.current?.abort();
  }, [loadAnalytics, workspaceId]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) || null,
    [workspaceId, workspaces]
  );

  const showingStaleSelection = Boolean(
    analytics && loadedContext && (
      loadedContext.workspaceId !== workspaceId ||
      loadedContext.range !== range ||
      loadedContext.environment !== environment
    )
  );

  return {
    workspaces,
    activeWorkspace,
    workspaceId,
    setWorkspaceId,
    workspaceLoading,
    workspaceError,
    retryWorkspaces: loadWorkspaces,
    range,
    setRange,
    environment,
    setEnvironment,
    analytics,
    initialLoading,
    refreshing,
    error,
    updatedAt,
    refresh: loadAnalytics,
    showingStaleSelection,
  };
}
