import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EmailVerificationPage } from './EmailVerificationPage';
import { auth, checkEmailConfirmation, sendEmailVerification, onAuthStateChanged, signOut } from '../../lib/supabaseAuth';
import { toast } from 'react-hot-toast';

const mockNavigate = jest.fn();
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, Link: require('react').forwardRef(({ children, ...props }, ref) => <span ref={ref} {...props}>{children}</span>) }));
jest.mock('../../components/common/AuthExperience', () => ({ AuthExperience: ({ children }) => <div>{children}</div> }));
jest.mock('../../lib/supabaseAuth', () => ({
    auth: { currentUser: null },
    onAuthStateChanged: jest.fn(),
    checkEmailConfirmation: jest.fn(),
    sendEmailVerification: jest.fn(),
    signOut: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

let host, root;
beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    auth.currentUser = null;
    checkEmailConfirmation.mockResolvedValue(null);
    sendEmailVerification.mockResolvedValue(undefined);
    signOut.mockResolvedValue(undefined);
    onAuthStateChanged.mockReturnValue(() => { });
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ verified: false }),
    });
    localStorage.setItem('nexus_pending_verification_email', 'test@example.com');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const button = text => [...host.querySelectorAll('button')].find(x => x.textContent === text);

test('confirmation page permits resend without a signed-in session and applies cooldown', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    expect(button('I’ve verified my email').disabled).toBe(false);
    await act(async () => button('Resend confirmation email').click());
    expect(sendEmailVerification).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(button('Resend available in 60s').disabled).toBe(true);
});

test('a confirmed auth event signs out the temporary verification session and opens sign-in', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => onAuthStateChanged.mock.calls[0][1]({ email: 'test@example.com', emailVerified: true }));
    expect(signOut).toHaveBeenCalledWith(auth, { scope: 'local' });
    expect(toast.success).toHaveBeenCalledWith('Email verified. Please sign in.');
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
});

test('manual confirmation redirects to sign-in when Supabase reports the refreshed user as verified', async () => {
    auth.currentUser = { email: 'test@example.com', emailVerified: false };
    await act(async () => root.render(<EmailVerificationPage />));
    checkEmailConfirmation.mockResolvedValue({ emailVerified: true });
    await act(async () => button('I’ve verified my email').click());
    expect(signOut).toHaveBeenCalledWith(auth, { scope: 'local' });
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
});

test('clicking before verification shows the requested popup and stays on the page', async () => {
    checkEmailConfirmation.mockResolvedValue({ emailVerified: false });
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => button('I’ve verified my email').click());
    expect(toast.error).toHaveBeenCalledWith('You have not verified the email yet.');
    expect(host.textContent).toContain('You have not verified the email yet.');
    expect(mockNavigate).not.toHaveBeenCalled();
});

test('missing browser session falls back to server verification status', async () => {
    checkEmailConfirmation.mockRejectedValue({ name: 'AuthSessionMissingError' });
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ verified: true }) });
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => button('I’ve verified my email').click());
    expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/check-email-verification'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'test@example.com' }) }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
});

test('missing browser session and unverified server status shows the not-verified popup', async () => {
    checkEmailConfirmation.mockRejectedValue({ name: 'AuthSessionMissingError' });
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => button('I’ve verified my email').click());
    expect(toast.error).toHaveBeenCalledWith('You have not verified the email yet.');
    expect(mockNavigate).not.toHaveBeenCalled();
});

test('returning to the tab detects a newly confirmed session and opens sign-in', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    checkEmailConfirmation.mockResolvedValue({ emailVerified: true });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
});
