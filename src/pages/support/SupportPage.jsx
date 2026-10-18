import { useCallback, useState } from "react";
import { Alert, Button, Container, FormControl, InputLabel, MenuItem, Select, Skeleton, TextField } from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import TerminalRounded from "@mui/icons-material/TerminalRounded";
import VerifiedOutlined from "@mui/icons-material/VerifiedOutlined";
import CreditCardRounded from "@mui/icons-material/CreditCardRounded";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import { toast } from "react-hot-toast";
import { useOperationWorkspaces } from "../operations/useOperationsData.js";
import { useSupportDesk } from "./useSupportDesk.js";
import { TicketConversation, TicketList } from "./SupportUI.jsx";
import { NewTicketDialog } from "./NewTicketDialog.jsx";
import { ARTICLES, filterTickets, isActive } from "./ticketModel.js";
import "./support.css";
const TOPICS = [["technical","Integration",TerminalRounded],["verification","Verification",VerifiedOutlined],["billing","Billing & usage",CreditCardRounded],["account","Your account",ManageAccountsOutlined]];
export function SupportPage({ user, darkMode }) {
  const ws = useOperationWorkspaces(user);
  const desk = useSupportDesk({ user,scope:ws.workspaceId });
  const [helpSearch,setHelpSearch] = useState("");
  const [topic,setTopic] = useState("all");
  const [expanded,setExpanded] = useState(null);
  const [tab,setTab] = useState("help");
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState("all");
  const [createOpen,setCreateOpen] = useState(false);
  const [category,setCategory] = useState("technical");
  const rows = desk.list.data || [];
  const filtered = filterTickets(rows,{search,status});
  const articles = ARTICLES.filter(article => (topic === "all" || article.category === topic) && [article.title,article.description,article.answer].join(" ").toLowerCase().includes(helpSearch.trim().toLowerCase()));
  function newTicket(nextCategory = "technical") { setCategory(nextCategory); setCreateOpen(true); }
  const onCreated = useCallback(ticket => {
    setCreateOpen(false); setTab("tickets"); setSearch(""); setStatus("all");
    desk.list.refresh(); if (ticket?.id) desk.openTicket(ticket.id);
    toast.success("Ticket created. Your conversation is ready.");
  }, [desk]);
  return <Container maxWidth={false} className="support-shell support-customer" data-mode={darkMode ? "dark" : "light"}>
    <header className="support-header"><div><div className="support-eyebrow">NEXUS / CUSTOMER EXPERIENCE</div><h1>A little help.<br className="support-mobile-break" /> <span>A lot of possibility.</span></h1><p>Answers when you need them. A conversation when it matters.</p></div><div className="support-header-actions"><FormControl size="small"><InputLabel>Workspace</InputLabel><Select label="Workspace" value={ws.workspaceId} disabled={desk.saving || createOpen} onChange={event => ws.setWorkspaceId(event.target.value)}>{ws.workspaces.map(row => <MenuItem key={row.id} value={row.id}>{row.name || row.id}</MenuItem>)}</Select></FormControl><Button variant="contained" startIcon={<AddRounded />} disabled={!ws.workspaceId || ws.loading} onClick={() => newTicket()}>New ticket</Button></div></header>
    {ws.error && <Alert severity="error" action={<Button onClick={ws.refresh} color="inherit">Retry workspaces</Button>}>{ws.error}</Alert>}
    {ws.loading ? <Skeleton variant="rounded" height={210} /> : <section className="support-hero"><div><div className="support-eyebrow">YOUR NEXT STEP STARTS HERE</div><h2>Less friction.<br /><em>More forward.</em></h2><p>Find a practical answer, or bring the Nexus team into the conversation.</p><TextField fullWidth size="small" label="Search help guides" value={helpSearch} onChange={event => { setHelpSearch(event.target.value); setTab("help"); }} placeholder="Try API keys, verification, or billing" InputProps={{ startAdornment:<SearchRounded sx={{ mr:1,opacity:.5 }} /> }} /></div><div className="support-hero-art" aria-hidden="true"><div className="support-art-ring" /><div className="support-art-card"><ForumOutlined /><span>THE HUMAN CONNECTION</span><strong>Here to move<br />you forward.</strong><div><i /><i /><i /></div></div><span className="support-art-label">CONTEXT → CONVERSATION → CLARITY</span></div></section>}
    <nav className="support-tabs" aria-label="Support views"><button aria-pressed={tab === "help"} onClick={() => setTab("help")}>Help library <span>{ARTICLES.length}</span></button><button aria-pressed={tab === "tickets"} onClick={() => setTab("tickets")}>Workspace tickets <span>{desk.list.data ? rows.filter(isActive).length : "—"}</span></button><small>Private to your workspace and Nexus Support</small></nav>
    {tab === "help" ? <>
      <section className="support-topic-grid" aria-label="Browse help topics">{TOPICS.map(([value,label,Icon]) => <button key={value} aria-pressed={topic === value} onClick={() => { setTopic(topic === value ? "all" : value); setExpanded(null); }}><Icon /><strong>{label}</strong><ArrowOutwardRounded /></button>)}</section>
      <div className="support-section-heading"><div><div className="support-eyebrow">PRACTICAL ANSWERS</div><h2>Find your way forward.</h2></div>{(helpSearch || topic !== "all") && <Button onClick={() => { setTopic("all"); setHelpSearch(""); }}>Clear filters</Button>}</div>
      <section className="support-article-grid">{articles.length ? articles.map(article => <article key={article.id} className={"support-article " + (expanded === article.id ? "is-expanded" : "")}><button aria-expanded={expanded === article.id} onClick={() => setExpanded(expanded === article.id ? null : article.id)}><span className="support-eyebrow">{article.category}</span><h3>{article.title}</h3><p>{article.description}</p><span className="support-read-guide">{expanded === article.id ? "Close guide" : "Read guide"} <ArrowOutwardRounded /></span></button>{expanded === article.id && <div className="support-article-answer"><p>{article.answer}</p><Button href={article.href}>{article.action} <ArrowOutwardRounded fontSize="small" /></Button><Button disabled={!ws.workspaceId} onClick={() => newTicket(article.category)}>Still need help?</Button></div>}</article>) : <div className="support-empty"><h3>No guides match that search.</h3><p>Try a broader term, or start a support conversation.</p><Button variant="outlined" disabled={!ws.workspaceId} onClick={() => newTicket()}>Ask Nexus Support</Button></div>}</section>
      <section className="support-contact-strip"><ForumOutlined /><div><h3>Some things need a conversation.</h3><p>Share the issue, its impact, and what you've already tried. We'll keep the context together.</p></div><Button variant="contained" endIcon={<ArrowOutwardRounded />} disabled={!ws.workspaceId} onClick={() => newTicket()}>Talk to support</Button></section>
    </> : <><div className="support-section-heading"><div><div className="support-eyebrow">WORKSPACE CONVERSATIONS</div><h2>Every detail, connected.</h2><p>Latest {rows.length} loaded tickets · replies are shared with workspace members.</p></div><Button startIcon={<RefreshRounded />} disabled={desk.list.loading || desk.saving || !ws.workspaceId} onClick={desk.refresh}>Refresh tickets</Button></div>{!ws.loading && !ws.workspaceId && <Alert severity="info">Create or join a workspace before opening a support ticket.</Alert>}<div className="support-desk-layout"><aside className="support-inbox"><div className="support-inbox-tools"><TextField size="small" fullWidth label="Search workspace tickets" value={search} onChange={event => setSearch(event.target.value)} /><div className="support-inbox-tabs">{[["all","All"],["active","Active"],["pending_customer","Needs you"],["closed","Closed"]].map(([value,label]) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div></div><TicketList rows={filtered} desk={desk} emptyAction={!rows.length && <Button disabled={!ws.workspaceId} onClick={() => newTicket()}>Create a ticket</Button>} /></aside><TicketConversation darkMode={darkMode} desk={desk} user={user} onNewTicket={() => newTicket()} /></div></>}
    <footer className="support-footer"><span>NEXUS SUPPORT / CONNECTED BY CONTEXT</span><span>Helpful answers. Clear conversations. Your next step.</span></footer>
    <NewTicketDialog key={ws.workspaceId} open={createOpen} category={category} user={user} workspaceId={ws.workspaceId} workspaceName={ws.workspace?.name} darkMode={darkMode} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
  </Container>;
}