// Provider reads only: never creates, captures, cancels or refunds a payment.
function billingError(message, status = 409) { return Object.assign(new Error(message), { status }); }
function createBillingReconciler({ db, provider, planIds, planParts, planAmount, getPlan, notify = async () => {} }) {
  return async function reconcile({ uid, subscriptionId = '', paymentId = '' }) {
    if (subscriptionId && !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw billingError('Invalid subscription reference.', 400);
    if (paymentId && !/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw billingError('Invalid payment reference.', 400);
    let payment = null, invoice = null;
    if (paymentId) {
      payment = await provider.payments.fetch(paymentId);
      if (!payment.invoice_id) throw billingError('This payment is not linked to a subscription invoice. Contact support.');
      invoice = await provider.invoices.fetch(payment.invoice_id);
      if (subscriptionId && subscriptionId !== invoice.subscription_id) throw billingError('Payment and subscription do not match.', 400);
      subscriptionId = invoice.subscription_id;
    }
    const checkoutRef = db.collection('billing_checkouts').doc(uid);
    const saved = await checkoutRef.get();
    const billingRef = db.collection('billing').doc(uid);
    const billing = await billingRef.get();
    subscriptionId = subscriptionId || (saved.exists && saved.data().subscriptionId) || (billing.exists && billing.data().subId);
    if (!subscriptionId) {
      // Recovery for checkouts created before durable tracking was introduced.
      // Bounded lookup; nothing belonging to other accounts is returned.
      const page = await provider.subscriptions.all({ count: 100 });
      const owned = (page.items || []).filter(s => s.notes?.userId === uid)
        .sort((a,b) => Number(b.created_at || 0) - Number(a.created_at || 0));
      subscriptionId = owned[0]?.id;
    }
    if (!subscriptionId) return { success: true, activation: 'not_found', message: 'No recent subscription found. Enter your payment reference or contact support.' };
    const subscription = await provider.subscriptions.fetch(subscriptionId);
    if (subscription.notes?.userId !== uid) throw billingError('Subscription ownership could not be verified.', 403);
    const parts = planParts(subscription.notes?.planKey);
    if (!parts || planIds[subscription.notes.planKey] !== subscription.plan_id) throw billingError('Subscription plan does not match the configured billing catalog. Contact support.');
    if (subscription.status !== 'active' || Number(subscription.paid_count) < 1) {
      return { success: true, activation: 'pending', subscriptionId, providerStatus: subscription.status,
        message: `Subscription status: ${subscription.status || 'unknown'}. Activation is not confirmed. Do not pay again; check status shortly.` };
    }
    const plan = await provider.plans.fetch(subscription.plan_id), expected = planAmount(parts.planId, parts.cycle);
    if (expected == null || Number(plan.item?.amount) !== expected || plan.item?.currency !== 'INR' || Number(subscription.quantity) !== 1
      || plan.period !== (parts.cycle === 'annual' ? 'yearly' : 'monthly') || Number(plan.interval) !== 1) throw billingError('Provider price or billing cycle does not match the Nexus catalog. Contact support.');
    if (!invoice) {
      const page = await provider.invoices.all({ subscription_id: subscriptionId, count: 100 });
      invoice = (page.items || []).filter(i => i.subscription_id === subscriptionId && i.status === 'paid' && i.payment_id)
        .sort((a,b) => Number(b.paid_at || b.created_at || 0) - Number(a.paid_at || a.created_at || 0))[0];
      if (invoice) payment = await provider.payments.fetch(invoice.payment_id);
    }
    if (!invoice || !payment || invoice.subscription_id !== subscriptionId || invoice.payment_id !== payment.id || payment.invoice_id !== invoice.id
      || invoice.status !== 'paid' || payment.status !== 'captured' || Number(payment.amount_refunded || 0) !== 0
      || Number(payment.amount) !== expected || Number(invoice.amount_paid) !== expected || payment.currency !== 'INR' || invoice.currency !== 'INR') {
      throw billingError('A matching captured subscription payment is not available yet. Do not pay again; check status shortly.');
    }
    const now = new Date().toISOString(), end = Number(subscription.current_end);
    if (!Number.isFinite(end) || end * 1000 <= Date.now()) throw billingError('The paid subscription period has ended. Contact support.');
    const state = { uid, plan: parts.planId, cycle: parts.cycle, status: 'active', amount: expected/100,
      paymentId: payment.id, subId: subscriptionId, nextBilling: new Date(end*1000).toISOString().slice(0,10),
      source: 'razorpay-provider-check', verifiedAt: now, updatedAt: now };
    let replaceableSubscription = null;
    const stored = billing.exists ? billing.data() : {};
    if (stored.subId && stored.subId !== subscriptionId && stored.plan !== 'starter') {
      const previous = await provider.subscriptions.fetch(stored.subId);
      const ranks = ['starter', 'pro', 'enterprise'];
      if (previous.notes?.userId === uid && Number(subscription.created_at) > Number(previous.created_at)
        && ranks.indexOf(parts.planId) >= ranks.indexOf(stored.plan)) replaceableSubscription = stored.subId;
    }
    let changed = false;
    await db.runTransaction(async tx => {
      const current = await tx.get(billingRef);
      const previous = current.exists ? current.data() : {};
      // Never overwrite a different established subscription from an old receipt.
      if (previous.subId && previous.subId !== subscriptionId && previous.plan !== 'starter' && previous.subId !== replaceableSubscription) throw billingError('A different subscription is already linked. Contact support before changing it.');
      changed = previous.paymentId !== payment.id || previous.subId !== subscriptionId || previous.plan !== parts.planId || previous.status !== 'active';
      if (changed) tx.set(billingRef, state, { merge: true });
      tx.set(db.collection('billing_invoices').doc(`rp_${payment.id}`), { uid, invoiceId: `INV-${payment.id}`,
        date: new Date(Number(payment.created_at || Date.now()/1000)*1000).toISOString().slice(0,10),
        amount: expected/100, currency: 'INR', status: 'paid', plan: `${getPlan(parts.planId).name} ${parts.cycle === 'annual' ? 'Annual' : 'Monthly'}`,
        description: `Payment for ${getPlan(parts.planId).name}`, paymentId: payment.id, orderId: payment.order_id || null,
        source: 'razorpay-provider-check', createdAt: now }, { merge: true });
      tx.set(checkoutRef, { uid, subscriptionId, planKey: subscription.notes.planKey, paymentId: payment.id, status: 'active', updatedAt: now }, { merge: true });
    });
    if (changed) { try { await notify(uid, 'subscription.updated', { plan: state.plan, cycle: state.cycle, status: 'active', subscription_id: subscriptionId, payment_id: payment.id }); } catch { /* Billing commit remains successful; webhook delivery is independent. */ } }
    return { success: true, activation: 'active', subscriptionId, billing: state, message: 'Nexus confirmed your paid subscription. Your plan is active.' };
  };
}
module.exports = { createBillingReconciler };
