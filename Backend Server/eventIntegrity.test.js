const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function load(file,mocks){const sandbox={module:{exports:{}},require:name=>mocks[name]||require(name),Date,console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),sandbox);return sandbox.module.exports;}
test('API audit filter isolates its source, preserves request details and tolerates bad legacy timestamps',async()=>{
 const queried=[];const db={collection(name){queried.push(name);return this;},doc(){return this;},where(){return this;},orderBy(){return this;},limit(){return this;},async get(){return {docs:[{id:'bad',data:()=>({createdAt:'bad',method:'GET',path:'/health',statusCode:200,apiKeyId:'key-id',latencyMs:12})}]};}};
 const audit=load('auditLog.js',{'./supabaseAdmin':{adminDb:()=>db}});const events=await audit.listAuditEvents('workspace',{source:'api'});
 assert.deepEqual(queried,['workspaces','apiLogs']);assert.equal(events[0].createdAt,null);assert.equal(events[0].actor,'API client');assert.equal(events[0].apiKeyId,'key-id');assert.equal(events[0].latencyMs,12);
 await assert.rejects(audit.listAuditEvents('workspace',{source:'unknown'}),/Invalid audit source/);
 assert.ok(audit.buildAuditCsv([{message:'=1+1',actor:'user'}]).includes("'=1+1"));
});
test('membership and its audit event share one transaction; failed commit leaves both unchanged',async()=>{
 const rows=new Map([['workspaceMembers/member',{workspaceId:'space',uid:'member',role:'viewer',email:'member@example.test'}]]);
 let rejectCommit=false,commits=0;
 const db={collection(collection){return {doc:id=>{const key=collection+'/'+(id||'event');return {key,async get(){return {exists:rows.has(key),data:()=>rows.get(key)};}};}};},async runTransaction(run){const changes=[];const result=await run({get:ref=>ref.get(),set:(ref,data)=>changes.push([ref.key,data])});if(rejectCommit)throw new Error('Commit rejected');for(const [key,data] of changes)rows.set(key,{...rows.get(key),...data});commits++;return result;}};
 const workspace=load('workspaceAdmin.js',{'./supabaseAdmin':{adminDb:()=>db,supabaseAdmin:{}},'./auth':{getWorkspaceMembership:async()=>({role:'owner',workspace:{ownerUid:'owner'}})},'./plans':{getPlan:()=>({})}});
 rejectCommit=true;await assert.rejects(workspace.changeMemberRole({workspaceId:'space',memberId:'member',actorUid:'owner',role:'admin'}),/Commit rejected/);
 assert.equal(rows.get('workspaceMembers/member').role,'viewer');assert.equal(rows.has('workspaceActivity/event'),false);assert.equal(commits,0);
 rejectCommit=false;await workspace.changeMemberRole({workspaceId:'space',memberId:'member',actorUid:'owner',role:'admin'});
 assert.equal(rows.get('workspaceMembers/member').role,'admin');assert.equal(rows.get('workspaceActivity/event').action,'workspace.member_role_changed');assert.equal(commits,1);
});
