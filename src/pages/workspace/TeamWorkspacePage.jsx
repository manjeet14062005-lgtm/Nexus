import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Alert, Avatar, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, Switch, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import RefreshIcon from "@mui/icons-material/Refresh";
import { toast } from "react-hot-toast";
import { apiRequest, apiDownload } from "../../services/apiClient";
import { hasWorkspacePermission, labelWorkspaceRole, WORKSPACE_ROLES, ROLE_PERMISSIONS, permissionLabel } from "../../lib/workspacePermissions";
import { WorkspaceReauthentication } from "../../components/common/WorkspaceReauthentication";
import { useOperationResource, useOperationWorkspaces } from "../operations/useOperationsData";
import { useUserProfile } from "../../contexts/UserProfileContext";
import "./workspace.css";

const manageableRoles=WORKSPACE_ROLES.filter(role=>role!=="owner");
const tabs=["Members","Invitations","Activity","Permissions","Settings"];
export function filterMembers(rows,search,role) {
 const term=search.trim().toLowerCase();
 return rows.filter(member=>(role==="all"||String(member.role||"").toLowerCase()===role)&&(String(member.name||"")+" "+String(member.email||"")).toLowerCase().includes(term));
}
function LoadState({resource,children,empty}) {
 if(resource.loading&&!resource.data)return <div className="ws-loading"><Skeleton height={65}/><Skeleton height={65}/><Skeleton height={65}/></div>;
 if(resource.error)return <Alert severity="error" action={<Button onClick={resource.refresh}>Retry</Button>}>{resource.error}</Alert>;
 if(!resource.data)return <p className="ws-note">{empty || "Select a workspace to continue."}</p>;
 return children;
}
function useWorkspaceResource(user,id,path,enabled=true) {
 const loader=useCallback(signal=>apiRequest(user,"/workspaces/"+encodeURIComponent(id)+path,{signal}),[user,id,path]);
 return useOperationResource(user?.uid&&id&&enabled?user.uid+":"+id+":"+path:"",loader);
}
export function TeamWorkspacePage({user,darkMode}) {
 const {profile}=useUserProfile();
 const [params]=useSearchParams(), returnedWorkspace=params.get("reauthWorkspace"), restored=useRef("");
 const ws=useOperationWorkspaces(user),id=ws.workspaceId,role=ws.workspace?.role;
 const {workspaces:availableWorkspaces,setWorkspaceId:selectWorkspace}=ws;
 const members=useWorkspaceResource(user,id,"/members"),activity=useWorkspaceResource(user,id,"/activity?limit=100"),branding=useWorkspaceResource(user,id,"/branding");
 const manage=hasWorkspacePermission(role,"members.invite"),owner=hasWorkspacePermission(role,"workspace.delete");
 const outgoing=useWorkspaceResource(user,id,"/invites",manage);
 const incomingLoader=useCallback(signal=>apiRequest(user,"/workspace-invites",{signal}),[user]);
 const incoming=useOperationResource(user?.uid?user.uid+":incoming":"",incomingLoader);
 const [tab,setTab]=useState("Members"),[search,setSearch]=useState(""),[roleFilter,setRoleFilter]=useState("all"),[activitySearch,setActivitySearch]=useState(""),[workspaceSearch,setWorkspaceSearch]=useState("");
 const [dialog,setDialog]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reauth,setReauth]=useState(false),[verified,setVerified]=useState(false);
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[email,setEmail]=useState(""),[inviteRole,setInviteRole]=useState("viewer");
 const [settings,setSettings]=useState({name:"",description:""}),[brand,setBrand]=useState({enabled:false,brandName:"",logoUrl:"",accentColor:"#627a99"}),[brandDirty,setBrandDirty]=useState(false),[settingsDirty,setSettingsDirty]=useState(false);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(tab!=="Invitations")return;setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[tab]);
 const lock=useRef(false),context=useRef("");context.current=(user?.uid||"")+":"+id;
 useEffect(()=>{setDialog(null);setError("");setSearch("");setRoleFilter("all");setReauth(false);setVerified(false);setSettingsDirty(false);setBrandDirty(false);setSettings({name:ws.workspace?.name||"",description:ws.workspace?.description||""});setBrand({enabled:false,brandName:"",logoUrl:"",accentColor:"#627a99"});},[id,user?.uid,ws.workspace?.name,ws.workspace?.description]);
 useEffect(()=>{const saved=branding.data?.branding;if(saved&&!brandDirty)setBrand({enabled:Boolean(saved.enabled),brandName:saved.brandName||"",logoUrl:saved.logoUrl||"",accentColor:saved.accentColor||"#627a99"});},[branding.data,brandDirty]);
 useEffect(()=>{if(returnedWorkspace&&restored.current!==returnedWorkspace&&availableWorkspaces.some(row=>row.id===returnedWorkspace)){restored.current=returnedWorkspace;selectWorkspace(returnedWorkspace);setTab("Settings");}},[returnedWorkspace,availableWorkspaces,selectWorkspace]);
 const rows=useMemo(()=>(members.data?.members||[]).map(member=>{
  const own=member.uid===user?.uid, current=own&&profile?.submitterUid===user?.uid?profile:null;
  const name=current?.name || (own?(user.displayName || user.user_metadata?.full_name || user.user_metadata?.name):"") || member.name;
  return {...member,name:name&&name.toLowerCase()!==String(member.email||"").toLowerCase()&&name!==member.uid?name:"Team member",avatar:current?(current.photoUrl??""):(own?(user.photoURL || user.user_metadata?.avatar_url || user.user_metadata?.picture || member.avatar || ""):(member.avatar || member.photoUrl || "")),role:WORKSPACE_ROLES.includes(String(member.role||"").toLowerCase())?String(member.role).toLowerCase():"viewer"};
 }),[members.data,profile,user]),invites=outgoing.data?.invites||[],events=activity.data?.activity||[];
 const visible=useMemo(()=>filterMembers(rows,search,roleFilter),[rows,search,roleFilter]);
 const paths="/workspaces/"+encodeURIComponent(id);
 async function mutate(callback,{refresh=true}={}) {
  if(lock.current)return;lock.current=true;setBusy(true);setError("");const start=context.current;
  try {
   const result=await callback();
   if(context.current!==start)return;
   if(refresh)await Promise.all([members.refresh(),activity.refresh(),outgoing.refresh(),ws.refresh()]);
   if(context.current===start)setDialog(null);
   return result;
  } catch(err){
   if(context.current===start) {
    if(err.data?.code==="RECENT_AUTH_REQUIRED"){setReauth(true);setVerified(false);}
    else {setError(err.message||"Unable to complete this action.");toast.error(err.message||"Unable to complete this action.");}
   }
  } finally{lock.current=false;setBusy(false);}
 }
 function open(value){setDialog(value);setError("");setReauth(false);setVerified(false);}
 async function create() {
  if(!name.trim())return;
  await mutate(async()=>{
   const result=await apiRequest(user,"/workspaces",{method:"POST",body:JSON.stringify({name:name.trim(),description:description.trim()})});
   setName("");setDescription("");toast.success("Workspace created.");await ws.refresh();
   if(result.workspace?.id)ws.setWorkspaceId(result.workspace.id);
  },{refresh:false});
 }
 async function invite() {
  if(!manage)return;
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError("Enter a valid email address.");return;}
  await mutate(async()=>{
   const result=await apiRequest(user,paths+"/invites",{method:"POST",body:JSON.stringify({email:email.trim(),role:inviteRole})});
   if(result.emailStatus==="requested")toast.success("Invitation saved. Email accepted by the provider.");
   else toast(result.message || "Invitation saved in Nexus. The recipient can accept after signing in.");
   setEmail("");
  });
 }
 async function confirmAction() {
  const action=dialog;
  if(!action)return;
  if(action.kind==="delete") {
   if(!owner||reauth)return;
   await mutate(async()=>{await apiRequest(user,paths,{method:"DELETE"});toast.success("Workspace deleted.");await ws.refresh();},{refresh:false});
  } else if(action.kind==="remove" && manage) {
   await mutate(async()=>{await apiRequest(user,paths+"/members/"+encodeURIComponent(action.member.id),{method:"DELETE"});toast.success("Member removed.");});
  } else if(action.kind==="role" && manage) {
   await mutate(async()=>{await apiRequest(user,paths+"/members/"+encodeURIComponent(action.member.id),{method:"PATCH",body:JSON.stringify({role:action.role})});toast.success("Role updated.");});
  } else if(action.kind==="revoke" && manage) {
   await mutate(async()=>{await apiRequest(user,paths+"/invites/"+encodeURIComponent(action.invite.id),{method:"DELETE"});toast.success("Invitation revoked.");});
  }
 }
 async function saveSettings() {
  if(!manage||!settings.name.trim()||settings.name.length>80||settings.description.length>500)return;
  await mutate(async()=>{await apiRequest(user,paths,{method:"PATCH",body:JSON.stringify(settings)});setSettingsDirty(false);await ws.refresh();toast.success("Workspace settings saved.");},{refresh:false});
 }
 async function saveBranding() {
  if(!manage||!branding.data?.branding?.available)return;
  if(!/^#[0-9a-f]{6}$/i.test(brand.accentColor)){setError("Use a six-digit hex accent color.");return;}
  if(brand.logoUrl){try{const url=new URL(brand.logoUrl);if(url.protocol!=="https:"||url.username||url.password)throw new Error();}catch(_){setError("Use an HTTPS logo URL without embedded credentials.");return;}}
  await mutate(async()=>{await apiRequest(user,paths+"/branding",{method:"PATCH",body:JSON.stringify(brand)});setBrandDirty(false);await branding.refresh();toast.success("Branding saved.");},{refresh:false});
 }
 async function exportWorkspace() {
  if(!hasWorkspacePermission(role,"workspace.export"))return;
  await mutate(async()=>{
   const blob=await apiDownload(user,paths+"/export.json"),url=URL.createObjectURL(blob);
   const anchor=document.createElement("a");anchor.href=url;anchor.download="nexus-workspace-"+id+".json";document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);toast.success("Export created.");
  },{refresh:false});
 }
 const updateBrand=(key,value)=>{setBrandDirty(true);setBrand(current=>({...current,[key]:value}));};
 const changeWorkspace=value=>{if(busy)return;if(settingsDirty||brandDirty){open({kind:"switch",id:value});return;}ws.setWorkspaceId(value);};
 if(!user)return <Navigate to="/"/>;
 return <div className="workspace-studio" data-mode={darkMode?"dark":"light"}>
  <header className="ws-hero"><div><span className="ws-kicker">NEXUS / TEAM SPACE</span><h1>Built together.<br/><em>Better together.</em></h1><p>The right people. The right access. One workspace for everything you’re building next.</p><Button variant="contained" startIcon={<AddIcon/>} onClick={()=>open({kind:"create"})} disabled={busy}>New Workspace</Button></div><div className="ws-art" aria-hidden="true"><div className="ws-art-grid"/><span className="ws-art-center">n</span><span className="ws-art-person person-one">01</span><span className="ws-art-person person-two">02</span><span className="ws-art-person person-three">03</span><small>ONE TEAM. SHARED POSSIBILITIES.</small></div></header>
  <div className="ws-metrics">{[["Your workspaces",ws.loading?"—":ws.error?"Unavailable":ws.workspaces.length,"Spaces you belong to"],["Workspace members",members.loading?"—":members.error?"Unavailable":rows.length,"People with access"],["Incoming invitations",incoming.loading?"—":incoming.error?"Unavailable":incoming.data?.invites?.length||0,"Awaiting your response"],["Your access",role?labelWorkspaceRole(role):"—","For the selected workspace"]].map(([label,value,note])=><div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
  {ws.error&&<Alert severity="error" action={<Button onClick={ws.refresh}>Retry workspaces</Button>}>{ws.error}</Alert>}
  <section className="ws-layout"><aside className="ws-sidebar"><span className="ws-kicker">YOUR SPACES</span><TextField fullWidth size="small" label="Search workspaces" value={workspaceSearch} onChange={e=>setWorkspaceSearch(e.target.value)}/>{ws.loading?<Skeleton height={100}/>:!ws.workspaces.length?<p>Create your first workspace to invite your team.</p>:ws.workspaces.filter(w=>(w.name+" "+(w.description||"")).toLowerCase().includes(workspaceSearch.trim().toLowerCase())).map(w=><button disabled={busy} key={w.id} aria-pressed={id===w.id} onClick={()=>changeWorkspace(w.id)}><span className="ws-monogram">{(w.name||"N")[0].toUpperCase()}</span><span><strong>{w.name||"Workspace"}</strong><small>{labelWorkspaceRole(w.role)}</small></span><span className="ws-arrow">↗</span></button>)}<div className="ws-sidebar-note">Membership defines access.<br/>Workspace roles keep it intentional.</div></aside>
   <div className="ws-main">{id?<><div className="ws-workspace-heading"><div><span className="ws-kicker">YOUR ACTIVE WORKSPACE</span><h2>{ws.workspace?.name||"Workspace"}</h2><p>{ws.workspace?.description||"Add a description in Settings to help your team find its focus."}</p></div><div className="ws-header-actions"><Button aria-label="Refresh workspace" disabled={busy||members.loading||activity.loading} onClick={()=>Promise.all([members.refresh(),activity.refresh(),branding.refresh(),outgoing.refresh(),incoming.refresh()])}><RefreshIcon/></Button>{hasWorkspacePermission(role,"workspace.export")&&<Button disabled={busy} onClick={exportWorkspace}>Export</Button>}{manage&&<Button variant="contained" startIcon={<PersonAddIcon/>} disabled={busy} onClick={()=>open({kind:"invite"})}>Invite</Button>}</div></div>
   <nav className="ws-tabs" aria-label="Workspace sections">{tabs.map(label=><button key={label} disabled={busy} aria-pressed={tab===label} onClick={()=>{setTab(label);setError("");}}>{label}</button>)}</nav>
   <div className="ws-content">{error&&!dialog&&<Alert severity="error">{error}</Alert>}
    {tab==="Members"&&<><div className="ws-section-heading"><div><span className="ws-kicker">THE PEOPLE BEHIND THE WORK</span><h3>Your team, in focus.</h3></div><Chip label={members.loading?"Loading":rows.length+" member"+(rows.length===1?"":"s")} size="small"/></div><div className="ws-toolbar"><TextField size="small" label="Search members" value={search} onChange={e=>setSearch(e.target.value)}/><TextField select size="small" label="Filter by role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><MenuItem value="all">All roles</MenuItem>{WORKSPACE_ROLES.map(r=><MenuItem key={r} value={r}>{labelWorkspaceRole(r)}</MenuItem>)}</TextField></div><LoadState resource={members}>{!visible.length?<div className="ws-empty"><h3>{rows.length?"No matching members.":"Your team starts here."}</h3><p>{rows.length?"Try a different name, email or role.":"Invite teammates when you’re ready to collaborate."}</p></div>:visible.map(member=><div className="ws-member" key={member.id}><Avatar src={member.avatar||""}>{(member.name||member.email||"N")[0].toUpperCase()}</Avatar><div className="ws-member-info"><strong>{member.name||member.email||"Team member"} {member.uid===user.uid&&<small>You</small>}</strong><span>{member.email||"Email unavailable"}</span></div>{manage&&member.role!=="owner"?<><TextField select size="small" label={"Role for "+(member.name||member.email||"member")} value={member.role||"viewer"} disabled={busy} onChange={e=>open({kind:"role",member,role:e.target.value})}>{manageableRoles.map(r=><MenuItem key={r} value={r}>{labelWorkspaceRole(r)}</MenuItem>)}</TextField><Button color="error" disabled={busy} onClick={()=>open({kind:"remove",member})}>Remove</Button></>:<Chip label={labelWorkspaceRole(member.role)} size="small"/>}</div>)}</LoadState></>}
    {tab==="Invitations"&&<><div className="ws-section-heading"><div><span className="ws-kicker">MAKE ROOM FOR WHAT’S NEXT</span><h3>Every team starts with an invitation.</h3></div></div><h4>Invitations for you</h4><LoadState resource={incoming}>{!(incoming.data?.invites||[]).length?<p className="ws-note">You have no pending invitations.</p>:(incoming.data.invites).map(invite=><div className="ws-invitation" key={invite.id}><div><strong>{invite.workspaceName||"Workspace"}</strong><small>Invited as {labelWorkspaceRole(invite.role)}</small></div><Button disabled={busy} onClick={()=>mutate(async()=>{const result=await apiRequest(user,"/workspace-invites/"+encodeURIComponent(invite.id)+"/accept",{method:"POST"});await ws.refresh();await incoming.refresh();ws.setWorkspaceId(result.workspaceId);toast.success("Invitation accepted.");},{refresh:false})}>Accept invite</Button></div>)}</LoadState><h4>Sent from this workspace</h4>{!manage?<Alert severity="info">Ask an owner or admin to manage workspace invitations.</Alert>:<LoadState resource={outgoing}>{!invites.length?<div className="ws-empty"><h3>A seat at the table.</h3><p>Create an invitation to bring someone into this workspace.</p><Button disabled={busy} onClick={()=>open({kind:"invite"})}>Invite a teammate</Button></div>:invites.map(invite=><div className="ws-invitation" key={invite.id}><div><strong>{invite.invitedEmail}</strong><small>{labelWorkspaceRole(invite.role)} · {invite.status} · {invite.emailStatus==="requested"?"Email requested":invite.emailStatus==="failed"?"Email request failed":"Available in Nexus"}</small></div>{invite.status==="pending"&&<><Button disabled={busy || Boolean((invite.emailRequestedAt||invite.emailAttemptedAt)&&now-new Date(invite.emailRequestedAt||invite.emailAttemptedAt).getTime()<60000)} onClick={()=>mutate(async()=>{const result=await apiRequest(user,paths+"/invites/"+encodeURIComponent(invite.id)+"/email",{method:"POST"});toast(result.message||"Email requested.");})}>Request email</Button><Button color="error" disabled={busy} onClick={()=>open({kind:"revoke",invite})}>Revoke</Button></>}</div>)}</LoadState>}</>}
    {tab==="Activity"&&<><div className="ws-section-heading"><div><span className="ws-kicker">A SHARED HISTORY</span><h3>The story of your workspace.</h3></div></div><TextField size="small" fullWidth label="Search activity" value={activitySearch} onChange={e=>setActivitySearch(e.target.value)}/><LoadState resource={activity}>{!events.length?<div className="ws-empty"><h3>A fresh start.</h3><p>Recorded workspace activity will appear here.</p></div>:<div className="ws-timeline">{events.filter(event=>(event.message+" "+event.actor).toLowerCase().includes(activitySearch.trim().toLowerCase())).map(event=><div key={event.id}><i/><strong>{event.message}</strong><small>{event.actor||"Nexus"} · {event.createdAt?new Date(event.createdAt).toLocaleString():"Time unavailable"}</small></div>)}</div>}</LoadState></>}
    {tab==="Permissions"&&<><div className="ws-section-heading"><div><span className="ws-kicker">ACCESS WITH INTENTION</span><h3>A role for every responsibility.</h3></div></div><p className="ws-note">Your current role is {labelWorkspaceRole(role)}. Role permissions are enforced by Nexus.</p><div className="ws-role-cards">{WORKSPACE_ROLES.map(r=><details key={r} open={r===role}><summary><strong>{labelWorkspaceRole(r)}</strong><span>{ROLE_PERMISSIONS[r].length} permissions {r===role?"· Your role":""}</span></summary><div>{Object.entries(ROLE_PERMISSIONS[r].reduce((groups,permission)=>{const group=permission.split(".")[0].replaceAll("_"," ");return {...groups,[group]:[...(groups[group]||[]),permission]};},{})).map(([group,permissions])=><div key={group}><h4>{group}</h4>{permissions.map(p=><p key={p}>{permissionLabel(p)}</p>)}</div>)}</div></details>)}</div></>}
    {tab==="Settings"&&<><div className="ws-section-heading"><div><span className="ws-kicker">MAKE THIS SPACE YOURS</span><h3>A thoughtful home for your team.</h3></div></div><div className="ws-settings-fields"><TextField fullWidth label="Workspace name" value={settings.name} disabled={!manage||busy} inputProps={{maxLength:80}} onChange={e=>{setSettingsDirty(true);setSettings({...settings,name:e.target.value});}}/><TextField fullWidth multiline minRows={3} label="Workspace description" value={settings.description} disabled={!manage||busy} inputProps={{maxLength:500}} onChange={e=>{setSettingsDirty(true);setSettings({...settings,description:e.target.value});}}/><Button variant="contained" disabled={!manage||busy||!settingsDirty||!settings.name.trim()} onClick={saveSettings}>Save settings</Button></div><h4>Workspace branding</h4><LoadState resource={branding}>{!branding.data?.branding?.available?<Alert severity="info">Workspace branding is not included in this workspace’s current plan.</Alert>:<div className="ws-settings-fields"><label className="ws-brand-toggle">Use workspace branding<Switch checked={brand.enabled} disabled={!manage||busy} onChange={e=>updateBrand("enabled",e.target.checked)}/></label><TextField label="Brand name" value={brand.brandName} disabled={!manage||busy} inputProps={{maxLength:80}} onChange={e=>updateBrand("brandName",e.target.value)}/><TextField label="Accent color" value={brand.accentColor} disabled={!manage||busy} onChange={e=>updateBrand("accentColor",e.target.value)}/><TextField label="Logo URL (HTTPS)" value={brand.logoUrl} disabled={!manage||busy} onChange={e=>updateBrand("logoUrl",e.target.value)}/><Button variant="contained" disabled={!manage||busy||!brandDirty} onClick={saveBranding}>Save branding</Button></div>}</LoadState>{owner&&<div className="ws-danger"><div><h4>Delete workspace</h4><p>Permanently remove this workspace and its workspace data. Account-level billing records remain.</p></div><Button color="error" variant="outlined" disabled={busy} onClick={()=>open({kind:"delete"})}>Delete</Button></div>}</>}
   </div></>:<div className="ws-empty"><h2>A space for your next chapter.</h2><p>Create or join a workspace to get started.</p></div>}</div>
  </section><footer className="ws-footer">Shared work. Intentional access. A place to build together.</footer>
  {dialog && <Dialog open={Boolean(dialog)} onClose={()=>{if(!busy)setDialog(null);}} className="ws-dialog" data-mode={darkMode?"dark":"light"} fullWidth maxWidth="sm"><DialogTitle>{dialog?.kind==="create"?"Create workspace":dialog?.kind==="invite"?"Invite a teammate":dialog?.kind==="remove"?"Remove this member?":dialog?.kind==="role"?"Change workspace access?":dialog?.kind==="revoke"?"Revoke this invitation?":dialog?.kind==="switch"?"Discard unsaved changes?":"Delete "+(ws.workspace?.name||"workspace")+"?"}</DialogTitle><DialogContent>
   {dialog?.kind==="create"&&<><p>Give your team a place to build together.</p><TextField fullWidth autoFocus label="Workspace name" value={name} inputProps={{maxLength:80}} disabled={busy} onChange={e=>setName(e.target.value)}/><TextField fullWidth multiline minRows={3} label="Description (optional)" value={description} inputProps={{maxLength:500}} disabled={busy} onChange={e=>setDescription(e.target.value)}/></>}
   {dialog?.kind==="invite"&&<><p>This invitation will appear in the recipient’s Nexus account. Email is requested when an email provider is configured.</p><TextField fullWidth autoFocus type="email" label="Email address" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/><TextField fullWidth select label="Workspace role" value={inviteRole} disabled={busy} onChange={e=>setInviteRole(e.target.value)}>{manageableRoles.map(r=><MenuItem key={r} value={r}>{labelWorkspaceRole(r)}</MenuItem>)}</TextField><Alert severity="info">{labelWorkspaceRole(inviteRole)} receives {ROLE_PERMISSIONS[inviteRole].length} permissions. Review the Permissions tab for details.</Alert></>}
   {dialog?.kind==="remove"&&<p>{dialog.member.name||dialog.member.email} will lose access to {ws.workspace?.name}. Existing account data will remain.</p>}
   {dialog?.kind==="role"&&<p>{dialog.member.name||dialog.member.email} will change from {labelWorkspaceRole(dialog.member.role)} to {labelWorkspaceRole(dialog.role)}. This changes their workspace access.</p>}
   {dialog?.kind==="revoke"&&<p>{dialog.invite.invitedEmail} will no longer be able to accept this invitation.</p>}
   {dialog?.kind==="switch"&&<p>Your unsaved workspace settings or branding changes will be discarded.</p>}
   {dialog?.kind==="delete"&&<><Alert severity="warning">This cannot be undone. Workspace verification, API, workflow, reporting and security data will be removed.</Alert>{verified&&<Alert severity="success">Identity verified. Review the workspace, then confirm deletion.</Alert>}{reauth&&<WorkspaceReauthentication user={user} workspaceId={id} onVerified={()=>{setReauth(false);setVerified(true);}}/>}</>}
   {error&&<Alert severity="error">{error}</Alert>}
  </DialogContent><DialogActions><Button disabled={busy} onClick={()=>setDialog(null)}>Cancel</Button><Button variant="contained" disabled={busy||reauth||(dialog?.kind==="create"&&!name.trim())||(dialog?.kind==="invite"&&!email.trim())} color={["delete","remove","revoke"].includes(dialog?.kind)?"error":"primary"} onClick={()=>dialog.kind==="create"?create():dialog.kind==="invite"?invite():dialog.kind==="switch"?(setDialog(null),ws.setWorkspaceId(dialog.id)):confirmAction()}>{busy?"Working…":dialog?.kind==="create"?"Create workspace":dialog?.kind==="invite"?"Create invitation":dialog?.kind==="delete"?"Delete permanently":dialog?.kind==="switch"?"Discard & switch":"Confirm"}</Button></DialogActions></Dialog>}
 </div>;
}
