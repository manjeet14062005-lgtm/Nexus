const test=require('node:test'),assert=require('node:assert/strict');
const {aggregate,readDirectory,installGlobeRoutes}=require('./globeAnalytics');
const {queueOptions,readDeletionQueue}=require('./deletionQueue');
test('country-only profiles aggregate once and missing or unsupported countries stay unknown',()=>{
 const result=aggregate([{country:'India',state:'active'},{country:' india '},{country:'United States',state:'Andhra Pradesh'},{country:''},{country:'Atlantis'}]);
 assert.equal(result.total,5);assert.equal(result.unknown,2);assert.equal(result.mapped,3);
 assert.equal(result.countries.find(c=>c.name==='India').count,2);
 assert.equal(result.countries.find(c=>c.name==='United States').lat,37.0902);
 assert.equal(aggregate([]).countries.length,0);
});
test('rolling registration periods exclude old or unknown dates and reject invalid ranges',()=>{
 const now=Date.parse('2026-10-03T12:00:00Z');
 const result=aggregate([{country:'India',createdAt:'2026-10-02T12:00:00Z'},{country:'India',createdAt:'2026-09-01T12:00:00Z'},{country:'India',createdAt:null}],'7',now);
 assert.equal(result.total,1);assert.throws(()=>aggregate([],'invalid'));
});
test('canonical directory reads every page and strips personal data before aggregation',async()=>{
 const calls=[];const rows=Array.from({length:101},(_,i)=>({id:String(i),country:'India',email:'private',phone:'private',createdAt:'2026-10-02T00:00:00Z'}));
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:{total:101,rows:rows.slice(args.page_number*100,args.page_number*100+100)}};}};
 const result=await readDirectory(client);assert.equal(result.rows.length,101);assert.equal(result.complete,true);assert.equal(calls.length,2);assert.equal(result.rows[0].email,undefined);assert.equal(result.rows[0].phone,undefined);
 await assert.rejects(readDirectory({rpc:async()=>({error:{message:'private internal error'}})}),/Geographic data is unavailable/);
});
test('globe route retains authentication and admin middleware',()=>{
 const auth=()=>{},admin=()=>{};let args;installGlobeRoutes({get:(...value)=>args=value},{authenticate:auth,requireAdmin:admin});assert.equal(args[0],'/admin/globe');assert.equal(args[1],auth);assert.equal(args[2],admin);
});
test('deletion queue accepts processing and rejects invalid status or pagination',()=>{
 assert.deepEqual(queueOptions({status:'processing',page:'2'}),{status:'processing',page:2});
 for(const query of [{status:'typo'},{page:-1},{page:1.1},{page:'NaN'}])assert.throws(()=>queueOptions(query));
});
test('deletion queue pages deterministically and never returns lease or internal error data',async()=>{
 const calls=[];const chain={};for(const name of ['from','select','eq','order'])chain[name]=(...args)=>{calls.push([name,...args]);return chain;};chain.range=async(...args)=>{calls.push(['range',...args]);return {data:[{doc_id:'u',data:{uid:'u',status:'processing',leaseToken:'secret',error:'internal'}}],count:65};};
 const result=await readDeletionQueue(chain,{status:'processing',page:1});assert.equal(result.hasMore,true);assert.equal(result.total,65);assert.deepEqual(calls.at(-1),['range',30,59]);assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('internal'));assert.ok(calls.some(c=>c[0]==='order'&&c[1]==='id'));
 chain.range=async()=>({error:new Error('Unavailable')});await assert.rejects(readDeletionQueue(chain,{}),/Unavailable/);
});
