// Supabase owns implicit/PKCE callback consumption. Await it before checking
// the user; custom email templates may instead supply a token_hash.
export function createEmailConfirmationCheck(client, location, history) {
  let callback;
  const consumeCallback = () => {
    if (!callback) callback = (async () => {
      const url = new URL(location.href);
      const params = new URLSearchParams(url.hash.slice(1));
      const callbackError = url.searchParams.get('error') || params.get('error');
      const initialized = await client.auth.initialize();
      if (callbackError || initialized.error) {
        throw new Error('This verification link is invalid or has expired. Request a new email and open only the latest link.');
      }
      const tokenHash = url.searchParams.get('token_hash');
      if (tokenHash) {
        const type = url.searchParams.get('type');
        if (!['email', 'signup'].includes(type)) throw new Error('This link cannot be used to confirm signup. Request a new confirmation email.');
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        url.searchParams.delete('token_hash'); url.searchParams.delete('type');
        history.replaceState(history.state, '', url.pathname + url.search);
        if (error) throw new Error('This verification link is invalid or has expired. Request a new confirmation email.');
      }
    })();
    return callback;
  };
  return async () => {
    await consumeCallback();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (data.user?.email_confirmed_at) {
      // Publish TOKEN_REFRESHED to every route guard and other open tabs.
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      if (!refreshed.data.session) throw new Error('Your email is confirmed, but your session could not be restored. Please sign in to continue.');
      return refreshed.data.user || data.user;
    }
    return data.user;
  };
}

export async function withVerificationTimeout(operation, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The verification check timed out. Check your connection and try again.')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
