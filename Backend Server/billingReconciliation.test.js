const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingReconciler } = require('./billingReconciliation');
function fixture() {
  const rows = new Map(), calls = [];
  const ref = (collection,id) => ({ key:`${collection}/${id}`, async get(){return snap(this);} });
  const snap = r => ({ exists:rows.has(r.key), data:()=>rows.get(r.key) });
  const db = { collection:name=>({doc:id=>ref(name,id)}), async runTransaction(fn){return fn({get:async r=>snap(r),set:(r,data)=>rows.set(r.key,{...rows.get(r.key),...data})});} };
  const subscription = {id:'sub_test',plan_id:'plan_pro',notes:{userId:'owner',planKey:'pro_monthly'},status:'active',paid_count:1,quantity:1,current_end:Math.floor(Date.now()/1000)+86400};
  const payment = {id:'pay_test',invoice_id:'inv_test',status:'captured',amount:1000,amount_refunded:0,currency:'INR'};
  const invoice = {id:'inv_test',subscription_id:'sub_test',payment_id:'pay_test',status:'paid',amount_paid:1000,currency:'INR'};
  const provider = { subscriptions:{fetch:async()=>subscription,all:async()=>({items:[subscription]})}, plans:{fetch:async()=>({item:{amount:1000,currency:'INR'},period:'monthly',interval:1})},
    payments:{fetch:async()=>payment},invoices:{fetch:async()=>invoice,all:async()=>({items:[invoice]})} };
  const reconcile = createBillingReconciler({db,provider,planIds:{pro_monthly:'plan_pro'},planParts:key=>key==='pro_monthly'?{planId:'pro',cycle:'monthly'}:null,
    planAmount:()=>1000,getPlan:()=>({name:'Pro'}),notify:async(...args)=>calls.push(args)});
  return {rows,calls,subscription,payment,invoice,provider,reconcile};
}
test('captured paid active subscription recovers billing and invoice atomically without charging',async()=>{
 const f=fixture(); const result=await f.reconcile({uid:'owner',paymentId:'pay_test'});
 assert.equal(result.activation,'active'); assert.equal(f.rows.get('billing/owner').plan,'pro'); assert.equal(f.rows.get('billing_invoices/rp_pay_test').status,'paid');
 await f.reconcile({uid:'owner',paymentId:'pay_test'}); assert.equal(f.calls.length,1);
});
test('foreign-account payment cannot grant access',async()=>{const f=fixture(); await assert.rejects(f.reconcile({uid:'other',paymentId:'pay_test'}),e=>e.status===403);assert.equal(f.rows.size,0);});
test('mandate authorization alone remains pending',async()=>{const f=fixture();f.subscription.status='authenticated';f.subscription.paid_count=0;assert.equal((await f.reconcile({uid:'owner'})).activation,'pending');assert.equal(f.rows.size,0);});
test('refunded, mismatched, unpaid and uncaptured payments are rejected',async()=>{
 for(const change of [f=>f.payment.amount_refunded=1000,f=>f.payment.amount=1,f=>f.payment.status='authorized',f=>f.invoice.subscription_id='sub_other',f=>f.invoice.status='issued',f=>f.invoice.payment_id='pay_other']){
  const f=fixture();change(f);await assert.rejects(f.reconcile({uid:'owner',subscriptionId:'sub_test'}));assert.equal(f.rows.size,0);
 }
});
test('provider plan ID and price must match the server catalog',async()=>{
 const f=fixture(); f.subscription.plan_id='plan_wrong';await assert.rejects(f.reconcile({uid:'owner'}));assert.equal(f.rows.size,0);
 const g=fixture();g.provider.plans.fetch=async()=>({item:{amount:1,currency:'INR'},period:'monthly',interval:1});await assert.rejects(g.reconcile({uid:'owner'}));
});
test('an old receipt cannot replace a different established subscription',async()=>{const f=fixture();f.rows.set('billing/owner',{plan:'enterprise',subId:'sub_new'});await assert.rejects(f.reconcile({uid:'owner',paymentId:'pay_test'}));assert.equal(f.rows.get('billing/owner').plan,'enterprise');});
test('provider failures leave billing untouched',async()=>{const f=fixture();f.provider.subscriptions.fetch=async()=>{throw new Error('offline');};await assert.rejects(f.reconcile({uid:'owner',paymentId:'pay_test'}));assert.equal(f.rows.size,0);});
test('expired paid periods do not reactivate access',async()=>{const f=fixture();f.subscription.current_end=1;await assert.rejects(f.reconcile({uid:'owner'}));assert.equal(f.rows.size,0);});
test('rechecking an established payment restores a missing invoice without duplicate events',async()=>{
 const f=fixture();await f.reconcile({uid:'owner',paymentId:'pay_test'});f.rows.delete('billing_invoices/rp_pay_test');
 await f.reconcile({uid:'owner',paymentId:'pay_test'});assert.equal(f.rows.get('billing_invoices/rp_pay_test').status,'paid');assert.equal(f.calls.length,1);
});
test('newer paid subscriptions can replace an older subscription but old receipts cannot',async()=>{
 for(const newer of [true,false]) {
  const f=fixture();f.rows.set('billing/owner',{plan:'pro',subId:'sub_old'});f.subscription.created_at=newer?200:50;
  f.provider.subscriptions.fetch=async id=>id==='sub_old'?{id,created_at:100,notes:{userId:'owner'}}:f.subscription;
  if(newer) assert.equal((await f.reconcile({uid:'owner',paymentId:'pay_test'})).activation,'active');
  else await assert.rejects(f.reconcile({uid:'owner',paymentId:'pay_test'}));
 }
});
