const test=require('node:test'),assert=require('node:assert/strict');
const {directoryOptions,actionOptions,usersCsv,previewPage,overviewFromRows,rpc}=require('./adminOperations');
const uid='00000000-0000-4000-8000-000000000002';
test('directory rejects malformed page, filters, oversized search and accepts literal punctuation',()=>{
 for(const input of [{page:-1},{page:1.2},{role:'owner'},{status:'invented'},{q:'x'.repeat(121)}])assert.throws(()=>directoryOptions(input));
 assert.equal(directoryOptions({q:'"+@%_%'}).q,'"+@%_%');
});
test('account changes reject identity edits, absent reasons and stale version omissions',()=>{
 for(const body of [{action:'edit',reason:'Valid reason',changes:{email:'other@example.test'},version:null},{action:'edit',reason:'Valid reason',changes:{name:'Name'}},{action:'suspend',reason:'x'},{action:'suspend',reason:'Valid reason',changes:{role:'admin'}}])assert.throws(()=>actionOptions(uid,uid,body));
 assert.equal(actionOptions(uid,uid,{action:'edit',reason:'Valid reason',changes:{name:'Name'},version:null}).expected_version,null);
});
test('filtered preview pagination clamps pages and uses verified email rather than profile labels',()=>{
 const rows=[{id:'1',name:'First',role:'user',status:'active',emailVerified:false},{id:'2',name:'Second',role:'admin',status:'active',emailVerified:true}];
 const result=previewPage(rows,directoryOptions({verification:'verified',page:9}));assert.equal(result.total,1);assert.equal(result.page,0);assert.equal(result.rows[0].id,'2');assert.equal(result.readOnly,true);
});
test('overview excludes future dates, uses previous-period growth and a UTC timeline',()=>{
 const now=new Date('2026-10-02T10:00:00Z'), rows=[{createdAt:'2026-10-01T12:00:00Z',emailVerified:true,phone:'123',phoneVerified:false},{createdAt:'2026-09-23T12:00:00Z'},{createdAt:'2027-01-01T00:00:00Z'}];
 const result=overviewFromRows(rows,now);assert.equal(result.week,1);assert.equal(result.previousWeek,1);assert.equal(result.trend,0);assert.equal(result.phoneVerified,0);assert.equal(result.daily.length,14);assert.equal(result.daily.at(-1).date,'2026-10-02');
});
test('CSV exports an explicit minimal field set and neutralizes quotes and formulas',()=>{
 const csv=usersCsv([{name:'=SUM(1,2)',email:'a"b@example.test',phone:'secret',bio:'private',role:'user'}]);
 assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('a""b'));assert.ok(!csv.includes('secret'));assert.ok(!csv.includes('private'));
});
test('database conflicts remain actionable and unavailable migrations never report successful writes',async()=>{
 await assert.rejects(rpc('action',{}, {rpc:async()=>({error:{code:'40001',message:'Refresh profile'}})}),error=>error.status===409 && error.message==='Refresh profile');
 await assert.rejects(rpc('action',{}, {rpc:async()=>({error:{code:'PGRST202',message:'Missing'}})}),error=>error.status===503);
});
