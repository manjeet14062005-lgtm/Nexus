const test=require('node:test'),assert=require('node:assert/strict');
const {providerConfig,createGeminiFetcher,waitForRetry}=require('./geminiProvider');
const {investigate}=require('./intelligenceEngine');
const {createAnswerer}=require('./intelligence');
const analytics={range:{days:7},environment:'test',totals:{requests:20,verified:12},previousTotals:{requests:0},methodOutcomes:[{method:'email',requests:20,verified:12,pending:8}]};
const brief={summary:'12 of 20 requests are verified.',findings:[{title:'Small cohort',detail:'The sample has 20 email requests.',evidenceIds:['E3']}],nextSteps:[],limitations:[],followUpQuestions:[]};
const adapterRequest=signal=>({signal,body:JSON.stringify({model:'test-model',system:'Analyze',messages:[{role:'user',content:'Synthetic test'}],tools:[],tool_choice:{type:'any'}})});
const providerResponse=status=>({ok:status===200,status,json:async()=>status===200?{candidates:[{content:{role:'model',parts:[]},finishReason:'STOP'}]}:{error:{status:'UNAVAILABLE'}}});
test('temporary failures retry twice with increasing delay and identical payloads',async()=>{
 const payloads=[],delays=[];const adapter=createGeminiFetcher({apiKey:'test',random:()=>0,wait:async ms=>delays.push(ms),fetcher:async(_url,request)=>{payloads.push(request.body);return providerResponse(payloads.length<3?503:200);}});
 const result=await adapter('',adapterRequest());
 assert.equal(result.ok,true);assert.deepEqual(delays,[1000,2000]);assert.equal(new Set(payloads).size,1);
 // The budget is exhausted even if a later tool round also fails.
 await adapter('',{body:JSON.stringify({model:'test-model',messages:[{content:[]}],tools:[],tool_choice:{type:'any'}})});
 assert.equal(delays.length,2);
});
test('persistent unavailable responses stop at three attempts; auth and quota do not retry',async()=>{
 for(const status of [503,401,403,429]) {
  let calls=0;const adapter=createGeminiFetcher({apiKey:'test',wait:async()=>{},fetcher:async()=>{calls++;return providerResponse(status);}});
  const result=await adapter('',adapterRequest());assert.equal(result.status,status);assert.equal(calls,status===503?3:1);
 }
});
test('canceling retry backoff sends no further request',async()=>{
 const controller=new AbortController();let calls=0;
 const adapter=createGeminiFetcher({apiKey:'test',fetcher:async()=>{calls++;return providerResponse(503);},wait:async(ms,signal)=>{const waiting=waitForRetry(ms,signal);controller.abort();await waiting;}});
 await assert.rejects(adapter('',adapterRequest(controller.signal)),error=>error.name==='AbortError');assert.equal(calls,1);
});
test('provider retry-after is respected and a long delay is not shortened',async()=>{
 for(const seconds of ['5','60']) {
  let calls=0;const delays=[];
  const adapter=createGeminiFetcher({apiKey:'test',random:()=>0,wait:async ms=>delays.push(ms),fetcher:async()=>{calls++;return {...providerResponse(calls===1?503:200),headers:{get:()=>seconds}};}});
  await adapter('',adapterRequest());assert.deepEqual(delays,seconds==='5'?[5000]:[]);
 }
});
test('Gemini key selects only Gemini and both modes use the free-tier model',()=>{
 const config=providerConfig({GEMINI_API_KEY:'google-secret',ANTHROPIC_API_KEY:'old-secret'});assert.equal(config.provider,'gemini');assert.equal(config.apiKey,'google-secret');assert.equal(config.standardModel,'gemini-3.7-flash');assert.equal(config.deepModel,config.standardModel);
 assert.throws(()=>providerConfig({NEXUS_AI_PROVIDER:'random'}));
 assert.equal(providerConfig({NEXUS_AI_PROVIDER:'gemini',ANTHROPIC_API_KEY:'old-secret'}).apiKey,undefined);
});
test('Gemini tool roundtrip preserves signed parts and returns validated evidence',async()=>{
 let round=0;const fetcher=async(url,request)=>{
  round++;assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));assert.ok(!url.includes('secret'));assert.equal(request.headers['x-goog-api-key'],'google-secret');assert.equal(request.headers['x-api-key'],undefined);
  const body=JSON.parse(request.body);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'HIGH');assert.ok(!JSON.stringify(body).includes('anthropic-workspace'));
  if(round===2){assert.equal(body.contents[1].parts[0].thoughtSignature,'signed-provider-part');assert.equal(body.contents[2].parts[0].functionResponse.name,'inspect_methods');assert.equal(body.contents[2].parts[0].functionResponse.id,'call-1');assert.equal(body.contents[2].parts[0].functionResponse.response.output.id,'E3');}
  return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:round===1?[{thoughtSignature:'signed-provider-part',functionCall:{id:'call-1',name:'inspect_methods',args:{}}}]:[{functionCall:{name:'publish_analysis',args:brief}}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5}})};
 };
 const result=await investigate({analytics,question:'Compare methods',mode:'deep',provider:'gemini',model:'gemini-3.7-flash',apiKey:'google-secret',providerWorkspaceId:'unrelated-invalid-id',fetcher});assert.equal(round,2);assert.equal(result.provider,'gemini');assert.equal(result.evidence[0].id,'E3');assert.equal(result.tokenUsage.output,50);assert.ok(!JSON.stringify(result).includes('signed-provider-part'));
});
test('Gemini quota failure makes one request, never switches provider, and consumes no allowance',async()=>{
 let requests=0,refunds=0;const fetcher=async url=>{requests++;assert.ok(url.includes('googleapis'));return {ok:false,status:429,json:async()=>({error:{status:'RESOURCE_EXHAUSTED',message:'google-secret private-project'}})};};
 const answer=createAnswerer({provider:'gemini',apiKey:'google-secret',read:async()=>analytics,reserve:async()=>({month:'2026-10'}),release:async()=>{refunds++;},run:input=>investigate({...input,fetcher})});
 await assert.rejects(answer({workspaceId:'workspace',question:'Compare methods'}),error=>error.code==='AI_PROVIDER_QUOTA'&&!error.message.includes('private-project')&&!error.message.includes('google-secret')&&!error.providerDiagnostic.includes('google-secret'));assert.equal(requests,1);assert.equal(refunds,0);
});
test('Gemini invalid evidence and oversized output cannot bypass engine validation',async()=>{
 let requests=0;const fetcher=async()=>{requests++;return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{functionCall:{name:requests===1?'inspect_methods':'publish_analysis',args:requests===1?{}:{...brief,findings:[{...brief.findings[0],evidenceIds:['E99']}]}}}]},finishReason:'STOP'}]})};};
 await assert.rejects(investigate({analytics,question:'Compare',provider:'gemini',model:'gemini-3.7-flash',apiKey:'test',fetcher}),/unavailable evidence/);
 await assert.rejects(investigate({analytics,question:'Compare',provider:'gemini',model:'gemini-3.7-flash',apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})}),/budget/);
});
