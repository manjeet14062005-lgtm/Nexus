const test=require("node:test"),assert=require("node:assert/strict");
const {createWorkspaceManagement,settingsInput}=require("./workspaceManagement");
function setup({role="owner",configured=true,sendFails=false,invite={workspaceId:"one",invitedEmail:"guest@example.test",workspaceName:"Team",role:"viewer",status:"pending"}}={}) {
 let record={...invite};const writes=[],emails=[];
 const snap=()=>({exists:true,data:()=>record});
 const ref={get:async()=>snap(),set:async(value)=>{writes.push(value);record={...record,...value};}};
 const store={collection:()=>({doc:()=>ref,where:()=>({get:async()=>({docs:[{id:"invite",data:()=>record}]})})}),runTransaction:async fn=>fn({get:async()=>snap(),set:(_ref,value)=>{writes.push(value);record={...record,...value};}})};
 const service=createWorkspaceManagement({db:()=>store,membership:async()=>({role,workspace:{name:"Team"}}),emailConfigured:()=>configured,frontendUrl:()=>"https://nexus.example.test",sendEmail:async payload=>{emails.push(payload);if(sendFails)throw new Error("provider failure");return "mail-id";}});
 return {service,writes,emails};
}
test("workspace settings reject invalid lengths and normalize input",()=>{
 assert.deepEqual(settingsInput({name:" Team ",description:" Focus "}),{name:"Team",description:"Focus"});
 assert.throws(()=>settingsInput({name:""}));assert.throws(()=>settingsInput({name:"x".repeat(81)}));assert.throws(()=>settingsInput({name:"Team",description:"x".repeat(501)}));
});
test("viewers cannot change settings, list invites, send email or revoke invites",async()=>{
 const {service,writes,emails}=setup({role:"viewer"});
 for(const action of ["update","list","deliver","revoke"])await assert.rejects(()=>service[action]({workspaceId:"one",uid:"viewer",inviteId:"invite",input:{name:"Team"}}),err=>err.status===403);
 assert.equal(writes.length,0);assert.equal(emails.length,0);
});
test("invitation IDs are checked against the requested workspace",async()=>{
 const {service,writes,emails}=setup();
 for(const action of ["deliver","revoke"])await assert.rejects(()=>service[action]({workspaceId:"other",uid:"owner",inviteId:"invite"}),err=>err.status===404);
 assert.equal(writes.length,0);assert.equal(emails.length,0);
});
test("revoked or accepted invitations cannot be resent or revoked again",async()=>{
 for(const status of ["accepted","revoked"]) {
 const {service}=setup({invite:{workspaceId:"one",status}});
 for(const action of ["deliver","revoke"])await assert.rejects(()=>service[action]({workspaceId:"one",uid:"owner",inviteId:"invite"}),err=>err.status===409);
 }
});
test("missing email configuration is explicit and preserves the in-app invitation",async()=>{
 const {service,writes,emails}=setup({configured:false});
 assert.equal((await service.deliver({workspaceId:"one",uid:"owner",inviteId:"invite"})).emailStatus,"not_configured");
 assert.equal(writes.length,0);assert.equal(emails.length,0);
});
test("provider request uses only the stored recipient and starts a resend cooldown",async()=>{
 const {service,emails,writes}=setup();
 const result=await service.deliver({workspaceId:"one",uid:"owner",inviteId:"invite"});
 assert.equal(result.emailStatus,"requested");assert.deepEqual(emails[0].recipients,["guest@example.test"]);
 assert.match(emails[0].text,/https:\/\/nexus.example.test\/workspace/);assert.ok(writes.some(write=>write.emailId==="mail-id"));
 await assert.rejects(()=>service.deliver({workspaceId:"one",uid:"owner",inviteId:"invite"}),err=>err.status===429);
});
test("email failures report failed delivery without destroying invitations",async()=>{
 const {service,writes}=setup({sendFails:true});
 assert.equal((await service.deliver({workspaceId:"one",uid:"owner",inviteId:"invite"})).emailStatus,"failed");
 assert.ok(writes.some(write=>write.emailStatus==="failed"));
});
test("revocation records the authenticated actor and blocks later email requests",async()=>{
 const {service,writes}=setup();
 await service.revoke({workspaceId:"one",uid:"owner",inviteId:"invite"});
 assert.equal(writes[0].revokedByUid,"owner");
 await assert.rejects(()=>service.deliver({workspaceId:"one",uid:"owner",inviteId:"invite"}),err=>err.status===409);
});