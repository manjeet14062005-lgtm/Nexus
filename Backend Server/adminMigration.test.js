// Real PostgreSQL semantics in an isolated in-memory database, never live users.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const dir=path.join(__dirname,'../supabase/migrations');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
let db;
test.before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema private;
 create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,private to authenticated; grant execute on function auth.uid() to authenticated;`);
 await db.exec(read('20260918093034_001_nexus.sql').replace('create extension if not exists pgcrypto;',''));
 await db.exec(read('20260919115812_004_fix_rls_helpers_and_announcements.sql'));
 await db.exec(read('20260927172057_browser_access_boundaries.sql'));
 // Model the actual live legacy trigger, where the earlier moderator migration
 // was absent. The repair must work after the admin upgrade, not depend on it.
 await db.exec(read('20260930020000_add_moderator_platform_role.sql').replace("('admin','moderator','user')","('admin','user')"));
 await db.exec(`create trigger nexus_sync after insert or update or delete on public.nexus_documents for each row execute function private.nexus_sync_document();`);
 await db.exec(read('20261001165530_account_profile_initialization.sql'));
 await db.exec(read('20261001170833_account_verified_phone_lock.sql'));
 await db.exec(read('20261002174604_admin_operations_upgrade.sql'));
 await db.exec(read('20261002191423_account_lifecycle_safety.sql'));
 await db.exec(read('20261002195837_activity_notification_upgrade.sql'));
 for(let i=0;i<ids.length;i++)await db.query(`insert into auth.users(id,email,email_confirmed_at,created_at) values($1,$2,case when $3::int<2 then now() else null end,now()-make_interval(days=>$3::int))`,[ids[i],`user${i}@example.test`,i]);
 await db.query("update public.nexus_user_roles set role='admin' where user_id=$1",[ids[0]]);
});
test.after(async()=>{await db?.close();});
async function action(actor,target,operation,changes={},version=null,protectedIds=[]){
 return db.query('select public.nexus_admin_user_action($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::timestamptz,$7::uuid[],7)',[actor,target,operation,'Testing authorized change',JSON.stringify(changes),version,protectedIds]);
}
async function browser(uid,sql,values=[]){
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 try{return await db.query(sql,values);}finally{await db.exec('reset role');}
}
test('migration executes and directory includes Auth accounts with true confirmation status and clamped pages',async()=>{
 const {rows}=await db.query("select public.nexus_admin_users('', 'all','all','pending',99,20,'{}') as result");
 assert.equal(rows[0].result.total,1);assert.equal(rows[0].result.page,0);assert.equal(rows[0].result.rows[0].emailVerified,false);
 const overview=await db.query("select public.nexus_admin_overview('{}') as result");assert.equal(overview.rows[0].result.total,3);assert.equal(overview.rows[0].result.emailVerified,2);
});

test('moderator sync repair fixes the legacy trigger without leaving failed profile/audit writes',async()=>{
 const version=(await db.query("select updated_at from public.nexus_documents where collection_name='users' and user_id=$1",[ids[1]])).rows[0].updated_at;
 await assert.rejects(action(ids[0],ids[1],'edit',{name:'Must roll back',role:'moderator'},version),/Invalid platform role/);
 const unchanged=(await db.query("select data,updated_at from public.nexus_documents where collection_name='users' and user_id=$1",[ids[1]])).rows[0];
 assert.notEqual(unchanged.data.name,'Must roll back');assert.equal(unchanged.updated_at.getTime(),version.getTime());
 assert.equal((await db.query('select count(*)::int n from public.nexus_admin_audit')).rows[0].n,0);
 await db.exec(read('20261002184508_fix_moderator_role_sync.sql'));
 // Existing downstream tests exercise actual moderator writes and canonical sync.
});
test('ordinary users and browser clients cannot call administrative RPCs',async()=>{
 await assert.rejects(action(ids[2],ids[1],'suspend'),/Administrator access/);
 await assert.rejects(browser(ids[2],"select public.nexus_admin_users()"),/permission denied/);
});
test('self and protected administrator restrictions fail without audit side effects',async()=>{
 await assert.rejects(action(ids[0],ids[0],'suspend'),/protected/);
 await assert.rejects(action(ids[0],ids[1],'suspend',{},null,[ids[1]]),/protected/);
 const result=await db.query('select count(*)::int n from public.nexus_admin_audit');assert.equal(result.rows[0].n,0);
});
test('stale edits fail and atomic role updates preserve phone/bio while synchronizing authority',async()=>{
 const {rows}=await db.query("select updated_at from public.nexus_documents where collection_name='users' and user_id=$1",[ids[1]]);const version=rows[0].updated_at;
 await assert.rejects(action(ids[0],ids[1],'edit',{name:'Fresh'},'2000-01-01T00:00:00Z'),/changed/);
 await action(ids[0],ids[1],'edit',{name:'Fresh',role:'moderator'},version);
 const role=await db.query('select role from public.nexus_user_roles where user_id=$1',[ids[1]]);assert.equal(role.rows[0].role,'moderator');
 const profile=await db.query("select data from public.nexus_documents where collection_name='users' and user_id=$1",[ids[1]]);assert.equal(profile.rows[0].data.name,'Fresh');assert.equal(profile.rows[0].data.role,'moderator');
 const audit=await db.query('select action,reason from public.nexus_admin_audit where target_id=$1',[ids[1]]);assert.equal(audit.rows[0].action,'edit');
});
test('restricted or nonexistent administrators cannot authorize account changes',async()=>{
 await db.query("update public.nexus_user_roles set role='admin' where user_id=$1",[ids[1]]);
 await db.query("insert into public.nexus_account_controls(user_id,status) values($1,'suspended')",[ids[0]]);
 await assert.rejects(action(ids[0],ids[1],'suspend'),/Administrator access/);
 await db.query('delete from public.nexus_account_controls where user_id=$1',[ids[0]]);
 // Actor is a trusted bootstrap admin absent from Auth: not accepted as an actor.
 await assert.rejects(action('00000000-0000-4000-8000-000000000099',ids[1],'suspend',{},null,['00000000-0000-4000-8000-000000000099']),/Administrator access/);
 await db.query("update public.nexus_user_roles set role='user' where user_id=$1",[ids[1]]);
});
test('competing administrator demotions leave one administrator and reject the revoked actor',async()=>{
 await db.query("update public.nexus_user_roles set role='admin' where user_id=$1",[ids[1]]);
 const versionA=(await db.query("select updated_at from public.nexus_documents where collection_name='users' and user_id=$1",[ids[0]])).rows[0].updated_at;
 const versionB=(await db.query("select updated_at from public.nexus_documents where collection_name='users' and user_id=$1",[ids[1]])).rows[0].updated_at;
 const results=await Promise.allSettled([action(ids[0],ids[1],'edit',{name:'Other admin',role:'user'},versionB),action(ids[1],ids[0],'edit',{name:'First admin',role:'user'},versionA)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("select count(*)::int n from public.nexus_user_roles where role='admin'")).rows[0].n,1);
});
test('restriction immediately hides protected data from an existing JWT and prevents profile initialization',async()=>{
 const before=await browser(ids[2],'select doc_id from public.nexus_documents');assert.ok(before.rows.length>0);
 await action(ids[0],ids[2],'suspend');
 const hidden=await browser(ids[2],'select doc_id from public.nexus_documents');assert.equal(hidden.rows.length,0);
 await assert.rejects(browser(ids[2],'select public.ensure_user_profile()'),/Account access unavailable/);
 await action(ids[0],ids[2],'restore');
 const restored=await browser(ids[2],'select doc_id from public.nexus_documents');assert.ok(restored.rows.length>0);
});
test('profile field patches preserve intervening changes and cannot modify authority',async()=>{
 await browser(ids[2],"select public.nexus_profile_patch('users',$1,$2::jsonb)",[ids[2],JSON.stringify({bio:'New biography'})]);
 await browser(ids[2],"select public.nexus_profile_patch('users',$1,$2::jsonb)",[ids[2],JSON.stringify({name:'New name'})]);
 const {rows}=await db.query("select data from public.nexus_documents where collection_name='users' and user_id=$1",[ids[2]]);assert.equal(rows[0].data.bio,'New biography');assert.equal(rows[0].data.name,'New name');
 await assert.rejects(browser(ids[2],"select public.nexus_profile_patch('users',$1,$2::jsonb)",[ids[2],JSON.stringify({role:'admin'})]),/profile fields|protected account workflow/);
 const removed=await browser(ids[0],"delete from public.nexus_documents where collection_name='users' and user_id=$1 returning id",[ids[2]]);assert.equal(removed.rows.length,0);
});
test('deletion requests reject ownership/subscriptions and retain identity until the worker processes them',async()=>{
 await db.query("insert into public.nexus_workspaces(id,owner_id) values('owned',$1)",[ids[2]]);
 await assert.rejects(action(ids[0],ids[2],'request_deletion'),/workspaces/);
 await db.query("delete from public.nexus_workspaces where id='owned'");
 await db.query("insert into public.nexus_documents(collection_name,collection_path,doc_id,user_id,data) values('billing','billing',$1,$2,$3::jsonb)",[ids[2],ids[2],JSON.stringify({status:'active',subId:'sub_test'})]);
 await assert.rejects(action(ids[0],ids[2],'request_deletion'),/subscription/);
 await db.query("delete from public.nexus_documents where collection_name='billing'");
 await action(ids[0],ids[2],'request_deletion');
 await assert.rejects(action(ids[0],ids[2],'request_deletion'),/already pending/);
 const existing=await db.query('select id from auth.users where id=$1',[ids[2]]);assert.equal(existing.rows.length,1);
 await db.query('select public.nexus_prepare_account_deletion($1,$2::uuid[])',[ids[2],[]]);
 await assert.rejects(browser(ids[2],'select public.ensure_user_profile()'),/Account access unavailable/);
 await assert.rejects(action(ids[0],ids[2],'edit',{name:'Race'}),/deletion is processing/);
});

async function life(operation,token=null,target=ids[1]){return (await db.query("select public.nexus_account_lifecycle($1,$2,$3,'{}',7) result",[target,operation,token])).rows[0].result;}
const leaseA='10000000-0000-4000-8000-000000000001',leaseB='10000000-0000-4000-8000-000000000002';
async function dueRequest(){await life('request');await db.query("update public.nexus_documents set data=data || '{\"executeAfter\":\"2000-01-01T00:00:00Z\"}'::jsonb where collection_name='accountDeletionRequests' and doc_id=$1",[ids[1]]);}
test('cancellation wins before claim; claimed requests cannot report canceled',async()=>{
 await db.exec('begin');try{
 await dueRequest();assert.equal((await life('cancel')).status,'canceled');assert.equal(await life('claim',leaseA),null);
 await dueRequest();assert.equal((await life('claim',leaseA)).status,'processing');
 await db.exec('savepoint rejected_cancel');await assert.rejects(life('cancel'),/cannot be canceled/);await db.exec('rollback to rejected_cancel');
 assert.equal(await life('claim',leaseB),null);
 }finally{await db.exec('rollback');}
});
test('expired processing lease is recovered and stale workers cannot finish or renew',async()=>{
 await db.exec('begin');try{
 await dueRequest();await life('claim',leaseA);
 await db.query("update public.nexus_documents set data=data || '{\"leaseUntil\":\"2000-01-01T00:00:00Z\"}'::jsonb where collection_name='accountDeletionRequests' and doc_id=$1",[ids[1]]);
 assert.equal((await life('claim',leaseB)).leaseToken,leaseB);
 await db.exec('savepoint stale');await assert.rejects(life('finish',leaseA),/lease lost/);await db.exec('rollback to stale');
 assert.equal((await life('fail',leaseB)).status,'processing');
 assert.equal((await db.query('select status from public.nexus_account_controls where user_id=$1',[ids[1]])).rows[0].status,'deleting');
 }finally{await db.exec('rollback');}
});
test('self-service admin deletion is rejected before scheduling; browser lifecycle calls are denied',async()=>{
 await assert.rejects(life('request',null,ids[0]),/Administrator/);
 await assert.rejects(browser(ids[1],"select public.nexus_account_lifecycle($1,'request')",[ids[1]]),/permission denied/);
});

async function inbox(uid,view='inbox',category='all',page=0){return (await db.query("select public.nexus_notification_inbox($1,$2,$3,'',$4) result",[uid,view,category,page])).rows[0].result;}
test('notifications persist recipient state and cutoff does not acknowledge newly arriving events',async()=>{
 await db.exec('begin');try{
 const id='20000000-0000-4000-8000-000000000001';
 await db.query("insert into public.nexus_notifications(id,recipient_id,event_key,category,title,href,created_at) values($1,$2,'synthetic-one','account','Example','/account',now()-interval '1 day')",[id,ids[1]]);
 const cutoff=(await inbox(ids[1])).cutoff;
 await db.query("insert into public.nexus_notifications(recipient_id,event_key,category,title,href,created_at) values($1,'synthetic-later','account','Later','/account',$2::timestamptz+interval '1 second')",[ids[1],cutoff]);
 await db.query("select public.nexus_notification_action($1,'read_all',null,$2)",[ids[1],cutoff]);
 const remaining=(await inbox(ids[1],'unread')).items;assert.ok(remaining.some(n=>n.title==='Later'));assert.ok(!remaining.some(n=>n.id===id));
 assert.equal((await db.query("select public.nexus_notification_action($1,'archive',$2) n",[ids[0],id])).rows[0].n,0);
 await db.query("select public.nexus_notification_action($1,'archive',$2)",[ids[1],id]);assert.ok((await inbox(ids[1],'archive')).items.some(n=>n.id===id));
 await db.query("select public.nexus_notification_action($1,'restore',$2)",[ids[1],id]);assert.ok((await inbox(ids[1])).items.some(n=>n.id===id));
 assert.equal((await db.query("select has_function_privilege('authenticated','public.nexus_notification_inbox(uuid,text,text,text,integer)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.exec('rollback');}
});
test('real registration produces one admin alert and no replay from directory reads',async()=>{
 await db.exec('begin');try{
 const target='20000000-0000-4000-8000-000000000002';await db.query("insert into auth.users(id,email) values($1,'synthetic-new@example.test')",[target]);
 const count=async()=>Number((await db.query("select count(*) n from public.nexus_notifications where event_key=$1 and recipient_id=$2",['registration:'+target,ids[0]])).rows[0].n);
 assert.equal(await count(),1);await db.query('select public.nexus_admin_users()');await db.query('select public.nexus_admin_users()');assert.equal(await count(),1);
 const feed=(await db.query("select public.nexus_activity_feed('registration') result")).rows[0].result;assert.ok(feed.events.every(e=>e.source==='registration'));assert.ok(feed.events.some(e=>e.target_id===target));
 }finally{await db.exec('rollback');}
});
test('admin alerts are hidden after demotion and duplicate event keys cannot be inserted',async()=>{
 await db.exec('begin');try{
 await db.query("insert into public.nexus_notifications(recipient_id,event_key,category,title,href) values($1,'duplicate','admin','Private admin update','/activity')",[ids[0]]);
 assert.ok((await inbox(ids[0])).items.some(n=>n.title==='Private admin update'));
 await db.query("update public.nexus_user_roles set role='user' where user_id=$1",[ids[0]]);assert.ok(!(await inbox(ids[0])).items.some(n=>n.title==='Private admin update'));
 await db.exec('savepoint duplicate');await assert.rejects(db.query("insert into public.nexus_notifications(recipient_id,event_key,category,title,href) values($1,'duplicate','admin','Private','/activity')",[ids[0]]),/unique/);await db.exec('rollback to duplicate');
 }finally{await db.exec('rollback');}
});

test('message and support events deliver only to their recipient, not every directory user',async()=>{
 await db.exec('begin');try{
 const before=Number((await db.query("select count(*) n from public.nexus_notifications where recipient_id=$1 and category in ('message','support')",[ids[1]])).rows[0].n);
 await db.query("insert into public.nexus_documents(collection_name,collection_path,doc_id,data,user_id) values('messages','messages','synthetic-message',$1::jsonb,$2)",[JSON.stringify({toUid:ids[1],fromUid:ids[0],body:'Do not expose this private content'}),ids[0]]);
 await db.query("insert into public.nexus_documents(collection_name,collection_path,doc_id,data,user_id) values('supportTickets','supportTickets','synthetic-support',$1::jsonb,$2)",[JSON.stringify({requesterUid:ids[1],status:'open'}),ids[1]]);
 await db.query("update public.nexus_documents set data=data || '{\"status\":\"closed\"}'::jsonb where collection_path='supportTickets' and doc_id='synthetic-support'");
 const notifications=(await inbox(ids[1])).items.filter(n=>['message','support'].includes(n.category));assert.equal(notifications.length,before+2);
 assert.ok(!JSON.stringify(notifications).includes('Do not expose'));assert.ok(!(await inbox(ids[2])).items.some(n=>['message','support'].includes(n.category)));
 }finally{await db.exec('rollback');}
});
test('API service role can use the audit function without direct access to authentication records',async()=>{
 await db.exec('grant usage on schema public to service_role; set role service_role');
 try{const result=await db.query("select public.nexus_activity_feed() result");assert.ok(Array.isArray(result.rows[0].result.events));await assert.rejects(db.query('select id from auth.users'),/permission denied/);}finally{await db.exec('reset role');}
});
