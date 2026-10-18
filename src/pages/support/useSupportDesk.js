import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { apiRequest } from "../../services/apiClient.js";
import { useOperationResource } from "../operations/useOperationsData.js";

export function useSupportDesk({ user, scope, admin = false, enabled = true }) {
  const activeScope = enabled && scope ? scope : "";
  const [opened, setOpened] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const write = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDrafts({}); setOpened(null); }, [user?.uid]);
  const id = opened?.scope === activeScope ? opened.id : "";
  const key = activeScope && id ? activeScope + "/" + id : "";
  const current = useRef(key); current.current = key;
  const query = admin ? "" : "?workspaceId=" + encodeURIComponent(activeScope);
  const listLoader = useCallback(async signal => {
    const result = await apiRequest(user, admin ? "/admin/support/tickets" : "/support/tickets?workspaceId=" + encodeURIComponent(activeScope), { signal });
    if (!Array.isArray(result.tickets)) throw new Error("Ticket list could not be read. Please refresh.");
    return result.tickets;
  }, [user, admin, activeScope]);
  const list = useOperationResource(activeScope, listLoader);
  const detailLoader = useCallback(async signal => {
    const result = await apiRequest(user, "/support/tickets/" + encodeURIComponent(id) + query, { signal });
    if (!result.ticket || result.ticket.id !== id || (!admin && result.ticket.workspaceId !== activeScope)) throw new Error("This conversation could not be loaded.");
    return result.ticket;
  }, [user, id, query, admin, activeScope]);
  const detail = useOperationResource(key, detailLoader);
  useEffect(() => { setActionError(""); }, [key]);
  const reply = drafts[key] || "";
  function setReply(value) { setDrafts(rows => ({ ...rows, [key]: value })); }
  function openTicket(ticketId) {
    if (write.current) return;
    if (ticketId === id) detail.refresh();
    else setOpened({ scope: activeScope, id: ticketId });
  }
  async function mutate(kind, patch) {
    if (!key || !detail.data || detail.loading || detail.error || write.current || !enabled) return false;
    const text = reply.trim();
    if (kind === "reply" && (!text || text.length > 6000 || detail.data.status === "closed")) return false;
    if (kind === "update" && !admin) return false;
    const token = {}; write.current = token;
    setSaving(true); setActionError("");
    let succeeded = false;
    try {
      const path = kind === "update" ? "/admin/support/tickets/" + encodeURIComponent(id) : "/support/tickets/" + encodeURIComponent(id) + (kind === "reply" ? "/replies" : "/close");
      await apiRequest(user, path, { method: kind === "update" ? "PATCH" : "POST", ...(kind === "reply" || kind === "update" ? { body: JSON.stringify(kind === "reply" ? { body: text } : patch) } : {}) });
      succeeded = true;
      if (!alive.current || current.current !== key) return true;
      if (kind === "reply") setDrafts(rows => ({ ...rows, [key]: "" }));
      toast.success(kind === "reply" ? "Reply sent." : kind === "close" ? "Ticket closed." : "Ticket updated.");
      await Promise.all([detail.refresh(), list.refresh()]);
    } catch (error) {
      if (alive.current && current.current === key) setActionError(error.message || "The action could not be completed.");
    } finally {
      if (write.current === token) write.current = null;
      if (alive.current) setSaving(false);
    }
    return succeeded;
  }
  function refresh() { return Promise.all([list.refresh(), detail.refresh()]); }
  return { list, detail, id, reply, setReply, openTicket, saving, actionError, mutate, refresh };
}
