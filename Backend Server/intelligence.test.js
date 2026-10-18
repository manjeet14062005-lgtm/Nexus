const test=require('node:test'),assert=require('node:assert/strict');
const {options,evidence,investigate,validateBrief}=require('./intelligenceEngine');
const {createAnswerer}=require('./intelligence');
const analytics={range:{days:30},environment:'live',totals:{requests:10,verified:6,failed:2},previousTotals:{requests:0},usage:{used:10,limit:100},methodOutcomes:[{method:'email',requests:10,verified:6,failed:2,pending:2}],series:[{day:'2026-10-02',requests:10,email:'private@example.test'}],riskBreakdown:[],recentRequests:[{email:'private@example.test',phone:'+123456789',codeHash:'secret'}]};
const brief={summary:'Six requests are verified.',findings:[{title:'Verified cohort',detail:'Six of ten email requests are verified.',evidenceIds:['E3']}],nextSteps:[],limitations:[],followUpQuestions:['How should I investigate pending requests?']};
const response=blocks=>({ok:true,json:async()=>({content:blocks,stop_reason:'tool_use',usage:{input_tokens:10,output_tokens:20}})});
test('simple greetings return useful guidance without provider requests or allowance charges',async()=>{
 const unexpected=()=>{throw new Error('A greeting must not start an investigation');};
 const answer=createAnswerer({read:unexpected,reserve:unexpected,run:unexpected});
 for(const question of ['hey','Hello!','thank you']) {
  const result=await answer({workspaceId:'one',question});assert.equal(result.allowanceUsed,false);assert.equal(result.source,'nexus-guidance');assert.ok(result.answer.length>20);
 }
});
test('canceling a hung investigation releases the lock without charging or allowing a late charge',async()=>{
 let charges=0,finish;const controller=new AbortController();
 const answer=createAnswerer({apiKey:'test',read:async()=>analytics,reserve:async()=>{charges++;return {};},run:()=>new Promise(resolve=>{finish=resolve;})});
 const first=answer({workspaceId:'one',question:'Compare verification performance',signal:controller.signal});
 await new Promise(resolve=>setImmediate(resolve));controller.abort();
 await assert.rejects(first,error=>error.code==='AI_CANCELED');
 finish({answer:'Late'});await new Promise(resolve=>setImmediate(resolve));assert.equal(charges,0);
 const second=answer({workspaceId:'one',question:'Again'});await new Promise(resolve=>setImmediate(resolve));finish({answer:'Ready'});await second;assert.equal(charges,1);
});
test('hard deadline releases even a non-cooperative provider without charging',async()=>{
 let charges=0;const answer=createAnswerer({apiKey:'test',timeoutMs:10,read:async()=>analytics,reserve:async()=>{charges++;},run:()=>new Promise(()=>{})});
 for(let i=0;i<2;i++)await assert.rejects(answer({workspaceId:'one',question:'Compare verification performance'}),error=>error.code==='AI_TIMEOUT');
 assert.equal(charges,0);
});
test('comparisons distinguish percentage points from relative growth and use equal windows',()=>{
 const result=evidence({...analytics,previousTotals:{requests:5,verified:2,failed:2},series:Array.from({length:15},(_,i)=>({day:'2026-10-'+String(i+1).padStart(2,'0'),requests:i<7?10:20}))});
 assert.equal(result.performance.data.requestGrowthPercent,100);
 assert.equal(result.performance.data.terminalRateChangePercentagePoints,25);
 assert.equal(result.trends.data.recentComparison.recent.requests,140);
 assert.equal(result.trends.data.recentComparison.prior.requests,70);
});
test('invalid selections and obvious credentials fail before any provider request',()=>{
 for(const input of [{question:'',range:30},{question:'hi',range:1},{question:'hi',environment:'other'},{question:'hi',mode:'unbounded'},{question:'sk-ant-secret'}])assert.throws(()=>options(input));
 assert.equal(options({question:'hi',history:Array.from({length:6},()=>({question:'hello',answer:'x'.repeat(5000)}))}).history.length,3);
});
test('evidence excludes identities, arbitrary risk strings, zero-baseline growth and unstable small samples',()=>{
 const data=evidence(analytics);assert.equal(data.performance.data.requestGrowthPercent,null);assert.equal(data.methods.data.methods[0].verifiedShare,60);assert.ok(data.methods.data.methods[0].sampleWarning);assert.ok(!JSON.stringify(data).includes('private'));assert.ok(!JSON.stringify(data).includes('secret'));
 assert.ok(evidence({...analytics,detailTruncated:true}).performance.data.limitations.some(text=>text.includes('5,000')));
});
test('unknown citations and uncited findings are rejected',()=>{
 assert.throws(()=>validateBrief(brief,[{id:'E1'}]));assert.throws(()=>validateBrief({...brief,findings:[{title:'Fact',detail:'Claim',evidenceIds:[]}]},[{id:'E3'}]));
});
test('investigation performs a real tool roundtrip and publishes only inspected sources',async()=>{
 const payloads=[];const fetcher=async(_url,opts)=>{payloads.push(JSON.parse(opts.body));return payloads.length===1?response([{type:'tool_use',id:'t1',name:'inspect_methods',input:{}}]):response([{type:'tool_use',id:'t2',name:'publish_analysis',input:brief}]);};
 const result=await investigate({analytics,question:'Compare email verification',apiKey:'test',model:'model',fetcher});assert.equal(result.evidence.length,1);assert.equal(result.evidence[0].id,'E3');assert.equal(result.tokenUsage.input,20);assert.equal(payloads[1].messages[2].content[0].type,'tool_result');assert.ok(result.answer.includes('Data limitations'));assert.ok(!JSON.stringify(payloads).includes('private@example.test'));
});
test('attempted cross-workspace tool arguments receive an error and never select new data',async()=>{
 let calls=0;const fetcher=async(_url,opts)=>{calls++;const payload=JSON.parse(opts.body);if(calls===2)assert.equal(payload.messages[2].content[0].is_error,true);return response([{type:'tool_use',id:'x'+calls,name:'inspect_performance',input:{workspaceId:'another'}}]);};
 await assert.rejects(investigate({analytics,question:'hi',apiKey:'test',model:'model',fetcher}),/budget/);assert.equal(calls,4);
});
test('provider workspace header is server-configured and never taken from tool arguments',async()=>{
 let calls=0;const fetcher=async(_url,request)=>{assert.equal(request.headers['anthropic-workspace-id'],'wrkspc_test');calls++;return calls===1?response([{type:'tool_use',id:'t1',name:'inspect_methods',input:{}}]):response([{type:'tool_use',id:'t2',name:'publish_analysis',input:brief}]);};
 await investigate({analytics,question:'Compare methods',model:'model',apiKey:'test',providerWorkspaceId:'wrkspc_test',fetcher});assert.equal(calls,2);
 await assert.rejects(investigate({analytics,question:'Compare verification performance',apiKey:'test',providerWorkspaceId:'nexus-app-workspace',fetcher}),/configuration is invalid/);
});
test('provider failures and truncation fail safely without exposing provider errors',async()=>{
 await assert.rejects(investigate({analytics,question:'hi',apiKey:'test',fetcher:async()=>({ok:false,status:404,json:async()=>({error:{message:'Workspace private-id not found.'}})})}),error=>error.code==='AI_PROVIDER_CONFIGURATION'&&error.providerReason==='workspace_access'&&!error.message.includes('private-id'));
 await assert.rejects(investigate({analytics,question:'hi',apiKey:'test',fetcher:async()=>({ok:false,status:401,json:async()=>({error:{message:'credential-private'}})})}),error=>!error.message.includes('private')&&error.status===503);
 await assert.rejects(investigate({analytics,question:'hi',apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({stop_reason:'max_tokens'})})}),/budget/);
});
test('provider failure consumes no allowance and needs no refund',async()=>{
 let reservations=0,releases=0;const run=createAnswerer({apiKey:'test',read:async()=>analytics,reserve:async()=>{reservations++;return {month:'2026-10'};},release:async(id,month)=>{assert.equal(id,'one');assert.equal(month,'2026-10');releases++;},run:async()=>{throw Object.assign(new Error('Busy'),{status:503});}});
 await assert.rejects(run({workspaceId:'one',actorId:'a',question:'Compare verification performance'}));assert.equal(reservations,0);assert.equal(releases,0);
});
test('analytics failure happens before usage reservation and overlapping actor requests are rejected',async()=>{
 let reservations=0;const fail=createAnswerer({apiKey:'test',read:async()=>{throw new Error('SQL internals');},reserve:async()=>{reservations++;}});await assert.rejects(fail({workspaceId:'one',question:'Compare verification performance'}),/temporarily unavailable/);assert.equal(reservations,0);
 let done;const run=createAnswerer({apiKey:'test',read:async()=>analytics,reserve:async()=>({month:'2026-10'}),run:()=>new Promise(resolve=>{done=resolve;})});const first=run({workspaceId:'one',actorId:'a',question:'Compare verification performance'});await new Promise(resolve=>setImmediate(resolve));await assert.rejects(run({workspaceId:'one',actorId:'a',question:'Again'}),error=>error.status===409);done({answer:'Ready'});await first;
});
