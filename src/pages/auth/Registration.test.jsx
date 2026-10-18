import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { Registration } from './Registration';
import { createUserWithEmailAndPassword, sendEmailVerification } from '../../lib/supabaseAuth';
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../components/common/AuthExperience', () => ({ AuthExperience: ({ children }) => <div>{children}</div> }));
jest.mock('../../lib/supabaseLegacy', () => ({ auth: {} }));
jest.mock('../../lib/supabaseAuth', () => ({ createUserWithEmailAndPassword: jest.fn(), sendEmailVerification: jest.fn() }));
jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }));
let host, root;
const originalFetch = global.fetch;
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT = true;
 AbortSignal.timeout = jest.fn(() => new AbortController().signal);
 global.fetch = jest.fn().mockImplementation(async url => ({ ok: true, json: async () => url.endsWith('/verify-otp') ? { verified: true, proof: { token: 'test-proof', expiresAt: Date.now() + 900000 } } : url.endsWith('/auth/check-registration-email') ? { registered: false } : { success: true } }));
 jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
 localStorage.setItem('regDraft', JSON.stringify({ name: 'Test Person', email: 'test@example.com', country: 'India', state: 'Delhi', gender: 'other', password: 'legacy-secret' }));
 host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); global.fetch = originalFetch; });
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text);
async function reachReview() {
 await act(async () => root.render(<Registration />));
 const password = host.querySelector('input[type="password"]');
 expect(password.value).toBe('');
 act(() => Simulate.change(password, { target: { value: 'test-password', type: 'password' } }));
 await act(async () => button('Continue').click());
 act(() => Simulate.change(host.querySelector('input[inputmode="tel"]'), { target: { value: '9876543210' } }));
 await act(async () => button('Send OTP').click());
 act(() => Simulate.change(host.querySelector('input[placeholder="6-digit code"]'), { target: { value: '123456' } }));
 await act(async () => button('Verify').click());
 act(() => host.querySelector('input[type="checkbox"]').click());
}
test('successful signup reaches verification without a second email request', async () => {
 createUserWithEmailAndPassword.mockResolvedValue({ user: { email: 'test@example.com', emailVerified: false }, session: null });
 await reachReview();
 await act(async () => button('Create account').click());
 expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
 expect(createUserWithEmailAndPassword.mock.calls[0][3]).toEqual({ name: 'Test Person', phone: '+919876543210', agreedToTerms: true, phoneVerified: true, signupPhoneProof: 'test-proof' });
 expect(sendEmailVerification).not.toHaveBeenCalled();
 expect(mockNavigate).toHaveBeenCalledWith('/verify-email', { replace: true });
 expect(localStorage.getItem('regDraft')).toBeNull();
 expect(Number(sessionStorage.getItem('nexus_signup_email_sent_at'))).toBeGreaterThan(Date.now() - 5000);
 expect(localStorage.getItem('nexus_pending_verification_email')).toBe('test@example.com');
});
test('a genuine signup failure retains the form and provides recovery', async () => {
 createUserWithEmailAndPassword.mockRejectedValue({ status: 429, code: 'over_email_send_rate_limit' });
 await reachReview();
 await act(async () => button('Create account').click());
 expect(host.querySelector('[role="alert"]').textContent).toContain('Please wait');
 expect(mockNavigate).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem('regDraft')).password).toBeUndefined();
 expect(button('Create account').disabled).toBe(false);
});

test('country selection sends the full international destination to OTP', async () => {
 createUserWithEmailAndPassword.mockResolvedValue({});
 const originalFetch = global.fetch;
 global.fetch = jest.fn().mockImplementation(async url => ({ ok: true, json: async () => url.endsWith('/auth/check-registration-email') ? { registered: false } : { success: false, message: 'Mock transport' } }));
 await act(async () => root.render(<Registration />));
 act(() => Simulate.change(host.querySelector('input[type="password"]'), { target: { value: 'test-password', type: 'password' } }));
 await act(async () => button('Continue').click());
 act(() => { const select = host.querySelector('select'); select.value = 'GB'; Simulate.change(select); });
 expect(host.querySelector('select').value).toBe('GB');
 expect(host.querySelector('select').selectedOptions[0].textContent).toContain('+44');
 expect(host.querySelector('select').closest('.MuiOutlinedInput-root').querySelector('input[inputmode="tel"]')).not.toBeNull();
 expect(host.querySelector('input[placeholder="6-digit code"]').disabled).toBe(true);
 act(() => Simulate.change(host.querySelector('input[inputmode="tel"]'), { target: { value: '020 7946 0018' } }));
 expect(button('Send OTP').disabled).toBe(false);
 AbortSignal.timeout = jest.fn(() => new AbortController().signal);
 await act(async () => button('Send OTP').click());
 expect(JSON.parse(global.fetch.mock.calls.find(([url]) => url.endsWith('/send-otp'))[1].body).phone).toBe('+442079460018');
 global.fetch = originalFetch;
});

test('registration cannot proceed without phone verification', async () => {
 await act(async () => root.render(<Registration />));
 act(() => Simulate.change(host.querySelector('input[type="password"]'), { target: { value: 'test-password', type: 'password' } }));
 await act(async () => button('Continue').click());
 act(() => Simulate.change(host.querySelector('input[inputmode="tel"]'), { target: { value: '9876543210' } }));
 act(() => host.querySelector('input[type="checkbox"]').click());
 act(() => button('Create account').click());
 expect(host.textContent).toContain('Verify your phone number before continuing.');
 expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
});


test('existing email stays on account step and offers sign in', async () => {
 global.fetch.mockResolvedValue({ ok: true, json: async () => ({ registered: true }) });
 await act(async () => root.render(<Registration />));
 act(() => Simulate.change(host.querySelector('input[type="password"]'), { target: { value: 'test-password', type: 'password' } }));
 await act(async () => button('Continue').click());
 expect(host.textContent).toContain('This email is already registered. Please sign in.');
 expect(host.querySelector('input[inputmode="tel"]')).toBeNull();
 act(() => button('Sign in to your account').click());
 expect(mockNavigate).toHaveBeenCalledWith('/login');
});

test('email lookup outage does not advance registration', async () => {
 global.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Please try again shortly.' }) });
 await act(async () => root.render(<Registration />));
 act(() => Simulate.change(host.querySelector('input[type="password"]'), { target: { value: 'test-password', type: 'password' } }));
 await act(async () => button('Continue').click());
 expect(host.textContent).toContain('Please try again shortly.');
 expect(host.querySelector('input[inputmode="tel"]')).toBeNull();
 expect(button('Continue').disabled).toBe(false);
});
