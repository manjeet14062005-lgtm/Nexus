const test=require('node:test'),assert=require('node:assert/strict');
const {activityOptions,inboxOptions,notificationAction,activityCsv}=require('./eventCenter');
test('event filters reject malformed dates, pagination and unknown sources',()=>{
 for(const input of [{page:-1},{page:1.2},{source:'api'},{from:'bad'},{from:'2026-10-03',to:'2026-10-02'},{q:'a'.repeat(121)}])assert.throws(()=>activityOptions(input));
 assert.equal(activityOptions({source:'account',q:"Bob's"}).search_text,"Bob's");
 assert.throws(()=>inboxOptions({view:'everything'}));
});
test('notification mutations require a scoped ID or a valid acknowledgement cutoff',()=>{
 assert.throws(()=>notificationAction({action:'delete',id:'a'}));assert.throws(()=>notificationAction({action:'read_all'}));
 assert.throws(()=>notificationAction({action:'read',id:'a'}));
 assert.equal(notificationAction({action:'read',id:'00000000-0000-4000-8000-000000000001'}).operation,'read');
});
test('audit page CSV quotes and neutralizes spreadsheet formulas',()=>{
 const csv=activityCsv([{id:'example',actor:'=1+1',reason:'hello,"world"\r\nnext'}]);
 assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('hello,""world""'));assert.ok(!csv.includes('phone'));
});
