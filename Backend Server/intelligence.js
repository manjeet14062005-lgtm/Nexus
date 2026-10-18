const {FieldValue}=require('./supabaseDocumentStore');
const {adminDb}=require('./supabaseAdmin');
const {getWorkspaceAnalytics}=require('./analytics');
const {getWorkspacePlan,requireWorkspaceFeature}=require('./entitlements');
const {options,investigate}=require('./intelligenceEngine');
const {providerConfig}=require('./geminiProvider');
const isoMonth=()=>new Date().toISOString().slice(0,7);
async function reserveAiUsage(workspaceId) {
 const plan=await requireWorkspaceFeature(workspaceId,'ai'),limit=Number(plan.aiMonthlyLimit??0),month=isoMonth();
 if(limit<=0)throw Object.assign(new Error('AI features are not included in the current plan.'),{status:402,code:'FEATURE_NOT_INCLUDED'});
 const ref=adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(month);
 return adminDb().runTransaction(async tx=>{
  const snap=await tx.get(ref),used=Number(snap.exists?snap.data().aiRequests||0:0);
  if(used>=limit)throw Object.assign(new Error('Monthly AI query quota exceeded.'),{status:402,code:'AI_QUOTA_EXCEEDED'});
  tx.set(ref,{workspaceId,month,aiRequests:FieldValue.increment(1),aiLimit:limit,updatedAt:new Date().toISOString(),...(snap.exists?{}:{createdAt:new Date().toISOString()})},{merge:true});
  return {used:used+1,limit,remaining:Math.max(0,limit-used-1),month};
 });
}
async function releaseAiUsage(workspaceId,month) {
 const ref=adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(month);
 await adminDb().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&Number(snap.data().aiRequests)>0)tx.set(ref,{aiRequests:FieldValue.increment(-1),updatedAt:new Date().toISOString()},{merge:true});});
}
function createAnswerer(deps={}) {
 const active=new Set(),read=deps.read||getWorkspaceAnalytics,reserve=deps.reserve||reserveAiUsage,run=deps.run||investigate;
 const check=deps.check|| (deps.reserve?async()=>{}:async workspaceId=>{
  await requireWorkspaceFeature(workspaceId,'ai');
  const usage=await getAiUsage(workspaceId);
  if(usage.remaining<=0)throw Object.assign(new Error('Monthly AI query quota exceeded.'),{status:402,code:'AI_QUOTA_EXCEEDED'});
 });
 return async function answerWorkspaceQuestion(input) {
  const clean=options(input);
  if(/^(?:hey|hi|hello|hiya|howdy|good morning|good afternoon|good evening|thanks|thank you)[!.,\s]*$/i.test(clean.question)) {
   return {answer:/^(thanks|thank you)/i.test(clean.question)?'You’re welcome! What would you like to explore next?':'Hey! I’m Nexus Intelligence. I can help you understand verification performance, compare email and phone methods, and explore risk signals. What would you like to look into?',source:'nexus-guidance',range:clean.range,environment:clean.environment,mode:clean.mode,evidence:[],investigation:[],allowanceUsed:false};
  }
  const config=providerConfig(deps.apiKey?{NEXUS_AI_PROVIDER:deps.provider||'anthropic'}:process.env),apiKey=deps.apiKey??config.apiKey;
  if(!apiKey)throw Object.assign(new Error('AI service is not configured.'),{status:503,code:'AI_NOT_CONFIGURED'});
  const key=JSON.stringify([input.workspaceId,input.actorId||'workspace']);
  if(active.has(key))throw Object.assign(new Error('An investigation is already running. Wait for it to finish.'),{status:409,code:'AI_ALREADY_RUNNING'});
  active.add(key);
  const controller=new AbortController();
  const cancel=()=>controller.abort(Object.assign(new Error('Investigation canceled. No question was used.'),{status:499,code:'AI_CANCELED'}));
  input.signal?.addEventListener('abort',cancel,{once:true});
  if(input.signal?.aborted)cancel();
  const deadline=setTimeout(()=>controller.abort(Object.assign(new Error('The investigation timed out. No question was used. Please try again.'),{status:504,code:'AI_TIMEOUT'})),deps.timeoutMs??85000);
  let rejectAborted;
  const interrupted=new Promise((_,reject)=>{rejectAborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAborted,{once:true});});
  const bounded=operation=>{controller.signal.throwIfAborted();return Promise.race([Promise.resolve().then(operation),interrupted]);};
  try {
   await bounded(()=>check(input.workspaceId));
   const analytics=await bounded(()=>read(input.workspaceId,{range:clean.range,environment:clean.environment}));
   const model=clean.mode==='deep'?config.deepModel:config.standardModel;
   const result=await bounded(()=>run({...clean,analytics,apiKey,model,provider:config.provider,signal:controller.signal}));
   controller.signal.throwIfAborted();
   // Charge only a completed, validated answer. Provider failures and interrupted
   // work never reserve allowance, even if the process exits unexpectedly.
   clearTimeout(deadline);
   const usage=await reserve(input.workspaceId);
   return {...result,usage,source:'workspace-analytics',range:clean.range,environment:clean.environment,mode:clean.mode};
  } catch(error) {
   if(error.status)throw error;
   throw Object.assign(new Error('Workspace analysis is temporarily unavailable. Please retry.'),{status:503,code:'AI_UNAVAILABLE'});
  } finally {clearTimeout(deadline);input.signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',rejectAborted);active.delete(key);}
 };
}
const answerWorkspaceQuestion=createAnswerer();
async function getAiUsage(workspaceId) {
 const plan=await getWorkspacePlan(workspaceId),month=isoMonth();
 const snap=await adminDb().collection('workspaces').doc(workspaceId).collection('usage').doc(month).get();
 const used=snap.exists?Number(snap.data()?.aiRequests||0):0,limit=Number(plan?.aiMonthlyLimit||0);
 return {month,used,limit,remaining:limit<=0?0:Math.max(0,limit-used),planId:plan?.id||'starter',capabilities:{evidence:true,followUps:true,readOnly:true,modes:['standard','deep'],provider:providerConfig().provider}};
}
module.exports={answerWorkspaceQuestion,getAiUsage,createAnswerer};
