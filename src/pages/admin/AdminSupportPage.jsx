import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Container, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import { useSupportDesk } from "../support/useSupportDesk.js";
import { TicketConversation, TicketList } from "../support/SupportUI.jsx";
import { CATEGORIES, PRIORITIES, filterTickets, isActive, needsNexus } from "../support/ticketModel.js";
import "../support/support.css";

export function AdminSupportPage({ user, userRole, darkMode }) {
  const isAdmin = userRole === "admin";
  const desk = useSupportDesk({ user,scope:"admin",admin:true,enabled:isAdmin });
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState("needs_nexus");
  const [priority,setPriority] = useState("all");
  const [category,setCategory] = useState("all");
  const [sort,setSort] = useState("priority");
  const [workspace,setWorkspace] = useState("all");
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  const rows = desk.list.data || [];
  const workspaceIds = [...new Set(rows.map(ticket => ticket.workspaceId).filter(Boolean))].sort();
  const filtered = filterTickets(workspace === "all" ? rows : rows.filter(ticket => ticket.workspaceId === workspace),{search,status,priority,category,sort});
  const pending = filterTickets(rows.filter(needsNexus),{sort:"priority"});
  const next = pending.find(ticket => ticket.id !== desk.id) || pending[0];
  function reset() { setSearch(""); setStatus("all"); setPriority("all"); setCategory("all"); setWorkspace("all"); setSort("priority"); }
  const metrics = [
    ["needs_nexus","Needs Nexus",rows.filter(needsNexus).length,"Ready for review"],
    ["pending_customer","With customers",rows.filter(ticket => ticket.status === "pending_customer").length,"Waiting for their next reply"],
    ["urgent","High impact",rows.filter(ticket => isActive(ticket) && ["high","urgent"].includes(ticket.priority)).length,"Active high / urgent tickets"],
    ["resolved","Resolved",rows.filter(ticket => ticket.status === "resolved").length,"Marked resolved in this snapshot"],
  ];
  return <Container maxWidth={false} className="support-shell support-queue" data-mode={darkMode ? "dark" : "light"}>
    <header className="support-header"><div><div className="support-eyebrow">NEXUS / SUPPORT OPERATIONS</div><h1>Every conversation.<br /><span>Handled with intention.</span></h1><p>A focused desk for the people behind your platform.</p></div><div className="support-header-actions"><Button variant="outlined" startIcon={<RefreshRounded />} disabled={desk.list.loading || desk.saving} onClick={desk.refresh}>{desk.list.loading ? "Refreshing…" : "Refresh queue"}</Button><Button variant="contained" endIcon={<ArrowForwardRounded />} disabled={!next || desk.saving || desk.list.loading || Boolean(desk.list.error)} onClick={() => desk.openTicket(next.id)}>Next to review</Button></div></header>
    <section className="support-queue-banner"><div className="support-queue-mark"><FilterAltOutlined /></div><div><div className="support-eyebrow">TRIAGE, WITH A CLEARER LENS</div><p>Start with impact. Keep the context. Close the loop.</p></div><span>ADMINISTRATORS ONLY<br /><small>Latest {rows.length} loaded tickets · manual refresh</small></span></section>
    <section className="support-queue-metrics" aria-label="Queue snapshot">{metrics.map(([value,label,count,note]) => <button key={value} aria-pressed={value === "urgent" ? priority === "impact" && status === "active" : status === value} disabled={desk.list.loading || Boolean(desk.list.error)} onClick={() => { setSearch(""); setCategory("all"); setWorkspace("all"); setPriority("all"); if (value === "urgent") { setStatus("active"); setPriority("impact"); } else setStatus(value); }}><span>{label}</span><strong>{desk.list.loading || desk.list.error ? "—" : count}</strong><small>{note}</small><ArrowForwardRounded /></button>)}</section>
    <div className="support-queue-filterbar"><TextField label="Search support queue" size="small" value={search} onChange={event => setSearch(event.target.value)} placeholder="Subject, ticket ID, requester, workspace" /><FormControl size="small"><InputLabel>Category filter</InputLabel><Select label="Category filter" value={category} onChange={event => setCategory(event.target.value)}><MenuItem value="all">All categories</MenuItem>{CATEGORIES.map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl size="small"><InputLabel>Priority filter</InputLabel><Select label="Priority filter" value={priority} onChange={event => setPriority(event.target.value)}><MenuItem value="all">All priorities</MenuItem><MenuItem value="impact">High & urgent</MenuItem>{PRIORITIES.map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><FormControl size="small"><InputLabel>Workspace filter</InputLabel><Select label="Workspace filter" value={workspace} onChange={event => setWorkspace(event.target.value)}><MenuItem value="all">All workspaces</MenuItem>{workspaceIds.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl><Button onClick={reset}>Reset</Button></div>
    <div className="support-desk-layout"><aside className="support-inbox"><div className="support-inbox-tools"><div className="support-inbox-heading"><h2>Conversations <span>{filtered.length}</span></h2><FormControl size="small"><InputLabel>Sort tickets</InputLabel><Select value={sort} label="Sort tickets" onChange={event => setSort(event.target.value)}><MenuItem value="priority">Priority first</MenuItem><MenuItem value="oldest">Waiting longest</MenuItem><MenuItem value="recent">Recently updated</MenuItem></Select></FormControl></div><div className="support-inbox-tabs">{[["needs_nexus","Needs Nexus"],["all","All"],["pending_customer","Customer"],["resolved","Resolved"],["closed","Closed"]].map(([value,label]) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div></div><TicketList admin rows={filtered} desk={desk} /></aside><TicketConversation darkMode={darkMode} admin desk={desk} user={user} /></div>
    <footer className="support-footer"><span>NEXUS SUPPORT OPERATIONS / CUSTOMER CONTEXT FIRST</span><span>Snapshot of up to 250 returned tickets. Prioritize impact. Keep the context.</span></footer>
  </Container>;
}