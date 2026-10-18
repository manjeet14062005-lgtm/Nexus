import { reauthenticateWithGoogle, reauthenticateWithPassword } from './reauthentication';
import { supabase } from './supabaseClient';
jest.mock('./supabaseClient', () => ({ assertSupabaseConfigured: jest.fn(), supabase: { auth: { signInWithPassword: jest.fn(), signInWithOAuth: jest.fn(), signOut: jest.fn() } } }));
afterEach(() => jest.clearAllMocks());
test('password verification signs in as the current account', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  await expect(reauthenticateWithPassword({ uid: 'owner', email: 'owner@example.com' }, 'test-password')).resolves.toEqual({ id: 'owner' });
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'test-password' });
});
test('a failed password does not report successful verification', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid credentials') });
  await expect(reauthenticateWithPassword({ uid: 'owner', email: 'owner@example.com' }, 'incorrect')).rejects.toThrow('Invalid credentials');
});
test('a different returned identity is rejected and signed out locally', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
  await expect(reauthenticateWithPassword({ uid: 'owner', email: 'owner@example.com' }, 'test-password')).rejects.toThrow('owns this workspace');
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
test('Google sign-in returns to a fixed local workspace route, never a deletion endpoint', async () => {
  supabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
  await reauthenticateWithGoogle('workspace/with?symbols');
  const options = supabase.auth.signInWithOAuth.mock.calls[0][0];
  const url = new URL(options.options.redirectTo);
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe('/workspace');
  expect(url.searchParams.get('reauthWorkspace')).toBe('workspace/with?symbols');
  expect(options.options.queryParams.prompt).toBe('select_account');
});
test('security reauthentication returns to security without automatically applying an action', async () => {
  supabase.auth.signInWithOAuth.mockResolvedValue({ error: null });
  await reauthenticateWithGoogle('team', '/security');
  const url = new URL(supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo);
  expect(url.pathname).toBe('/security'); expect(url.searchParams.get('reauthWorkspace')).toBe('team'); expect(url.searchParams.has('action')).toBe(false);
});
