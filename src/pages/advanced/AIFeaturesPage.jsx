import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Container, FormControl, InputLabel, MenuItem, Select, Skeleton, TextField } from "@mui/material";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import ArrowOutwardRounded from "@mui/icons-material/ArrowOutwardRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import QueryStatsRounded from "@mui/icons-material/QueryStatsRounded";
import CompareArrowsRounded from "@mui/icons-material/CompareArrowsRounded";
import { toast } from "react-hot-toast";
import { apiRequest } from "../../services/apiClient.js";
import { hasWorkspacePermission } from "../../lib/workspacePermissions.js";
import { useOperationWorkspaces, useOperationResource } from "../operations/useOperationsData.js";
import "./intelligence.css";

const STARTERS = [
  { title: "Understand performance", hint: "Find the story behind your verification trends.", question: "Summarize my verification performance for the selected period.", Icon: TrendingUpRounded },
  { title: "Explore risk signals", hint: "Look for patterns that deserve a closer look.", question: "What are the main risk signals in my workspace?", Icon: ShieldOutlined },
  { title: "Investigate a change", hint: "Explore what may be driving verification failures.", question: "Why did verification failures change during this period?", Icon: QueryStatsRounded },
  { title: "Compare your methods", hint: "See how your verification channels measure up.", question: "Which verification method has the best success rate?", Icon: CompareArrowsRounded },
];
function AnswerText({ text }) {
  return <div className="intel-answer-text">{String(text).split("\n").map((line, index) => {
    const heading = line.match(/^#{1,4}\s+(.+)/);
    if (heading) return <h3 key={index}>{heading[1]}</h3>;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return <p key={index} className={/^[-•]\s/.test(line) ? "intel-answer-bullet" : ""}>{parts.map((part, i) => part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}{!line && "\u00a0"}</p>;
  })}</div>;
}
function EvidencePanel({sources=[]}) {
 return <section className="intel-evidence" aria-label="Workspace evidence"><h3>Evidence behind this perspective</h3>{sources.map(source=><details key={source.id}><summary>{source.id} · {source.title}</summary>
 {source.id==='E1'&&<div className="intel-fact-grid">{Object.entries(source.data.totals||{}).map(([key,value])=><div key={key}><span>{key.replace(/([A-Z])/g,' $1')}</span><strong>{value.toLocaleString()}</strong></div>)}</div>}
 {source.id==='E2'&&<div className="intel-evidence-table"><table><thead><tr><th>UTC date</th><th>Requests</th><th>Verified</th><th>Failed</th></tr></thead><tbody>{source.data.series?.slice(-14).map(row=><tr key={row.day}><td>{row.day}</td><td>{row.requests}</td><td>{row.verified}</td><td>{row.failed}</td></tr>)}</tbody></table><small>Latest 14 days shown; the investigation can inspect the full selected period.</small></div>}
 {source.id==='E3'&&source.data.methods?.map(row=><p key={row.method}><strong>{row.method}</strong> · {row.requests} requests · {row.verified} verified · {row.verifiedShare??'—'}% verified share{row.sampleWarning&&' · '+row.sampleWarning}</p>)}
 {source.id==='E4'&&<><p>{source.data.highRiskCreated} high-risk creations · {source.data.disposableCreated} disposable creations</p>{source.data.buckets?.map(row=><p key={row.label}>{row.label}: {row.count}</p>)}</>}
 <ul>{source.data.limitations?.map(text=><li key={text}>{text}</li>)}</ul></details>)}</section>;
}
export function AIFeaturesPage({ user, darkMode }) {
  const ws = useOperationWorkspaces(user);
  const { workspaceId, workspace } = ws;
  const canUse = hasWorkspacePermission(workspace?.role, "intelligence.use");
  const [range, setRange] = useState(30);
  const [environment, setEnvironment] = useState("all");
  const [mode,setMode]=useState('standard');
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!asking) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [asking]);
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const pending = useRef(null);
  const context = JSON.stringify([user?.uid, workspaceId, range, environment,mode]);
  const current = useRef(context);
  current.current = context;
  const loader = useCallback(async signal => {
    const result = await apiRequest(user, "/workspaces/" + encodeURIComponent(workspaceId) + "/intelligence/usage", { signal });
    if (!result.usage || !Number.isFinite(Number(result.usage.limit)) || !Number.isFinite(Number(result.usage.remaining))) throw new Error("Workspace allowance could not be loaded. Refresh usage to try again.");
    return result.usage;
  }, [user, workspaceId]);
  const quota = useOperationResource(canUse && workspaceId ? workspaceId : "", loader);
  const refreshUsage = quota.refresh;
  const usage = quota.data;
  const remaining = Number(usage?.remaining);
  const limit = Number(usage?.limit);
  const quotaReady = usage && Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0 && remaining > 0 && !quota.error && !quota.loading;
  const visibleRecords = records.filter(row => row.context === context);
  const result = visibleRecords.find(row => row.id === selected) || visibleRecords[0];
  useEffect(() => {
    if (pending.current) refreshUsage();
    pending.current?.abort(); pending.current = null;
    setAsking(false); setError(""); setSelected(null);
    return () => { pending.current?.abort(); };
  }, [context, refreshUsage]);
  useEffect(() => { setRecords([]); setQuestion(""); }, [user?.uid]);
  async function ask() {
    const clean = question.trim();
    if (!canUse || !quotaReady || !clean || clean.length > 1200 || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const askedContext = context;
    setAsking(true); setError("");
    try {
      const response = await apiRequest(user, "/workspaces/" + encodeURIComponent(workspaceId) + "/intelligence", {
        method: "POST", timeoutMs:100000,signal: controller.signal, body: JSON.stringify({ question: clean, range, environment,mode,history:visibleRecords.slice(Math.max(0,visibleRecords.findIndex(row=>row.id===result?.id)),Math.max(0,visibleRecords.findIndex(row=>row.id===result?.id))+3).reverse().map(row=>({question:row.question,answer:row.answer})) }),
      });
      if (controller.signal.aborted || current.current !== askedContext) return;
      if (!response.answer) throw new Error("No answer was returned. Please try again.");
      const record = { ...response,id: Date.now(), context: askedContext, question: clean, answer: response.answer, source: response.source, range, environment, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      setRecords(rows => [record, ...rows].slice(0, 8)); setSelected(record.id);
    } catch (err) {
      if (!controller.signal.aborted && current.current === askedContext) setError(err.message || "Analysis could not be completed. Try again.");
    } finally {
      if (pending.current === controller) { pending.current = null; setAsking(false); }
      if (current.current === askedContext && !controller.signal.aborted) refreshUsage();
    }
  }
  async function copyAnswer() {
    try { await navigator.clipboard.writeText(result.question + "\n\n" + result.answer); toast.success("Analysis copied."); }
    catch { toast.error("Copy unavailable. Select the answer to copy it manually."); }
  }
  function download() {
    const content = "# Nexus Intelligence\n\n" + result.question + "\n\n" + result.range + " days · " + result.environment + "\n\n" + result.answer + "\n\nAI-generated analysis. Validate findings against your reports.\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nexus-analysis.md"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Container maxWidth={false} className="intel" data-mode={darkMode ? "dark" : "light"}>
    <header className="intel-header"><div><div className="intel-eyebrow">NEXUS / INTELLIGENCE</div><h1>A clearer perspective<span>.</span></h1><p>Your workspace signals, connected to better questions.</p></div><div className="intel-header-controls"><FormControl size="small" sx={{ minWidth: 210 }}><InputLabel id="intel-workspace-label">Workspace</InputLabel><Select labelId="intel-workspace-label" label="Workspace" value={workspaceId} onChange={event => ws.setWorkspaceId(event.target.value)}>{ws.workspaces.map(row => <MenuItem key={row.id} value={row.id}>{row.name || row.id}</MenuItem>)}</Select></FormControl><Button aria-label="Refresh intelligence usage" variant="outlined" disabled={!canUse || asking || quota.loading} onClick={refreshUsage}><RefreshRounded /></Button></div></header>
    {ws.error && <Alert severity="error" action={<Button onClick={ws.refresh} color="inherit">Retry</Button>}>{ws.error}</Alert>}
    {ws.loading ? <Skeleton variant="rounded" height={420} /> : !workspaceId ? <Alert severity="info">Create or join a workspace to use Nexus Intelligence.</Alert> : <div className="intel-layout">
      <aside className="intel-sidebar">
        <div className="intel-context"><div className="intel-eyebrow">YOUR LENS</div><h2>Set the perspective.</h2><p>Every answer belongs to the workspace and period you choose.</p><FormControl fullWidth size="small"><InputLabel id="intel-period-label">Analysis period</InputLabel><Select labelId="intel-period-label" value={range} label="Analysis period" onChange={event => setRange(Number(event.target.value))}>{[[7,"7 days"],[30,"30 days"],[90,"90 days"],[365,"1 year"]].map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl><div className="intel-env" aria-label="Analysis environment">{["all","live","test"].map(value => <button key={value} aria-pressed={environment === value} onClick={() => setEnvironment(value)}>{value === "all" ? "All environments" : value}</button>)}</div></div>
        <div className="intel-quota"><div className="intel-eyebrow">WORKSPACE ALLOWANCE</div>{quota.loading ? <Skeleton height={60} /> : usage ? <><strong>{Math.max(0, remaining).toLocaleString()}<small> / {Math.max(0, limit).toLocaleString()}</small></strong><p>questions remaining this month</p><div className="intel-meter" role="progressbar" aria-label="Monthly queries used" aria-valuemin={0} aria-valuemax={Math.max(1, limit)} aria-valuenow={Math.max(0, Math.min(limit, limit - remaining))}><span style={{ width: (limit > 0 ? Math.min(100, Math.max(0, (limit - remaining) / limit * 100)) : 0) + "%" }} /></div></> : <p>{canUse ? "Usage unavailable" : "Access restricted by workspace role"}</p>}<small>One completed investigation uses one question. Failed or canceled investigations do not use a question. Workspace allowance is shared across your team.</small></div>
        <div className="intel-history"><div className="intel-eyebrow">THIS SESSION</div><h2>Recent perspectives</h2>{visibleRecords.length ? visibleRecords.map(row => <button key={row.id} onClick={() => setSelected(row.id)} aria-pressed={result?.id === row.id}><span>{row.question}</span><small>{row.time}</small></button>) : <p>Your analyses will appear here. History lasts only for this session.</p>}</div>
      </aside>
      <main className="intel-main">
        <section className="intel-hero"><div className="intel-hero-copy"><div className="intel-eyebrow"><AutoAwesomeRounded /> INTELLIGENCE, WITH CONTEXT</div><h2>From signal<br /><em>to understanding.</em></h2><p>Ask a better question. Uncover a pattern. Find your next move.</p><span className="intel-source">Workspace analytics · {range} days · {environment === "all" ? "all environments" : environment}</span></div><div className="intel-orbit" aria-hidden="true"><div className="intel-orbit-ring ring-one" /><div className="intel-orbit-ring ring-two" /><div className="intel-orbit-ring ring-three" /><div className="intel-orbit-core"><AutoAwesomeRounded /></div><span className="intel-orbit-point point-one" /><span className="intel-orbit-point point-two" /><span className="intel-orbit-label">A CONNECTED PERSPECTIVE / 01</span></div></section>
        {!canUse && <Alert severity="info">Your workspace role cannot use Intelligence. Ask an owner or admin for access.</Alert>}
        {quota.error && <Alert severity="error" action={<Button color="inherit" onClick={refreshUsage}>Retry usage</Button>}>{quota.error}</Alert>}
        {usage && !quota.loading && (limit === 0 || remaining <= 0) && <Alert severity="info" action={hasWorkspacePermission(workspace?.role, "billing.read") ? <Button color="inherit" href="/billing">View plan</Button> : null}>{limit === 0 ? "Intelligence is not included in this workspace plan." : "Your monthly Intelligence allowance has been used."} Check your workspace plan in Billing.</Alert>}
        <section className="intel-starters" aria-label="Suggested questions">{STARTERS.map(({ title, hint, question: prompt, Icon }) => <button key={title} disabled={!canUse || asking} onClick={() => { setQuestion(prompt); document.getElementById("intel-question")?.focus(); }}><div><Icon /><ArrowOutwardRounded /></div><strong>{title}</strong><span>{hint}</span></button>)}</section>
        <section className="intel-composer"><div className="intel-composer-heading"><span><AutoAwesomeRounded /> Ask Nexus</span><small>READ-ONLY INVESTIGATION</small></div><div className="intel-reasoning"><FormControl size="small"><InputLabel id="intel-mode-label">Reasoning mode</InputLabel><Select labelId="intel-mode-label" label="Reasoning mode" value={mode} disabled={asking} onChange={event=>setMode(event.target.value)}><MenuItem value="standard">Standard investigation</MenuItem><MenuItem value="deep">Deep investigation</MenuItem></Select></FormControl><p>{mode==='deep'?'Nexus Deep connects more evidence for complex questions. Analysis may take longer.':'Nexus Standard delivers focused analysis grounded in your workspace evidence.'}</p></div><TextField id="intel-question" label="Your question" fullWidth multiline minRows={3} disabled={!canUse || asking} value={question} inputProps={{ maxLength: 1200 }} onChange={event => setQuestion(event.target.value)} placeholder="What changed in my verification performance this month?" onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); ask(); } }} /><div className="intel-composer-footer"><div><span>{question.length}/1200 · Ctrl / ⌘ + Enter</span><small>{visibleRecords.length?'Follow-ups use the last three perspectives in this selection. ':''}Don't include credentials, passwords, or verification codes.</small></div>{asking&&<Button onClick={()=>{pending.current?.abort();pending.current=null;setAsking(false);refreshUsage();}}>Cancel investigation</Button>}<Button variant="contained" endIcon={<ArrowOutwardRounded />} disabled={asking || !quotaReady || !canUse || !question.trim()} onClick={ask}>{asking ? "Analyzing…" : "Explore question"}</Button></div></section>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        {asking && <div className="intel-pending" role="status"><AutoAwesomeRounded /><div><strong>Connecting your workspace signals…</strong><p>{elapsed}s elapsed · Comparing evidence and checking conclusions. You can cancel this investigation.</p></div><span className="intel-pending-dot" /></div>}
        {result && <section className="intel-answer"><div className="intel-answer-top"><span className="intel-eyebrow">YOUR PERSPECTIVE / {result.time}</span><div><Button aria-label="Copy analysis" onClick={copyAnswer} startIcon={<ContentCopyRounded />}>Copy</Button><Button aria-label="Download analysis" onClick={download} startIcon={<DownloadRounded />}>Save brief</Button></div></div><h2>{result.question}</h2><div className="intel-answer-meta">{result.source === "workspace-analytics" && <span>Workspace analytics</span>}{result.source === "nexus-guidance" && <span>Nexus guidance · No question used</span>}<span>{result.range} days</span><span>{result.environment.toUpperCase()}</span>{result.model&&<span>{result.mode === "deep" ? "Nexus Deep" : "Nexus Standard"}</span>}{result.quality&&<span>{result.quality==='partial'?'Partial detail coverage':result.quality==='no-activity'?'No recorded activity':'Workspace evidence available'}</span>}</div>{result.investigation?.length>0&&<div className="intel-investigation">Investigated: {[...new Set(result.investigation)].join(' → ')}</div>}<AnswerText text={result.answer} />{result.evidence?.length>0&&<EvidencePanel sources={result.evidence}/>}<div className="intel-followups">{result.brief?.followUpQuestions?.map(prompt=><button key={prompt} disabled={asking} onClick={()=>{setQuestion(prompt);document.getElementById('intel-question')?.focus();}}>{prompt} ↗</button>)}</div><footer>{result.source === "nexus-guidance" ? "This is a welcome message. Ask a workspace question to start an investigation." : "AI-generated analysis. Source references show the data consulted, not a guarantee that every conclusion is correct. Validate recommendations against your reports."}</footer></section>}
        <div className="intel-boundary"><ShieldOutlined /><p>Analysis uses aggregate verification analytics and sanitized event summaries, together with your question. Workspace API secrets and raw verification codes are excluded from the analytics context.</p></div>
      </main>
    </div>}
  </Container>;
}
