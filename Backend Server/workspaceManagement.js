function fail(message,status=400,code="INVALID_WORKSPACE_ACTION"){throw Object.assign(new Error(message),{status,code});}
function settingsInput(input) {
 const name=String(input?.name || "").trim(),description=String(input?.description || "").trim();
 if(!name || name.length>80)fail("Use a workspace name between 1 and 80 characters.");
 if(description.length>500)fail("Keep the description within 500 characters.");
 return {name,description};
}
function createWorkspaceManagement({db,membership,sendEmail,emailConfigured,frontendUrl}) {
 async function access(workspaceId,uid,roles=["owner","admin"]) {
  const actor=await membership(uid,workspaceId);
  if(!actor || !roles.includes(actor.role))fail("Your workspace role cannot perform this action.",403,"FORBIDDEN");
  return actor;
 }
 async function list({workspaceId,uid}) {
  await access(workspaceId,uid);
  const snap=await db().collection("workspaceInvites").where("workspaceId","==",workspaceId).get();
  return snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,200);
 }
 async function revoke({workspaceId,uid,inviteId}) {
  await access(workspaceId,uid);
  const ref=db().collection("workspaceInvites").doc(inviteId);
  await db().runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists||snap.data().workspaceId!==workspaceId)fail("Invitation not found.",404,"NOT_FOUND");
   if(snap.data().status!=="pending")fail("Only pending invitations can be revoked.",409,"INVITE_NOT_PENDING");
   tx.set(ref,{status:"revoked",revokedAt:new Date().toISOString(),revokedByUid:uid},{merge:true});
  });
  return {revoked:true};
 }
 async function deliver({workspaceId,uid,inviteId}) {
  const actor=await access(workspaceId,uid);
  const ref=db().collection("workspaceInvites").doc(inviteId),snap=await ref.get();
  if(!snap.exists||snap.data().workspaceId!==workspaceId)fail("Invitation not found.",404,"NOT_FOUND");
  const invite=snap.data();
  if(invite.status!=="pending")fail("Only pending invitations can be emailed.",409,"INVITE_NOT_PENDING");
  if(invite.emailRequestedAt && Date.now()-new Date(invite.emailRequestedAt).getTime()<60000)fail("Wait one minute before requesting another invitation email.",429,"INVITE_COOLDOWN");
  if(!emailConfigured()) return {emailStatus:"not_configured",message:"Invitation is available in Nexus. Email delivery is not configured."};
  const base=String(frontendUrl()||"").split(",")[0].trim();
  let url;
  try {url=new URL("/workspace",base);if(!["https:","http:"].includes(url.protocol))throw new Error();}
  catch(_){fail("A frontend URL is required for invitation emails.",503,"INVITE_URL_UNAVAILABLE");}
  await db().runTransaction(async tx=>{
   const latest=await tx.get(ref);
   if(!latest.exists||latest.data().workspaceId!==workspaceId)fail("Invitation not found.",404,"NOT_FOUND");
   const row=latest.data();
   if(row.status!=="pending")fail("Only pending invitations can be emailed.",409,"INVITE_NOT_PENDING");
   if(row.emailAttemptedAt && Date.now()-new Date(row.emailAttemptedAt).getTime()<60000)fail("Wait one minute before requesting another invitation email.",429,"INVITE_COOLDOWN");
   tx.set(ref,{emailAttemptedAt:new Date().toISOString()},{merge:true});
  });
  try {
   const emailId=await sendEmail({recipients:[invite.invitedEmail],subject:"You are invited to "+(invite.workspaceName || "a Nexus workspace"),text:"You have been invited to "+(actor.workspace?.name || invite.workspaceName || "a Nexus workspace")+" as "+invite.role+".\n\nSign in or create a Nexus account using "+invite.invitedEmail+", then open your workspace invitations to accept:\n"+url.href+"\n\nThis email does not grant access until you accept the invitation."});
   await ref.set({emailStatus:"requested",emailRequestedAt:new Date().toISOString(),emailId},{merge:true});
   return {emailStatus:"requested",message:"Invitation email accepted by the email provider."};
  } catch(err) {
   await ref.set({emailStatus:"failed",emailFailedAt:new Date().toISOString()},{merge:true});
   return {emailStatus:"failed",message:"Invitation is saved in Nexus, but the email could not be requested. Try again later."};
  }
 }
 async function update({workspaceId,uid,input}) {
  await access(workspaceId,uid);const changes=settingsInput(input);
  await db().collection("workspaces").doc(workspaceId).set({...changes,updatedAt:new Date().toISOString()},{merge:true});
  return changes;
 }
 return {list,revoke,deliver,update};
}
module.exports={createWorkspaceManagement,settingsInput};
