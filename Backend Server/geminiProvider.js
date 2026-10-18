// Per-investigation adapter retains signed model parts, never exposes them to
// clients, and never retries through another provider or changes billing.
function schema(value) {
 if(Array.isArray(value))return value.map(schema);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='additionalProperties').map(([key,item])=>[key,key==='type'?item.toUpperCase():schema(item)]));
 return value;
}
function waitForRetry(ms,signal) {
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const cancel=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
  signal?.addEventListener('abort',cancel,{once:true});
 });
}
function createGeminiFetcher({apiKey,mode='standard',fetcher=fetch,wait=waitForRetry,random=Math.random}) {
 const contents=[];let previousCalls=[],retries=0;
 return async function request(_unused,request) {
  const input=JSON.parse(request.body),last=input.messages.at(-1);
  if(!contents.length)contents.push({role:'user',parts:[{text:last.content}]});
  else contents.push({role:'user',parts:last.content.map(result=>{
   const call=previousCalls.find(item=>item.id===result.tool_use_id);
   let output;try {output=JSON.parse(result.content);}catch {output={message:result.content};}
   return {functionResponse:{name:call.name,...(call.providerId?{id:call.providerId}:{}),response:result.is_error?{error:output}:{output}}};
  })});
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(input.model)+':generateContent';
  const providerRequest={
   method:'POST',signal:request.signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({
    systemInstruction:{parts:[{text:input.system}]},contents,
    tools:[{functionDeclarations:input.tools.map(tool=>({name:tool.name,description:tool.description,...(Object.keys(tool.input_schema.properties||{}).length?{parameters:schema(tool.input_schema)}:{})}))}],
    toolConfig:{functionCallingConfig:{mode:'ANY',...(input.tool_choice.name?{allowedFunctionNames:[input.tool_choice.name]}:{})}},
    generationConfig:{maxOutputTokens:mode==='deep'?3600:2400,thinkingConfig:{thinkingLevel:mode==='deep'?'HIGH':'LOW'}},
   }),
  };
  let response,data;
  // Two retries across the whole investigation, not two per tool round.
  // Reuse the identical payload so retries cannot duplicate conversation turns.
  for(;;) {
   request.signal?.throwIfAborted();
   response=await fetcher(url,providerRequest);
   data=await response.json().catch(()=>({}));
   if(![502,503,504].includes(response.status)||retries>=2)break;
   const retryAfter=response.headers?.get?.('retry-after');
   const providerDelay=retryAfter?(Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):0;
   // Do not retry sooner than requested, or extend the bounded investigation.
   if(providerDelay>10000)break;
   const delay=Math.max(1000*2**retries+Math.floor(random()*250),Number.isFinite(providerDelay)?providerDelay:0);
   retries++;
   await wait(delay,request.signal);
  }
  if(!response.ok)return {ok:false,status:response.status,json:async()=>({error:{type:String(data.error?.status||'unknown').toLowerCase(),message:String(data.error?.message||'Gemini request failed.')}})};
  const candidate=data.candidates?.[0],parts=candidate?.content?.parts||[];
  previousCalls=parts.filter(part=>part.functionCall).map((part,index)=>({type:'tool_use',id:'gemini_'+contents.length+'_'+index,providerId:part.functionCall.id,name:part.functionCall.name,input:part.functionCall.args||{}}));
  if(candidate?.content)contents.push(candidate.content);
  return {ok:true,json:async()=>({content:previousCalls,stop_reason:candidate?.finishReason==='MAX_TOKENS'?'max_tokens':'tool_use',usage:{input_tokens:data.usageMetadata?.promptTokenCount||0,output_tokens:(data.usageMetadata?.candidatesTokenCount||0)+(data.usageMetadata?.thoughtsTokenCount||0)}})};
 };
}
function providerConfig(env=process.env) {
 const provider=env.NEXUS_AI_PROVIDER||(env.GEMINI_API_KEY?'gemini':'anthropic');
 if(!['gemini','anthropic'].includes(provider))throw Object.assign(new Error('Select a supported AI provider.'),{status:503,code:'AI_PROVIDER_CONFIGURATION'});
 return {provider,apiKey:provider==='gemini'?env.GEMINI_API_KEY:env.ANTHROPIC_API_KEY,standardModel:provider==='gemini'?'gemini-3.7-flash':env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',deepModel:provider==='gemini'?'gemini-3.7-flash':env.NEXUS_AI_DEEP_MODEL||'claude-sonnet-4-6'};
}
module.exports={createGeminiFetcher,providerConfig,waitForRetry};
