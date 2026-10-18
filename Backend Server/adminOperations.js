const { supabaseAdmin } = require('./supabaseAdmin');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function protectedUids() { return String(process.env.NEXUS_BOOTSTRAP_ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(s => UUID.test(s)); }
function directoryOptions(input = {}) {
 const pick = (key, allowed) => { const value = String(input[key] || 'all'); if (!allowed.includes(value)) invalid(`Invalid ${key} filter.`); return value; };
 const page = Number(input.page || 0), size = Number(input.pageSize || 20);
 if (!Number.isInteger(page) || page < 0 || page > 100000 || !Number.isInteger(size) || size < 1 || size > 100) invalid('Invalid pagination.');
 const q = String(input.q || '').trim(); if (q.length > 120) invalid('Search is limited to 120 characters.');
 return { q, role_filter: pick('role',['all','user','moderator','admin']), status_filter: pick('status',['all','active','suspended','deleting']),
 verification_filter: pick('verification',['all','verified','pending']), page_number: page, page_size: size, protected_uids: protectedUids() };
}
function actionOptions(actor, target, body = {}) {
 if (!UUID.test(target)) invalid('Invalid account ID.');
 if (!['edit','suspend','restore','request_deletion'].includes(body.action)) invalid('Invalid account action.');
 const reason = String(body.reason || '').trim(); if (reason.length < 5 || reason.length > 500) invalid('Provide a reason between 5 and 500 characters.');
 const changes = body.changes || {};
 if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(k => !['name','country','bio','role'].includes(k))) invalid('Only profile details and platform role can be changed.');
 if (Object.values(changes).some(v => typeof v !== 'string')) invalid('Profile fields must be text.');
 if (body.action !== 'edit' && Object.keys(changes).length) invalid('Profile changes require the edit action.');
 if (body.action === 'edit' && !Object.prototype.hasOwnProperty.call(body,'version')) invalid('Refresh this profile before saving.');
 if (body.version != null && !Number.isFinite(Date.parse(body.version))) invalid('Invalid profile version.');
 return { actor, target, operation: body.action, reason, changes, expected_version: body.version || null, protected_uids: protectedUids(),
 grace_days: Math.max(1, Number(process.env.ACCOUNT_DELETION_GRACE_DAYS) || 7) };
}
async function rpc(name, args, client = supabaseAdmin) {
 const { data,error } = await client.rpc(name,args);
 if (error) {
 const err = new Error(error.message); err.code=error.code; err.status = ({'42501':403,'40001':409,'23505':409,'22023':400,'P0002':404})[error.code] || 503;
 if (err.status === 503) err.message = 'Administrative data is unavailable. Check the admin database migration and retry.';
 throw err;
 }
 return data;
}
async function previewDirectory(client = supabaseAdmin) {
 // Read-only compatibility while the admin migration awaits approval. Never
 // pretend this bounded scan is an unlimited server aggregate.
 const users = [];
 for(let page=1;page<=20;page++) {
 const {data,error} = await client.auth.admin.listUsers({page,perPage:500}); if(error) throw error;
 users.push(...data.users); if(data.users.length<500) break;
 if(page===20) throw new Error('Read-only preview exceeds 10,000 accounts. Apply the paginated admin migration.');
 }
 const rows=[];
 for(let offset=0;offset<users.length;offset+=100) {
 const chunk=users.slice(offset,offset+100),ids=chunk.map(u=>u.id);
 const [{data:profiles,error:pError},{data:roles,error:rError}] = await Promise.all([
 client.from('nexus_documents').select('user_id,doc_id,collection_path,data,updated_at').eq('collection_name','users').is('workspace_id',null).in('user_id',ids).order('updated_at',{ascending:false}).limit(1000),
 client.from('nexus_user_roles').select('user_id,role').in('user_id',ids)]);
 if(pError || rError) throw pError || rError;
 for(const u of chunk) {
 const candidates=(profiles || []).filter(p=>p.user_id===u.id),p=candidates.find(p=>p.doc_id===u.id && p.collection_path==='users') || candidates[0];
 const d=p?.data || {},meta=u.user_metadata || {};
 rows.push({id:u.id,name:d.name ?? meta.full_name ?? meta.name ?? '',email:u.email || '',photoUrl:d.photoUrl ?? meta.avatar_url ?? meta.picture ?? '',
 phone:d.phone || '',phoneVerified:d.phoneVerified===true,emailVerified:Boolean(u.email_confirmed_at),
 role:protectedUids().includes(u.id)?'admin':roles?.find(r=>r.user_id===u.id)?.role || 'user',
 status:u.banned_until && Date.parse(u.banned_until)>Date.now()?'suspended':'active',country:d.country || '',bio:d.bio || '',
 createdAt:u.created_at,lastSignIn:u.last_sign_in_at,version:p?.updated_at || null,provider:u.app_metadata?.provider || 'email',protected:protectedUids().includes(u.id)});
 }
 }
 return rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
function previewPage(rows,args) {
 const filtered=rows.filter(r=>(!args.q || `${r.name} ${r.email} ${r.id}`.toLowerCase().includes(args.q.toLowerCase())) &&
 (args.role_filter==='all' || args.role_filter===r.role) && (args.status_filter==='all' || args.status_filter===r.status) &&
 (args.verification_filter==='all' || r.emailVerified===(args.verification_filter==='verified')));
 const page=Math.min(args.page_number,Math.max(0,Math.ceil(filtered.length/args.page_size)-1));
 return {rows:filtered.slice(page*args.page_size,(page+1)*args.page_size),total:filtered.length,page,pageSize:args.page_size,updatedAt:new Date().toISOString(),readOnly:true};
}
function overviewFromRows(rows,now=new Date()) {
 const end=now.getTime(),week=rows.filter(r=>Date.parse(r.createdAt)>end-7*86400000 && Date.parse(r.createdAt)<=end).length;
 const previous=rows.filter(r=>Date.parse(r.createdAt)>end-14*86400000 && Date.parse(r.createdAt)<=end-7*86400000).length;
 const daily=Array.from({length:14},(_,i)=>{const date=new Date(end-(13-i)*86400000).toISOString().slice(0,10); return {date,value:rows.filter(r=>r.createdAt?.slice(0,10)===date && Date.parse(r.createdAt)<=end).length};});
 return {total:rows.length,emailVerified:rows.filter(r=>r.emailVerified).length,phoneVerified:rows.filter(r=>r.phoneVerified && r.phone).length,
 suspended:rows.filter(r=>r.status==='suspended').length,admins:rows.filter(r=>r.role==='admin').length,today:daily[13].value,week,previousWeek:previous,
 trend:previous?Math.round((week-previous)*100/previous):null,daily,updatedAt:now.toISOString(),readOnly:true};
}
function missingMigration(error) { return ['PGRST202','42883'].includes(error.code); }
function csvCell(value) { const text = String(value ?? ''); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g,'""')}"`; }
function usersCsv(rows) {
 const fields = ['name','email','role','status','emailVerified','phoneVerified','createdAt'];
 return [fields.join(','),...rows.map(row => fields.map(key => csvCell(row[key])).join(','))].join('\r\n');
}
function installAdminRoutes(app, { authenticate,requireAdmin,requireRecentAuth }) {
 const read = [authenticate,requireAdmin];
 const fail = (res,error) => res.status(error.status || 500).json({ success:false,message:error.status ? error.message : 'Unable to complete this administrative request.' });
 app.get('/admin/users',...read,async(req,res) => {
 try { const args=directoryOptions(req.query); try { res.json(await rpc('nexus_admin_users',args)); }
 catch(error) { if(!missingMigration(error)) throw error; res.json(previewPage(await previewDirectory(),args)); } } catch(error) { fail(res,error); }
 });
 app.get('/admin/overview',...read,async(req,res) => {
 try { try { res.json(await rpc('nexus_admin_overview',{protected_uids:protectedUids()})); }
 catch(error) { if(!missingMigration(error)) throw error; const counts=overviewFromRows(await previewDirectory());
 const [{count:support,error:sError},{count:deletion,error:dError}]=await Promise.all([
 supabaseAdmin.from('nexus_documents').select('id',{head:true,count:'exact'}).eq('collection_name','supportTickets').in('data->>status',['open','in_progress','pending_nexus']),
 supabaseAdmin.from('nexus_documents').select('id',{head:true,count:'exact'}).eq('collection_name','accountDeletionRequests').in('data->>status',['pending','blocked','failed'])]);
 if(sError || dError) throw sError || dError; res.json({...counts,pendingSupport:support,pendingDeletion:deletion}); } } catch(error) { fail(res,error); }
 });
 app.get('/admin/users/:uid/activity',...read,async(req,res) => {
 try {
 if (!UUID.test(req.params.uid)) invalid('Invalid account ID.');
 const {data,error} = await supabaseAdmin.from('nexus_admin_audit').select('id,action,reason,created_at,actor_id,after_data').eq('target_id',req.params.uid).order('created_at',{ascending:false}).limit(30);
 if(error) throw error;
 const {data:requests,error:requestError} = await supabaseAdmin.from('nexus_documents').select('data').eq('collection_name','accountDeletionRequests').eq('doc_id',req.params.uid).order('updated_at',{ascending:false}).limit(1);
 if(requestError) throw requestError;
 res.json({events:data || [], deletion: requests?.[0] ? {status:requests[0].data.status,executeAfter:requests[0].data.executeAfter} : null});
 } catch(error) { fail(res,error); }
 });
 app.post('/admin/users/:uid/actions',...read,requireRecentAuth(),async(req,res) => {
 try {
 if(req.body?.action==='retry_deletion') {
 if(!UUID.test(req.params.uid) || typeof req.body.reason!=='string' || req.body.reason.trim().length<5 || req.body.reason.length>500)invalid('Provide a valid account and audit reason.');
 res.json(await rpc('nexus_account_lifecycle',{target:req.params.uid,operation:'retry',actor:req.auth.uid,reason:req.body.reason,protected_uids:protectedUids()}));
 } else res.json(await rpc('nexus_admin_user_action',actionOptions(req.auth.uid,req.params.uid,req.body)));
 } catch(error) { fail(res,error); }
 });
 app.get('/admin/users.csv',...read,async(req,res) => {
 try {
 const result = await rpc('nexus_admin_users',directoryOptions(req.query));
 const {error} = await supabaseAdmin.from('nexus_admin_audit').insert({actor_id:req.auth.uid,action:'export_directory_page',reason:'Administrator exported the current filtered directory page',after_data:{count:result.rows.length,page:result.page,filters:{role:req.query.role || 'all',status:req.query.status || 'all',verification:req.query.verification || 'all'}}});
 if(error) throw error;
 res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="nexus-directory-page.csv"').send(usersCsv(result.rows));
 } catch(error) { fail(res,error); }
 });
}
module.exports = { directoryOptions,actionOptions,usersCsv,installAdminRoutes,rpc,previewPage,overviewFromRows,previewDirectory };
