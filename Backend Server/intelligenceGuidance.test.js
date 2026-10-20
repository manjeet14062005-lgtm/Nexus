const test=require('node:test'),assert=require('node:assert/strict');
const {createAnswerer}=require('./intelligence');
const {apiKeySetupGuidance}=require('./intelligenceGuidance');
test('the reported API-key setup question returns honest guidance without provider calls or allowance',async()=>{
 const unexpected=()=>{throw new Error('Setup instructions must not invoke analytics, provider or quota writes');};
 const answer=createAnswerer({read:unexpected,reserve:unexpected,run:unexpected});
 for(const question of ['I have generated the API key. What should I do with it next?','i have generated the api key now what i have to do with it?','How do I use my API key?']){
  const result=await answer({workspaceId:'one',question});
  assert.equal(result.guidanceKind,'integration');assert.equal(result.source,'nexus-guidance');assert.equal(result.allowanceUsed,false);
  assert.match(result.answer,/POST \/v1\/verifications\/:id\/verify/);assert.match(result.answer,/Never put it in browser code/);assert.deepEqual(result.evidence,[]);
 }
});
test('curated guidance never replaces risk, error or workspace investigations',()=>{
 for(const question of ['Compare my verification methods','Why is API key traffic failing?','How do I rotate my API key?','What is the risk of a leaked API key?','Show API key usage analytics','How many API keys do I have?','What permissions does my API key have?'])assert.equal(apiKeySetupGuidance(question),null);
});
test('pasted Nexus credentials are rejected before guidance can bypass sensitive-input checks',async()=>{
 const answer=createAnswerer();
 await assert.rejects(answer({workspaceId:'one',question:'How do I use my API key nx_live_'+'a'.repeat(43)}),error=>error.code==='AI_SENSITIVE_INPUT');
});
