import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Simulate } from 'react-dom/test-utils';
import { BillingPage } from './BillingPage';
import { apiRequest, apiDownload } from '../../services/apiClient';
import { trustedCheckoutLink } from './PhoneCheckout';
jest.mock('../../services/apiClient', () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
jest.mock('react-hot-toast', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
const user = { uid: 'owner' }, plans = [{ id: 'starter', name: 'Starter', workspaceLimit: 1, features: [], monthly: 0 }, { id: 'pro', name: 'Pro', monthly: 10, availableCycles: ['monthly'], features: [], workspaceLimit: 5 }];
let host, root, checkout;
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent === text);
const field = label => [...document.querySelectorAll('input')].find(el => document.querySelector(`label[for="${el.id}"]`)?.textContent === label);
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); checkout = undefined; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
 window.Razorpay = function (options) { checkout = options; this.open = jest.fn(); this.on = jest.fn(); };
 apiRequest.mockImplementation(async (_, path) => {
  if (path === '/billing/plans') return { plans };
  if (path === '/billing/state') return { billing: { plan: 'starter', status: 'active', cycle: 'monthly' } };
  if (path === '/billing/invoices') return { invoices: [{ id: 'paid-record', status: 'paid', date: '2026-10-01', amount: 10 }, { id: 'refunded-record', status: 'refunded', date: '2026-09-01', amount: 5 }] };
  if (path === '/workspaces') return { workspaces: [] };
  if (path === '/razorpay/create-sub') return { success: true, subscriptionId: 'sub-test', keyId: 'test' };
  return {};
 });
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete window.Razorpay; jest.useRealTimers(); });
async function mount(account = user) { await act(async () => root.render(<MemoryRouter><BillingPage user={account} userRole="user" /></MemoryRouter>)); }
test('subscription plans and upgrade actions are visible immediately on the billing page', async () => {
 await mount(); expect(host.textContent).toContain('Room to build.'); expect(host.textContent).toContain('Your payment history'); expect(host.textContent).toContain('Choose the right plan'); expect(button('Upgrade to Pro').disabled).toBe(false); expect(host.textContent.indexOf('Choose the right plan')).toBeLessThan(host.textContent.indexOf('Room to build.')); expect(button('Compare plans')).toBeUndefined();
});
test('invoice search filters displayed records', async () => {
 await mount(); await act(async () => button('Invoices').click()); await act(async () => Simulate.change(field('Search invoices'), { target: { value: 'refunded' } }));
 expect(host.textContent).toContain('refunded-record'); expect(host.textContent).not.toContain('paid-record');
});
test('an old account billing response is aborted and cannot replace the new account', async () => {
 const normal = apiRequest.getMockImplementation(); let resolve, signal;
 apiRequest.mockImplementation((u, path, opts) => u.uid === 'owner' && path === '/billing/state' ? new Promise(done => { resolve = done; signal = opts.signal; }) : normal(u, path, opts));
 await mount(); await mount({ uid: 'other' }); expect(signal.aborted).toBe(true);
 await act(async () => resolve({ billing: { plan: 'pro', status: 'active' } })); expect(host.querySelector('.billing-hero').textContent).toContain('Starter'); expect(host.querySelector('.billing-hero').textContent).not.toContain('Pro');
});
test('duplicate export clicks produce a single download request', async () => {
 let reject; apiDownload.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
 await mount(); await act(async () => button('Invoices').click()); await act(async () => { button('Export all').click(); button('Export all').click(); });
 expect(apiDownload).toHaveBeenCalledTimes(1); await act(async () => reject(new Error('Unavailable'))); expect(button('Export all').disabled).toBe(false);
});
test('duplicate checkout clicks create only one subscription', async () => {
 await mount(); await act(async () => button('Upgrade to Pro').click());
 await act(async () => { button('Continue to payment').click(); button('Continue to payment').click(); });
 expect(apiRequest.mock.calls.filter(([, path]) => path === '/razorpay/create-sub')).toHaveLength(1); expect(checkout.subscription_id).toBe('sub-test');
 expect(checkout.image).toMatch(/^data:image\/png;base64,/);
 const logo = Buffer.from(checkout.image.split(',')[1], 'base64');
 expect(logo.readUInt32BE(16)).toBe(512); expect(logo.readUInt32BE(20)).toBe(512);
 await act(async () => checkout.modal.ondismiss());
});
test('phone handoff renders the existing hosted link without opening another checkout or granting a plan', async () => {
 const normal = apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u,path,opts)=>path==='/razorpay/create-sub'?Promise.resolve({success:true,subscriptionId:'sub-test',shortUrl:'https://rzp.io/i/example'}):normal(u,path,opts));
 await mount(); await act(async()=>button('Upgrade to Pro').click());
 await act(async()=>{button('Open checkout on phone').click();button('Open checkout on phone')?.click();});
 expect(apiRequest.mock.calls.filter(([,path])=>path==='/razorpay/create-sub')).toHaveLength(1);
 expect(document.body.textContent).toContain('not a direct UPI payment QR');
 expect(document.querySelector('svg[role="img"]') || document.querySelector('svg title')).not.toBeNull();
 expect(checkout).toBeUndefined();
 expect(apiRequest.mock.calls.some(([,path])=>path==='/razorpay/verify')).toBe(false);
 expect(button('Check existing payment')).toBeDefined();
});
test('phone checkout rejects unsafe links and missing links without inventing a payment URL', async () => {
 for(const value of ['http://rzp.io/a','https://evil.test/a','https://rzp.io.evil.test/a','https://name:secret@rzp.io/a',['javascript','alert(1)'].join(':'),null])expect(trustedCheckoutLink(value)).toBeNull();
 expect(trustedCheckoutLink('https://rzp.io/i/example')).toBe('https://rzp.io/i/example');
 await mount(); await act(async()=>button('Upgrade to Pro').click());
 await act(async()=>button('Open checkout on phone').click());
 expect(button('Continue to payment').disabled).toBe(false);
 expect(button('Check existing payment')).toBeUndefined();
});
test('checkout callbacks cannot duplicate verification or release the lock during verification', async () => {
 await mount(); await act(async () => button('Upgrade to Pro').click()); await act(async () => button('Continue to payment').click());
 const normal = apiRequest.getMockImplementation(); let resolve, completion;
 apiRequest.mockImplementation((u, path, opts) => path === '/razorpay/verify' ? new Promise(done => { resolve = done; }) : normal(u, path, opts));
 await act(async () => { completion = checkout.handler({}); checkout.handler({}); checkout.modal.ondismiss(); });
 expect(apiRequest.mock.calls.filter(([, path]) => path === '/razorpay/verify')).toHaveLength(1); expect(button('Check existing payment').disabled).toBe(true); expect(host.textContent).toContain('Verifying your payment');
 await act(async () => { resolve({ verified: false }); await completion; });
 expect(host.querySelector('.billing-hero').textContent).toContain('Starter');
});
test('verified payment does not activate a plan without active provider confirmation', async () => {
 jest.useFakeTimers();
 await mount(); await act(async () => button('Upgrade to Pro').click()); await act(async () => button('Continue to payment').click());
 const normal = apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u, path, opts) => path === '/razorpay/verify' ? Promise.resolve({ verified: true }) : normal(u, path, opts));
 let completion; await act(async () => { completion = checkout.handler({}); });
 for (let index = 0; index < 8; index++) await act(async () => jest.advanceTimersByTime(1500));
 await act(async () => completion);
 expect(host.textContent).toContain('Activation is pending'); expect(button('Upgrade to Pro').disabled).toBe(true); expect(host.querySelector('.billing-hero').textContent).toContain('Starter');
});

test('provider reconciliation activates a captured payment without waiting for a webhook', async () => {
 await mount(); await act(async () => button('Upgrade to Pro').click()); await act(async () => button('Continue to payment').click());
 const normal=apiRequest.getMockImplementation(); const active={plan:'pro',status:'active',source:'razorpay-provider-check',cycle:'monthly'};
 apiRequest.mockImplementation((u,path,opts)=>path==='/razorpay/verify'?Promise.resolve({verified:true}):path==='/razorpay/reconcile'?Promise.resolve({activation:'active',billing:active}):path==='/billing/state'?Promise.resolve({billing:active}):normal(u,path,opts));
 await act(async()=>checkout.handler({razorpay_payment_id:'pay_test'}));
 expect(host.querySelector('.billing-hero').textContent).toContain('Pro');expect(host.textContent).toContain('Your subscription is active');
 expect(apiRequest.mock.calls.filter(([,path])=>path==='/razorpay/create-sub')).toHaveLength(1);
});
