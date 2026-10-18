import { createEmailConfirmationCheck, withVerificationTimeout } from './emailConfirmation';
const user = { id: 'user-1', email_confirmed_at: '2026-09-29T00:00:00Z' };
function setup(href = 'http://localhost/verify-email') {
 const auth = { initialize: jest.fn().mockResolvedValue({ error: null }), getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }), refreshSession: jest.fn().mockResolvedValue({ data: { user, session: {} }, error: null }), verifyOtp: jest.fn().mockResolvedValue({ error: null }) };
 const history = { replaceState: jest.fn(), state: null };
 return { auth, history, check: createEmailConfirmationCheck({ auth }, { href }, history) };
}
test('waits for callback and refreshes the session used by route guards', async () => {
 const { auth, check } = setup();
 expect(await check()).toEqual(user);
 expect(auth.initialize).toHaveBeenCalledTimes(1);
 expect(auth.refreshSession).toHaveBeenCalledTimes(1);
 expect(auth.initialize.mock.invocationCallOrder[0]).toBeLessThan(auth.getUser.mock.invocationCallOrder[0]);
});
test('consumes custom confirmation tokens once and removes them from the address', async () => {
 const { auth, history, check } = setup('http://localhost/verify-email?token_hash=test-token&type=email');
 await Promise.all([check(), check()]);
 expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
 expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'test-token', type: 'email' });
 expect(history.replaceState).toHaveBeenCalledWith(null, '', '/verify-email');
});
test('expired email links show an actionable error instead of checking an old session', async () => {
 const { auth, check } = setup('http://localhost/verify-email#error=access_denied&error_code=otp_expired');
 await expect(check()).rejects.toThrow('expired');
 expect(auth.getUser).not.toHaveBeenCalled();
});
test('unconfirmed users never receive a refreshed verified session', async () => {
 const { auth, check } = setup();
 auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
 await check(); expect(auth.refreshSession).not.toHaveBeenCalled();
});
test('network stalls become a retry message', async () => {
 await expect(withVerificationTimeout(() => new Promise(() => {}), 10)).rejects.toThrow('timed out');
});
