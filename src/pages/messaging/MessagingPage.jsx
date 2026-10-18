import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, TextField } from "@mui/material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import CampaignIcon from "@mui/icons-material/Campaign";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from "../../lib/supabaseDataCompat";
import { db } from "../../lib/supabaseLegacy";
import { toast } from "react-hot-toast";
import "./messaging.css";

export function filterMessages(rows, search, filter) {
 const term = search.trim().toLowerCase();
 return rows.filter(row => (filter !== "unread" || !row.read) && (filter !== "read" || row.read) && [row.title,row.body,row.fromName,row.toName,row.type].some(value => String(value || "").toLowerCase().includes(term)));
}
const dateLabel = row => {
 const date = new Date(row.createdAt || row.ts);
 return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
};
export function MessagingPage({ user, userRole, darkMode }) {
 const admin = userRole === "admin";
 const [feed,setFeed] = useState("inbox"), [filter,setFilter] = useState("all"), [search,setSearch] = useState("");
 const [streams,setStreams] = useState({}), [selected,setSelected] = useState(""), [tick,setTick] = useState(0);
 const [compose,setCompose] = useState(""), [title,setTitle] = useState(""), [body,setBody] = useState(""), [recipient,setRecipient] = useState(""), [type,setType] = useState("info");
 const [users,setUsers] = useState([]), [usersError,setUsersError] = useState(""), [usersLoading,setUsersLoading] = useState(false);
 const [busy,setBusy] = useState(false), [confirmation,setConfirmation] = useState(null), [writeError,setWriteError] = useState("");
 const lock = useRef(false), identity = useRef(user?.uid), reader = useRef(null);
 identity.current = user?.uid;
 useEffect(() => {
  setStreams({});setSelected("");setCompose("");setTitle("");setBody("");setRecipient("");setUsers([]);setUsersError("");setWriteError("");setConfirmation(null);setFeed("inbox");
 },[user?.uid,admin]);
 useEffect(() => {
  let active = true;
  if (!user?.uid) return;
  const sources = {
   inbox:query(collection(db,"messages"),where("toUid","==",user.uid)),
   announcements:query(collection(db,"announcements"),orderBy("ts","desc"),limit(50)),
   ...(admin ? {sent:query(collection(db,"messages"),where("fromUid","==",user.uid),orderBy("ts","desc"),limit(50)),all:query(collection(db,"messages"),orderBy("ts","desc"),limit(50))} : {})
  };
  const unsubscribers = Object.entries(sources).map(([key,ref]) => onSnapshot(ref,snap => {
   if (active) setStreams(prev => ({...prev,[key]:{rows:snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(b.ts||0)-(a.ts||0)),error:""}}));
  },err=>{if(active)setStreams(prev=>({...prev,[key]:{...prev[key],error:err.message || "Unable to load messages."}}));}));
  if(admin) {
   setUsersLoading(true);setUsersError("");
   getDocs(collection(db,"users")).then(snap=>{if(active)setUsers(snap.docs.map(d=>({...d.data(),id:d.id})).filter(u=>u.submitterUid));})
    .catch(err=>{if(active)setUsersError(err.message || "Unable to load recipients.");})
    .finally(()=>{if(active)setUsersLoading(false);});
  }
  return ()=>{active=false;unsubscribers.forEach(unsub=>unsub());};
 },[user?.uid,admin,tick]);
 const rows = useMemo(()=>streams[feed]?.rows || [],[streams,feed]), error = streams[feed]?.error;
 const filtered = useMemo(()=>filterMessages(rows,search,feed === "inbox" ? filter : "all"),[rows,search,filter,feed]);
 const current = filtered.find(row=>row.id===selected);
 const unread = streams.inbox?.rows?.filter(row=>!row.read).length;
 async function action(kind,row) {
  if(lock.current || !user || (feed !== "inbox" && !admin)) return;
  lock.current=true;setBusy(true);setWriteError("");
  const uid=user.uid, source=feed === "announcements" ? "announcements" : "messages";
  try {
   if(kind==="delete") await deleteDoc(doc(db,source,row.id));
   else await updateDoc(doc(db,"messages",row.id),{read:kind==="read"});
   if(identity.current!==uid)return;
   setStreams(prev=>({...prev,[feed]:{...prev[feed],rows:prev[feed].rows.flatMap(item=>item.id!==row.id?[item]:kind==="delete"?[]:[{...item,read:kind==="read"}])}}));
   if(kind==="delete"){setSelected("");toast.success("Deleted.");}
   setConfirmation(null);
  } catch(err) {if(identity.current===uid)setWriteError(err.message || "Unable to update this message.");}
  finally {lock.current=false;setBusy(false);}
 }
 async function publish() {
  if(lock.current || !admin || !title.trim() || !body.trim() || (compose==="direct" && !recipient)) return;
  const target=users.find(u=>u.submitterUid===recipient);
  if(compose==="direct" && !target){setWriteError("Choose an available recipient.");return;}
  lock.current=true;setBusy(true);setWriteError(""); const uid=user.uid;
  try {
   const payload={title:title.trim(),body:body.trim(),fromUid:uid,fromName:user.displayName || user.email || "Nexus",ts:Date.now(),createdAt:new Date().toISOString(),type:compose==="direct"?"direct":type};
   await addDoc(collection(db,compose==="direct"?"messages":"announcements"),compose==="direct"?{...payload,toUid:recipient,toName:target.name || target.email || "User",read:false}:{...payload,pinned:false});
   if(identity.current!==uid)return;
   toast.success(compose==="direct"?"Message sent.":"Announcement published to the shared feed.");
   setCompose("");setTitle("");setBody("");setRecipient("");
  } catch(err){if(identity.current===uid)setWriteError(err.message || "Unable to publish. Your draft is preserved.");}
  finally{lock.current=false;setBusy(false);}
 }
 function switchFeed(next){setFeed(next);setSelected("");setFilter("all");setWriteError("");}
 if(!user)return <Navigate to="/" />;
 return <div className="message-studio" data-mode={darkMode?"dark":"light"}>
  <header className="message-hero"><div><span className="message-kicker">NEXUS / COMMUNICATIONS</span><h1>A little less noise.<br/><em>A lot more clarity.</em></h1><p>Your updates, announcements and account messages. Together in one thoughtful space.</p><div className="message-hero-actions"><Chip label={unread == null ? "Loading inbox" : unread+" unread"} /><span>Account inbox · Updates as they arrive</span></div></div><div className="message-art" aria-hidden="true"><div className="message-orbit"/><div className="message-orbit second"/><div className="message-envelope"><MailOutlineIcon/></div><span className="message-art-tag">THE SIGNAL, SIMPLIFIED</span></div></header>
  <div className="message-heading"><div><span className="message-kicker">YOUR COMMUNICATION DESK</span><h2>Stay in the loop.</h2></div><div className="message-actions"><Button startIcon={<RefreshIcon/>} disabled={busy} onClick={()=>setTick(t=>t+1)}>Refresh</Button>{admin&&<><Button onClick={()=>{setCompose("announcement");setWriteError("");}} startIcon={<CampaignIcon/>}>Announcement</Button><Button variant="contained" onClick={()=>{setCompose("direct");setWriteError("");}} endIcon={<ArrowForwardIcon/>}>New message</Button></>}</div></div>
  <section className="message-desk">
   <aside className="message-folders" aria-label="Message folders">{[["inbox","Inbox",streams.inbox?.rows?.length],["announcements","Announcements",streams.announcements?.rows?.length],...(admin?[["sent","Sent by you",streams.sent?.rows?.length],["all","Delivery log",streams.all?.rows?.length]]:[])].map(([id,label,count])=><button key={id} className={feed===id?"active":""} aria-pressed={feed===id} onClick={()=>switchFeed(id)}>{label}<span>{count ?? "—"}</span></button>)}<div className="message-folder-note"><MailOutlineIcon/><p>One place for the updates that matter.</p><small>Announcements are shared with all Nexus accounts.</small></div></aside>
   <div className="message-list"><TextField fullWidth size="small" label="Search messages" value={search} onChange={e=>setSearch(e.target.value)}/>{feed==="inbox"&&<div className="message-filters">{["all","unread","read"].map(id=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{id==="all"?"All messages":id==="unread"?"Unread":"Read"}</button>)}</div>}
    {error?<Alert severity="error" action={<Button onClick={()=>setTick(t=>t+1)}>Retry</Button>}>{error}</Alert>:!streams[feed]?.rows?<><Skeleton height={90}/><Skeleton height={90}/><Skeleton height={90}/></>:filtered.length===0?<div className="message-empty"><MailOutlineIcon/><h3>{search || filter!=="all"?"No matching messages":"You're all caught up."}</h3><p>{search || filter!=="all"?"Try a different search or filter.":"New "+(feed==="announcements"?"announcements":"messages")+" will appear here."}</p>{(search||filter!=="all")&&<Button onClick={()=>{setSearch("");setFilter("all");}}>Clear filters</Button>}</div>:<div className="message-rows">{filtered.map(row=><button className={"message-row "+(current?.id===row.id?"selected":"")} key={row.id} aria-pressed={current?.id===row.id} onClick={()=>{setSelected(row.id);setWriteError("");if(window.matchMedia?.("(max-width:600px)").matches)reader.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"});}}><div className="message-row-meta"><span>{(feed==="sent"||feed==="all")?"To "+(row.toName||"User"):row.fromName || "Nexus"}</span><time>{dateLabel(row)}</time></div><strong>{feed==="inbox"&&!row.read&&<i/>}{row.title || "Untitled message"}</strong><p>{row.body}</p><small>{row.type || "direct"}</small></button>)}</div>}
   </div>
   <article ref={reader} className="message-reader" aria-label="Message reading pane">{current?<><div className="message-reader-meta"><Chip label={current.type || "direct"} size="small"/><time>{dateLabel(current)}</time></div><h2>{current.title || "Untitled message"}</h2><p className="message-byline">{(feed==="sent"||feed==="all")?"To "+(current.toName||"User"):"From "+(current.fromName||"Nexus")}</p><div className="message-body">{current.body}</div>{writeError&&<Alert severity="error">{writeError}</Alert>}<div className="message-reader-actions">{feed==="inbox"&&<Button variant="outlined" disabled={busy} onClick={()=>action(current.read?"unread":"read",current)}>{current.read?"Mark unread":"Mark as read"}</Button>}{(feed==="inbox"||admin)&&<Button color="error" disabled={busy} onClick={()=>setConfirmation(current)}>Delete</Button>}</div></>:<div className="message-empty reader-empty"><div className="message-reader-symbol">↗</div><span className="message-kicker">ROOM TO FOCUS</span><h2>Choose a message.<br/><em>Give it your attention.</em></h2><p>Select an update to read it here. You decide when to mark it as read.</p></div>}</article>
  </section><footer className="message-footer"><span>Private inbox. Shared announcements. Clear communication.</span><span>NEXUS / MESSAGE STUDIO</span></footer>
  <Dialog open={Boolean(compose)} onClose={()=>{if(!busy)setCompose("");}} className="message-dialog" data-mode={darkMode?"dark":"light"} fullWidth maxWidth="sm"><DialogTitle>{compose==="direct"?"Write a direct message":"Publish an announcement"}</DialogTitle><DialogContent><p>{compose==="direct"?"Send a message to a Nexus account.":"Visible to every Nexus account in the shared announcements feed."}</p>{writeError&&<Alert severity="error">{writeError}</Alert>}{compose==="direct"?<>{usersError&&<Alert severity="error">{usersError}</Alert>}<TextField select label="Recipient" fullWidth value={recipient} disabled={busy||usersLoading} onChange={e=>setRecipient(e.target.value)} helperText={usersLoading?"Loading recipients…":!users.length?"No recipients available.":""}>{users.map(u=><MenuItem key={u.id} value={u.submitterUid}>{u.name || u.email || u.submitterUid}</MenuItem>)}</TextField></>:<TextField select label="Announcement type" fullWidth value={type} disabled={busy} onChange={e=>setType(e.target.value)}>{["info","success","warning","error"].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>}<TextField fullWidth label="Subject" inputProps={{maxLength:160}} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/><TextField fullWidth multiline minRows={5} label="Message" inputProps={{maxLength:10000}} helperText={body.length+" / 10,000"} value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></DialogContent><DialogActions><Button disabled={busy} onClick={()=>setCompose("")}>Keep draft & close</Button><Button variant="contained" disabled={busy||!title.trim()||!body.trim()||(compose==="direct"&&(!recipient||usersLoading||Boolean(usersError)))} onClick={publish}>{busy?"Publishing…":compose==="direct"?"Send message":"Publish announcement"}</Button></DialogActions></Dialog>
  <Dialog open={Boolean(confirmation)} onClose={()=>{if(!busy)setConfirmation(null);}} className="message-dialog" data-mode={darkMode?"dark":"light"}><DialogTitle>Delete this {feed==="announcements"?"announcement":"message"}?</DialogTitle><DialogContent>This cannot be undone.{writeError&&<Alert severity="error">{writeError}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</Button><Button color="error" disabled={busy} onClick={()=>action("delete",confirmation)}>{busy?"Deleting…":"Delete permanently"}</Button></DialogActions></Dialog>
 </div>;
}
