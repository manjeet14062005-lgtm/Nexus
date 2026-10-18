// Explicit smoke test: sends only synthetic aggregate counts, never workspace records.
const path=require('node:path');
require('../Backend Server/node_modules/dotenv').config({path:path.join(__dirname,'../Backend Server/.env'),override:true});
const {investigate}=require('../Backend Server/intelligenceEngine');
const {providerConfig}=require('../Backend Server/geminiProvider');
async function main() {
 const config=providerConfig();
 if(!config.apiKey)throw new Error('Provider is not configured.');
 const mode=process.argv.includes('--deep')?'deep':'standard';
 const model=mode==='deep'?config.deepModel:config.standardModel;
 const analytics={range:{days:7,start:'2026-09-27T00:00:00Z',end:'2026-10-03T23:59:59Z'},environment:'test',analyticsSource:'daily-rollup',totals:{requests:20,verified:12,failed:3,pending:5},previousTotals:{requests:0},usage:{used:20,limit:100,month:'2026-10'},methodOutcomes:[{method:'email',requests:20,verified:12,failed:3,pending:5}],series:[],riskBreakdown:[]};
 const result=await investigate({analytics,question:'Compare method performance. Explain whether the sample supports a reliable conclusion, and suggest the next check.',mode,model,apiKey:config.apiKey,provider:config.provider});
 console.log(JSON.stringify({passed:Boolean(result.answer&&result.brief.findings.length&&result.evidence.length),provider:config.provider,model,mode,findings:result.brief.findings.length,evidenceSources:result.evidence.map(row=>row.id),providerTokens:result.tokenUsage}));
}
main().catch(error=>{console.error(JSON.stringify({code:error.code||'AI_SMOKE_FAILED',providerStatus:error.providerStatus,providerType:error.providerType,reason:error.providerReason,...(process.argv.includes('--diagnostic')?{detail:error.providerDiagnostic}:{})}));process.exitCode=1;});
