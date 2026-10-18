// recentAuth.js — Recent-auth detection helper for frontend.
// Reads auth_time from the JWT to determine if the user authenticated recently.

import { supabase } from "../../../lib/supabaseClient";

const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Parses the JWT payload from a base64 string.
 */
function parseJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/**
 * Returns true if the user authenticated within the recent-auth window.
 */
export async function isRecentlyAuthenticated() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return false;
    const payload = parseJwtPayload(token);
    if (!payload?.auth_time) return false;
    const authAge = Date.now() - payload.auth_time * 1000;
    return authAge <= RECENT_AUTH_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Retry the given async action, prompting for reauth if RECENT_AUTH_REQUIRED.
 * Returns { success, data, needsReauth }.
 */
export async function withRecentAuthRetry(action) {
  try {
    const data = await action();
    return { success: true, data, needsReauth: false };
  } catch (error) {
    const code = error?.data?.code || error?.code;
    if (code === "RECENT_AUTH_REQUIRED" || error?.status === 401) {
      return { success: false, data: null, needsReauth: true, error };
    }
    throw error;
  }
}
