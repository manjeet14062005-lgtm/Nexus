import { OTP_SERVER_URL } from "../core/appConstants.js";

async function fetchWithTimeout(url, options = {}) {
  const {timeoutMs=30000,...fetchOptions}=options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, Math.min(120000,Math.max(1000,Number(timeoutMs)||30000)));
  try { return await fetch(url, { ...fetchOptions, signal: controller.signal }); }
  catch (error) {
    if (error.name === 'AbortError' && !options.signal?.aborted) throw new Error('The server took too long to respond. Try again.');
    if (error instanceof TypeError) throw new Error('Unable to reach the Nexus server. Check that the backend is running.');
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

export async function apiRequest(user, path, options = {}) {
  if (!user) throw new Error("Authentication required.");
  const token = await user.getIdToken();
  if (!token) {
    const error = new Error("Authentication session is not ready. Please wait a moment and try again.");
    error.status = 401;
    throw error;
  }
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("X-Client-Version", "nexus-supabase-migration");

  const response = await fetchWithTimeout(`${OTP_SERVER_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {
    data = { success: false, message: `Unexpected server response (${response.status}).` };
  }

  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function apiPublic(path, options = {}) {
  return fetchWithTimeout(`${OTP_SERVER_URL}${path}`, options).then(async (response) => {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {
      throw new Error(`Unexpected server response (${response.status}).`);
    }
    if (!response.ok) {
      const error = new Error(data.message || `Request failed with status ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  });
}


export async function apiDownload(user, path, options = {}) {
  if (!user) throw new Error("Authentication required.");
  const token = await user.getIdToken();
  if (!token) {
    const error = new Error("Authentication session is not ready. Please wait a moment and try again.");
    error.status = 401;
    throw error;
  }
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Client-Version", "nexus-supabase-migration");
  const response = await fetchWithTimeout(`${OTP_SERVER_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    const error = new Error(data.message || `Request failed with status ${response.status}.`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return response.blob();
}
