const {supabaseAdmin}=require('./supabaseAdmin');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(message){throw Object.assign(new Error(message),{status:400});}
function baseOptions(input={}){
 const page=Number(input.page || 0);if(!Number.isInteger(page)||page<0||page>10000)invalid('Invalid page.');
 const q=String(input.q || '').trim();if(q.length>120)invalid('Search is limited to 120 characters.');
 return {page_number:page,search_text:q};
}
function inboxOptions(input={}){
 const view=String(input.view || 'inbox'),category=String(input.category || 'all');
 if(!['inbox','unread','archive'].includes(view)||!['all','account','admin','message','support'].includes(category))invalid('Invalid inbox filter.');
 return {...baseOptions(input),view_name:view,category_filter:category};
}
function activityOptions(input={}){
 const source=String(input.source || 'all');if(!['all','admin','account','registration'].includes(source))invalid('Invalid activity source.');
 const action=String(input.action || '');if(action.length>80||!/^[a-zA-Z0-9_.]*$/.test(action))invalid('Invalid action filter.');
 const date=k=>{if(!input[k])return null;const time=Date.parse(input[k]);if(!Number.isFinite(time))invalid('Invalid date range.');return new Date(time).toISOString();};
 const since=date('from'),until=date('to');if(since&&until&&since>until)invalid('The start date must precede the end date.');
 return {...baseOptions(input),source_filter:source,action_filter:action,since_time:since,until_time:until};
}
function notificationAction(body={}){
 if(!['read','unread','archive','restore','read_all'].includes(body.action))invalid('Invalid notification action.');
 if(body.action==='read_all'){if(!body.cutoff||!Number.isFinite(Date.parse(body.cutoff))||Date.parse(body.cutoff)>Date.now()+60000)invalid('Refresh the inbox before marking all read.');}
 else if(!UUID.test(body.id || ''))invalid('Invalid notification ID.');
 return {operation:body.action,item:body.action==='read_all'?null:body.id,cutoff:body.action==='read_all'?body.cutoff:null};
}
function csvCell(value){const text=String(value??'');return '"'+(/^[\s]*[=+@-]/.test(text)?"'":'')+text.replace(/"/g,'""')+'"';}
function activityCsv(events){const fields=['id','created_at','source','type','actor','target','reason'];return [fields.join(','),...events.map(e=>fields.map(f=>csvCell(e[f])).join(','))].join('\r\n');}
function installEventRoutes(app,{authenticate,requireAdmin}){
 const invoke=async(name,args)=>{const {data,error}=await supabaseAdmin.rpc(name,args);if(error)throw Object.assign(new Error('Event service unavailable. Please retry.'),{status:503});return data;};
 const route=run=>async(req,res)=>{res.set('Cache-Control','no-store');try{await run(req,res);}catch(error){res.status(error.status || 500).json({message:error.status?error.message:'Unable to load events.'});}};
 app.get('/notifications',authenticate,route(async(req,res)=>res.json(await invoke('nexus_notification_inbox',{recipient:req.auth.uid,...inboxOptions(req.query)}))));
 app.post('/notifications/actions',authenticate,route(async(req,res)=>res.json({changed:await invoke('nexus_notification_action',{recipient:req.auth.uid,...notificationAction(req.body)})})));
 app.get('/admin/activity',authenticate,requireAdmin,route(async(req,res)=>res.json(await invoke('nexus_activity_feed',activityOptions(req.query)))));
 app.get('/admin/activity.csv',authenticate,requireAdmin,route(async(req,res)=>{const data=await invoke('nexus_activity_feed',activityOptions(req.query));res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="nexus-activity-page.csv"').send(activityCsv(data.events || []));}));
}
module.exports={installEventRoutes,inboxOptions,activityOptions,notificationAction,activityCsv};
