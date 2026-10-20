const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const {createResponseTimeout} = require('./responseTimeout');
function timeoutFor(method,path,options) {
 let timeout,called=false;
 createResponseTimeout(options)({method,path},{setTimeout:value=>{timeout=value;}},()=>{called=true;});
 assert.equal(called,true);return timeout;
}
test('investigation transport outlasts its hard deadline but stays below the client deadline',()=>{
 const timeout=timeoutFor('POST','/workspaces/team/intelligence');
 assert.ok(timeout>85000);assert.ok(timeout<100000);
});
test('ordinary reads, writes and lookalike routes retain the normal timeout',()=>{
 for(const [method,path] of [['GET','/workspaces/team/intelligence'],['GET','/workspaces/team/intelligence/usage'],['POST','/auth/check-email'],['POST','/workspaces/team/intelligence/extra'],['POST','/other/workspaces/team/intelligence']])assert.equal(timeoutFor(method,path),30000);
 assert.equal(timeoutFor('GET','/billing/state',{defaultTimeoutMs:60000}),60000);
 assert.equal(timeoutFor('POST','/workspaces/team/intelligence',{defaultTimeoutMs:120000}),120000);
});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const get=(port,method,path)=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,method,path},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end();
});
test('a real delayed investigation completes while an equally slow ordinary route times out',async t=>{
 const app=express();app.use(createResponseTimeout({defaultTimeoutMs:30,investigationTimeoutMs:500}));
 const reply=(_req,res)=>{const timer=setTimeout(()=>{if(!res.destroyed)res.json({answer:'Completed investigation'});},100);res.on('close',()=>clearTimeout(timer));};
 app.post('/workspaces/:id/intelligence',reply);app.get('/ordinary',reply);
 const server=http.createServer(app);await listen(server);t.after(()=>new Promise(resolve=>server.close(resolve)));
 const {port}=server.address();
 const result=await get(port,'POST','/workspaces/team/intelligence');assert.equal(result.status,200);assert.equal(JSON.parse(result.body).answer,'Completed investigation');
 await assert.rejects(get(port,'GET','/ordinary'),error=>error.code==='ECONNRESET');
});
