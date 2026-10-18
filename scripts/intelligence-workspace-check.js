// Read provider workspace metadata. Configure only an unambiguous Nexus workspace.
const fs=require('node:fs'),path=require('node:path');
const envPath=path.join(__dirname,'../Backend Server/.env');
require('../Backend Server/node_modules/dotenv').config({path:envPath,override:true});
async function main(){
 const response=await fetch('https://api.anthropic.com/v1/organizations/workspaces?limit=100',{signal:AbortSignal.timeout(15000),headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}});
 const body=await response.json();if(!response.ok){console.log(JSON.stringify({status:response.status,type:body.error?.type}));process.exitCode=1;return;}
 const rows=(body.data||[]).filter(row=>!row.archived_at),nexus=rows.filter(row=>/^nexus$/i.test(row.name||''));
 const selected=nexus.length===1?nexus[0]:!body.has_more&&rows.length===1?rows[0]:null;
 console.log(JSON.stringify({available:rows.length,hasMore:Boolean(body.has_more),unambiguous:!!selected}));
 if(process.argv.includes('--configure')&&selected&&/^wrkspc_[a-zA-Z0-9]+$/.test(selected.id)){
  let content=fs.readFileSync(envPath,'utf8');const line='ANTHROPIC_WORKSPACE_ID='+selected.id;
  content=/^ANTHROPIC_WORKSPACE_ID=.*$/m.test(content)?content.replace(/^ANTHROPIC_WORKSPACE_ID=.*$/m,line):content+'\n'+line+'\n';fs.writeFileSync(envPath,content);console.log('Provider workspace configured locally.');
 }
}
main().catch(()=>{console.error('Provider workspace discovery failed.');process.exitCode=1;});
