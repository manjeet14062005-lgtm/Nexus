import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../services/apiClient.js";

export function useOperationWorkspaces(user) {
  const [rows, setRows] = useState([]);
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controller = useRef(null);
  useEffect(() => { setRows([]); setId(""); }, [user?.uid]);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    if (!user) { setLoading(false); return; }
    const next = new AbortController(); controller.current = next;
    setLoading(true); setError("");
    try {
      const result = await apiRequest(user, "/workspaces", { signal: next.signal });
      if (next.signal.aborted) return;
      const list = Array.isArray(result.workspaces) ? result.workspaces : [];
      setRows(list); setId(current => list.some(row => row.id === current) ? current : list[0]?.id || "");
    } catch (err) { if (!next.signal.aborted) setError(err.message || "Unable to load workspaces."); }
    finally { if (!next.signal.aborted) setLoading(false); }
  }, [user]);
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, [refresh]);
  const workspace = useMemo(() => rows.find(row => row.id === id) || null, [rows, id]);
  return { workspaces: rows, workspaceId: id, setWorkspaceId: setId, workspace, loading, error, refresh };
}

// Request cancellation and a context tag prevent late responses from leaking
// old workspace data into the new workspace. Same-context refreshes retain data.
export function useOperationResource(key, loader) {
  const [state, setState] = useState({ key: null, data: null, loading: false, error: "" });
  const controller = useRef(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    if (!key) return;
    const next = new AbortController(); controller.current = next;
    setState(current => ({ key, data: current.key === key ? current.data : null, loading: true, error: "" }));
    try {
      const data = await loader(next.signal);
      if (!next.signal.aborted) setState({ key, data, loading: false, error: "" });
    } catch (err) {
      if (!next.signal.aborted) setState(current => ({ ...current, loading: false, error: err.message || "Unable to load data." }));
    }
  }, [key, loader]);
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, [refresh]);
  return { data: state.key === key ? state.data : null, loading: Boolean(key && (state.key !== key || state.loading)), error: state.key === key ? state.error : "", refresh };
}
