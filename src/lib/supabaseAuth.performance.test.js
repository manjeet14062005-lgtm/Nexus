import { auth } from './supabaseAuth';
import { supabase } from './supabaseClient';
jest.mock('./supabaseClient', () => ({
  supabaseConfigured: true, assertSupabaseConfigured: jest.fn(),
  supabase: { auth: { onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })), getSession: jest.fn() } },
}));
beforeEach(() => { jest.useFakeTimers(); supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }); });
afterEach(() => jest.useRealTimers());
function subscribe() {
  const callback = jest.fn(); const unsubscribe = auth.onAuthStateChanged(callback);
  const emit = supabase.auth.onAuthStateChange.mock.calls.at(-1)[0];
  return { callback, unsubscribe, emit };
}
test('unchanged sign-in and token-refresh events do not reload all page data', async () => {
  const { callback, emit, unsubscribe } = subscribe();
  const user = { id: 'one', email: 'one@example.test', email_confirmed_at: 'confirmed' };
  emit('INITIAL_SESSION', { user }); jest.runOnlyPendingTimers();
  emit('SIGNED_IN', { user: { ...user } }); emit('TOKEN_REFRESHED', { user: { ...user } });
  jest.runOnlyPendingTimers(); expect(callback).toHaveBeenCalledTimes(1);
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: 'new-token' } } });
  await expect(callback.mock.calls[0][0].getIdToken()).resolves.toBe('new-token');
  unsubscribe();
});
test('confirmation, profile updates, account changes and sign-out are delivered', () => {
  const { callback, emit, unsubscribe } = subscribe();
  emit('INITIAL_SESSION', null);
  emit('SIGNED_IN', { user: { id: 'one' } });
  emit('USER_UPDATED', { user: { id: 'one', email_confirmed_at: 'now' } });
  emit('USER_UPDATED', { user: { id: 'one', user_metadata: { name: 'New name' } } });
  emit('SIGNED_IN', { user: { id: 'two' } }); emit('SIGNED_OUT', null);
  jest.runOnlyPendingTimers(); expect(callback).toHaveBeenCalledTimes(6);
  expect(callback.mock.calls[2][0].emailVerified).toBe(true);
  expect(callback.mock.calls[3][0].displayName).toBe('New name');
  expect(callback.mock.calls[4][0].uid).toBe('two'); expect(callback.mock.calls[5][0]).toBeNull();
  unsubscribe();
});
test('unsubscribed listeners never publish queued identity events', () => {
  const { callback, emit, unsubscribe } = subscribe(); emit('SIGNED_IN', { user: { id: 'one' } });
  unsubscribe(); jest.runOnlyPendingTimers(); expect(callback).not.toHaveBeenCalled();
});
