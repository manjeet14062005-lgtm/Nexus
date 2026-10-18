import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Chip, MenuItem, Skeleton, TextField } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import WebhookIcon from "@mui/icons-material/Webhook";
import CodeIcon from "@mui/icons-material/Code";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useNavigate } from "react-router-dom";
import { useOperationResource, useOperationWorkspaces } from "../operations/useOperationsData";
import { apiRequest } from "../../services/apiClient";
import { hasWorkspacePermission } from "../../lib/workspacePermissions";
import "./integrations.css";

const pathways=[
 {id:"api",category:"Build",title:"Nexus API",symbol:"{}",description:"Bring verification into your application with scoped test and live credentials.",route:"/developer?tab=keys",action:"Manage credentials",permission:"api_keys.read"},
 {id:"webhooks",category:"Connect",title:"Event destinations",symbol:"↗",description:"Route verification events to your backend with signing secrets and delivery history.",route:"/developer?tab=webhooks",action:"Manage webhooks",permission:"webhooks.read"},
 {id:"workflows",category:"Automate",title:"Workflow automation",symbol:"⌘",description:"Turn workspace events into the next action using your existing workflow tools.",route:"/workflows",action:"Open workflows",permission:"workflows.read"},
 {id:"reports",category:"Automate",title:"Scheduled reports",symbol:"◷",description:"Keep reporting on a schedule and review results in your reporting workspace.",route:"/reports",action:"Open reports",permission:"reports.read"}
];
export function endpointLabel(value) {
 try {const url=new URL(value);return url.host+url.pathname;} catch (_) {return "Endpoint unavailable";}
}
export function IntegrationsPage({ user, darkMode }) {
 const navigate=useNavigate(), ws=useOperationWorkspaces(user);
 const openRoute=route=>navigate(route.startsWith("/developer")&&ws.workspaceId?route+"&workspace="+encodeURIComponent(ws.workspaceId):route);
 const [search,setSearch]=useState(""),[category,setCategory]=useState("All");
 const loader=useCallback(async signal=>{
  const base="/workspaces/"+encodeURIComponent(ws.workspaceId);
  const access=await apiRequest(user,base+"/access",{signal});
  const role=access.workspace?.role;
  const load=async (path,permission,key)=>{
   if(!hasWorkspacePermission(role,permission))return {allowed:false,rows:[],error:""};
   try {const response=await apiRequest(user,base+path,{signal});return {allowed:true,rows:response[key] || [],error:""};}
   catch(err){if(signal.aborted)throw err;return {allowed:true,rows:[],error:err.message || "Unable to load connection data."};}
  };
  const [keys,hooks]=await Promise.all([load("/api-keys","api_keys.read","apiKeys"),load("/webhooks","webhooks.read","webhooks")]);
  return {role,keys,hooks};
 },[user,ws.workspaceId]);
 const data=useOperationResource(user?.uid&&ws.workspaceId?user.uid+":"+ws.workspaceId:"",loader);
 const current=data.data, keys=current?.keys,hooks=current?.hooks;
 const activeKeys=keys?.rows.filter(key=>key.status==="active") || [], activeHooks=hooks?.rows.filter(hook=>hook.enabled) || [];
 const visible=useMemo(()=>pathways.filter(item=>(category==="All"||item.category===category)&&(item.title+" "+item.description).toLowerCase().includes(search.trim().toLowerCase())),[category,search]);
 const connections=hooks?.rows.filter(hook=>(hook.name+" "+endpointLabel(hook.url)).toLowerCase().includes(search.trim().toLowerCase())) || [];
 const allowed=item=>Boolean(current&&hasWorkspacePermission(current.role,item.permission));
 const showCount=(resource,rows)=>!current?"—":!resource.allowed?"Restricted":resource.error?"Unavailable":rows.length;
 return <div className="integration-hub" data-mode={darkMode?"dark":"light"}>
  <header className="integration-hero"><div><span className="integration-kicker">NEXUS / CONNECTION LAYER</span><h1>Great tools.<br/><em>Better together.</em></h1><p>Connect your application. Move your events. Make every part of your stack work in concert.</p><Button variant="contained" endIcon={<ArrowForwardIcon/>} onClick={()=>openRoute("/developer?tab=quickstart")}>Explore the API</Button></div><div className="integration-network" aria-hidden="true"><div className="integration-network-ring"/><div className="integration-network-ring inner"/><span className="network-center">n</span><span className="network-node node-a"><CodeIcon/></span><span className="network-node node-b"><WebhookIcon/></span><span className="network-node node-c"><AutoAwesomeIcon/></span><span className="network-node node-d"><ScheduleIcon/></span><small>ONE WORKSPACE. MANY POSSIBILITIES.</small></div></header>
  <div className="integration-controls"><div><span className="integration-kicker">YOUR CONNECTED WORKSPACE</span><h2>A clearer view of your stack.</h2></div><div><TextField select size="small" label="Workspace" value={ws.workspaceId} onChange={e=>ws.setWorkspaceId(e.target.value)} disabled={ws.loading}>{ws.workspaces.map(w=><MenuItem key={w.id} value={w.id}>{w.name || w.id}</MenuItem>)}</TextField><Button startIcon={<RefreshIcon/>} disabled={ws.loading||data.loading} onClick={()=>{if(ws.error)ws.refresh();else data.refresh();}}>Refresh</Button></div></div>
  {(ws.error||data.error)&&<Alert severity="error">{ws.error||data.error}</Alert>}
  {!ws.loading&&!ws.error&&!ws.workspaces.length&&<Alert severity="info" action={<Button onClick={()=>navigate("/workspace")}>Open workspaces</Button>}>Create or join a workspace to configure connections.</Alert>}
  <div className="integration-metrics">{[["Active credentials",showCount(keys,activeKeys),"Scoped access to your API"],["Enabled destinations",showCount(hooks,activeHooks),"Endpoints accepting workspace events"],["Paused destinations",showCount(hooks,hooks?.rows.filter(h=>!h.enabled)||[]),"Configured, currently disabled"]].map(([label,value,note])=><div key={label}><span>{label}</span><strong>{data.loading?<Skeleton width={65}/>:value}</strong><small>{note}</small></div>)}</div>
  <section className="integration-catalog"><div className="integration-catalog-heading"><div><span className="integration-kicker">BUILD / CONNECT / AUTOMATE</span><h2>Choose your next connection.</h2></div><TextField size="small" label="Search integrations" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="integration-tabs" aria-label="Integration categories">{["All","Build","Connect","Automate"].map(label=><button key={label} aria-pressed={category===label} onClick={()=>setCategory(label)}>{label}</button>)}</div><div className="integration-cards">{visible.map(item=><article key={item.id} className={"integration-card card-"+item.id}><div className="integration-card-top"><span className="integration-symbol">{item.symbol}</span><Chip size="small" label={item.category}/></div><h3>{item.title}</h3><p>{item.description}</p><Button endIcon={<ArrowForwardIcon/>} disabled={!allowed(item)||data.loading} onClick={()=>openRoute(item.route)}>{item.action}</Button>{current&&!allowed(item)&&<small>Ask your workspace owner for access.</small>}</article>)}</div>{!visible.length&&<div className="integration-empty"><h3>No matching tools.</h3><Button onClick={()=>{setSearch("");setCategory("All");}}>Clear filters</Button></div>}</section>
  {keys?.error&&<Alert severity="error" action={<Button onClick={data.refresh}>Retry credentials</Button>}>{keys.error}</Alert>}
  <section className="integration-destinations"><div className="integration-catalog-heading"><div><span className="integration-kicker">LIVE CONFIGURATION</span><h2>Your event destinations.</h2></div><Button disabled={!current||!hooks?.allowed} onClick={()=>openRoute("/developer?tab=webhooks")} endIcon={<ArrowForwardIcon/>}>Delivery controls</Button></div>
   {data.loading?<Skeleton height={130}/>:hooks?.error?<Alert severity="error" action={<Button onClick={data.refresh}>Retry</Button>}>{hooks.error}</Alert>:!current?<p>Select an available workspace to inspect its connections.</p>:!hooks.allowed?<Alert severity="info">Your role cannot view webhook destinations.</Alert>:!connections.length?<div className="integration-empty"><WebhookIcon/><h3>{search?"No matching destinations.":"Your next event starts here."}</h3><p>{search?"Try a different search.":"Configure a signed webhook in Developer Platform, then return here to see its status."}</p><Button disabled={!hasWorkspacePermission(current.role,"webhooks.manage")} onClick={()=>openRoute("/developer?tab=webhooks")}>Set up a destination</Button></div>:<div className="integration-endpoint-list">{connections.map(hook=><div className="integration-endpoint" key={hook.id}><WebhookIcon/><div><strong>{hook.name || "Webhook destination"}</strong><code>{endpointLabel(hook.url)}</code></div><Chip size="small" label={hook.enabled?"Enabled":"Paused"}/><span>{hook.environment || "all"}</span><Button onClick={()=>openRoute("/developer?tab=webhooks")} aria-label={"Manage "+(hook.name||"destination")}>Manage ↗</Button></div>)}</div>}
  </section><footer className="integration-footnote">Connection counts reflect configuration, not successful delivery. Inspect delivery history in Developer Platform.</footer>
 </div>;
}