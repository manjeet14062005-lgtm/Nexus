// useAccountActions.js — All account mutation actions with optimistic updates,
// rollback, and reauth-aware retry behavior.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { doc, updateDoc } from "../../../lib/supabaseDataCompat.js";
import { db, auth } from "../../../lib/supabaseLegacy";
import { signOut, sendPasswordResetEmail } from "../../../lib/supabaseAuth.js";
import { apiRequest, apiDownload } from "../../../services/apiClient.js";
import { withRecentAuthRetry } from "../lib/recentAuth.js";
import { downloadString, buildProfileCsv } from "../lib/exportHelpers.js";
import { compressImageFile } from "../../../utils/imageCompressor.js";




/**
 * All account mutations in one hook.
 * Returns action functions + state for pending operations.
 */
export function useAccountActions({ user, profileData, onNeedsReauth, onDeletionChange, onProfileChange }) {
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const pendingActionRef = useRef(null);
  const identityRef=useRef(user?.uid);identityRef.current=user?.uid;
  const writeLock=useRef(false);
  useEffect(()=>{pendingActionRef.current=null;},[user?.uid]);

  // ── Profile save ─────────────────────────────────────────────────────────
  const saveProfile = useCallback(async (fields) => {
    const docId = profileData?.id || user?.uid;
    if (!docId) { toast.error("Profile not loaded yet."); return false; }
    if(writeLock.current)return false;writeLock.current=true;const owner=user?.uid;
    setSaving(true);
    // Optimistic update handled by caller via React state
    try {
      await updateDoc(doc(db, "users", docId), fields);
      if(identityRef.current!==owner)return false;
      onProfileChange?.(fields);
      toast.success("Profile saved.");
      return true;
    } catch (err) {
      toast.error(err.message || "Unable to save profile.");
      return false;
    } finally {
      setSaving(false);
      writeLock.current=false;
    }
  }, [profileData, user, onProfileChange]);

  // ── Preference save ──────────────────────────────────────────────────────
  const savePreferences = useCallback(async (prefs) => {
    const docId = profileData?.id || user?.uid;
    if (!docId) { toast.error("Profile not loaded yet."); return false; }
    if(writeLock.current)return false;writeLock.current=true;const owner=user?.uid;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", docId), prefs);
      if(identityRef.current!==owner)return false;
      onProfileChange?.(prefs);
      toast.success("Preferences saved.");
      return true;
    } catch (err) {
      toast.error(err.message || "Unable to save preferences.");
      return false;
    } finally {
      setSaving(false);
      writeLock.current=false;
    }
  }, [profileData, user, onProfileChange]);

  // ── Avatar upload ────────────────────────────────────────────────────────
  const uploadAvatar = useCallback(async (file) => {
    if (!user || !file) return null;
    if(writeLock.current)return null;writeLock.current=true;const owner=user.uid;
    setAvatarUploading(true);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image smaller than 5 MB.');
      const publicUrl = await compressImageFile(file, { maxDimension: 512 });
      if(identityRef.current!==owner)return null;
      await updateDoc(doc(db, "users", profileData?.id || user.uid), { photoUrl: publicUrl });
      if(identityRef.current!==owner)return null;
      onProfileChange?.({ photoUrl: publicUrl });

      toast.success("Avatar updated.");
      return publicUrl;
    } catch (err) {
      toast.error(err.message || "Avatar upload failed.");
      return null;
    } finally {
      setAvatarUploading(false);
      writeLock.current=false;
    }
  }, [user, profileData, onProfileChange]);

  // ── Data export (JSON from server) ──────────────────────────────────────
  const downloadAccountDataJson = useCallback(async () => {
    const action = async () => {
      const blob = await apiDownload(user, "/account/data-export.json");
      if (identityRef.current !== user.uid) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-account-${user.uid}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      toast.success("Account data export downloaded.");
    };

    const result = await withRecentAuthRetry(action);
    if (result.needsReauth && identityRef.current === user.uid) {
      pendingActionRef.current = {uid:user.uid,run:downloadAccountDataJson};
      onNeedsReauth?.("Export account data");
    }
  }, [user, onNeedsReauth]);

  // ── Data export (CSV, local) ─────────────────────────────────────────────
  const downloadProfileCsvLocal = useCallback(() => {
    const csv = buildProfileCsv({...profileData,email:user.email});
    downloadString(csv, `nexus-profile-${user?.uid || "export"}.csv`, "text/csv; charset=utf-8");
    toast.success("Profile CSV downloaded.");
  }, [profileData, user]);

  // ── Revoke all sessions ──────────────────────────────────────────────────
  const revokeAllSessions = useCallback(async () => {
    const action = async () => {
      await apiRequest(user, "/account/security/revoke-all-sessions", { method: "POST" });
      toast.success("All sessions revoked. Signing out this browser.");
      if (identityRef.current === user.uid) await signOut(auth);
    };

    const result = await withRecentAuthRetry(action);
    if (result.needsReauth && identityRef.current === user.uid) {
      pendingActionRef.current = {uid:user.uid,run:revokeAllSessions};
      onNeedsReauth?.("Revoke all sessions");
    }
  }, [user, onNeedsReauth]);

  // ── Request account deletion ─────────────────────────────────────────────
  const requestDeletion = useCallback(async () => {
    const action = async () => {
      const result = await apiRequest(user, "/account/deletion-request", { method: "POST" });
      if (identityRef.current !== user.uid) return result;
      onDeletionChange?.(result?.request || null);
      toast.success("Account deletion scheduled. You have a grace period to cancel it.");
      return result;
    };

    const result = await withRecentAuthRetry(action);
    if (result.needsReauth && identityRef.current === user.uid) {
      pendingActionRef.current = {uid:user.uid,run:requestDeletion};
      onNeedsReauth?.("Schedule account deletion");
    }
  }, [user, onNeedsReauth, onDeletionChange]);

  // ── Cancel account deletion ──────────────────────────────────────────────
  const cancelDeletion = useCallback(async () => {
    const action = async () => {
      const result = await apiRequest(user, "/account/deletion-request/cancel", { method: "POST" });
      if (identityRef.current !== user.uid) return result;
      onDeletionChange?.(result?.request || null);
      toast.success("Account deletion cancelled.");
      return result;
    };

    const result = await withRecentAuthRetry(action);
    if (result.needsReauth && identityRef.current === user.uid) {
      pendingActionRef.current = {uid:user.uid,run:cancelDeletion};
      onNeedsReauth?.("Cancel account deletion");
    }
  }, [user, onNeedsReauth, onDeletionChange]);

  // ── Retry after reauth ───────────────────────────────────────────────────
  const retryPendingAction = useCallback(async () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action?.uid===identityRef.current) {
      await action.run();
    }
  }, []);

  const clearPendingAction = useCallback(() => { pendingActionRef.current = null; }, []);
  const [pending, setPending] = useState(false);
  const operationRef = useRef(false);
  const protect = action => async () => {
    if (operationRef.current || identityRef.current !== user?.uid) return;
    operationRef.current = true; setPending(true);
    try { await action(); } catch (error) { toast.error(error.message || 'Unable to complete this action. Please try again.'); }
    finally { operationRef.current = false; setPending(false); }
  };
  const resetPassword = async () => {
    await sendPasswordResetEmail(auth, user.email);
    toast.success('Password reset email requested. Open the link in your inbox to choose a new password.');
  };
  return {
    pending,
    resetPassword: protect(resetPassword),
    clearPendingAction,
    saving,
    avatarUploading,
    saveProfile,
    savePreferences,
    uploadAvatar,
    downloadAccountDataJson: protect(downloadAccountDataJson),
    downloadProfileCsvLocal,
    revokeAllSessions: protect(revokeAllSessions),
    requestDeletion: protect(requestDeletion),
    cancelDeletion: protect(cancelDeletion),
    retryPendingAction: protect(retryPendingAction),
  };
}
