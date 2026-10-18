const {supabaseAdmin}=require('./supabaseAdmin');
const countries=require('./globeCountries.json');
function aggregate(rows,range='all',now=Date.now()){
 if(!['all','7','30','90'].includes(range))throw Object.assign(new Error('Invalid date range.'),{status:400});
 const since=range==='all'?0:now-Number(range)*86400000,groups=new Map();let total=0,unknown=0;
 for(const row of rows){const time=Date.parse(row.createdAt);if(range!=='all'&&(!Number.isFinite(time)||time<since))continue;total++;
 const raw=String(row.country||'').trim();const name=Object.keys(countries).find(c=>c.toLowerCase()===raw.toLowerCase());
 if(!name){unknown++;continue;}groups.set(name,(groups.get(name)||0)+1);}
 return {total,mapped:total-unknown,unknown,countries:[...groups].map(([name,count])=>({name,count,lat:countries[name].coords[0],lng:countries[name].coords[1],flag:countries[name].flag})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)),range};
}
async function readDirectory(client=supabaseAdmin){
 const rows=new Map();let sourceTotal=0;
 for(let page=0;page<100;page++){const {data,error}=await client.rpc('nexus_admin_users',{page_number:page,page_size:100,protected_uids:[]});if(error)throw new Error('Geographic data is unavailable. Please retry.');
 sourceTotal=data.total;for(const row of data.rows||[])rows.set(row.id,{id:row.id,country:row.country,createdAt:row.createdAt});
 if((page+1)*100>=sourceTotal||!data.rows?.length)break;}
 return {rows:[...rows.values()],sourceTotal,complete:rows.size===sourceTotal};
}
function installGlobeRoutes(app,{authenticate,requireAdmin}){
 let cached=null,pending=null;
 app.get('/admin/globe',authenticate,requireAdmin,async(req,res)=>{
 res.set('Cache-Control','no-store');
 try{const range=String(req.query.range||'all');aggregate([],range);
 if(!cached||Date.now()-cached.time>15000){if(!pending)pending=readDirectory().then(data=>(cached={...data,time:Date.now()})).finally(()=>{pending=null;});await pending;}
 res.json({...aggregate(cached.rows,range),sourceTotal:cached.sourceTotal,complete:cached.complete,updatedAt:new Date(cached.time).toISOString()});
 }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Geographic data is unavailable. Please retry.'});}});
}
module.exports={aggregate,readDirectory,installGlobeRoutes};