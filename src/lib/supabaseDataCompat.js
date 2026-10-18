import { supabase } from './supabaseClient';
import { uniqueDocumentRows } from './documentRows';

export function collection(_db, name) {
  return { kind: 'collection', path: String(name), collectionName: String(name), filters: [], order: null, limitCount: null };
}

export function doc(_db, collectionName, id) {
  return { kind: 'doc', path: `${collectionName}/${id}`, collectionName: String(collectionName), id: String(id) };
}

export function query(ref, ...constraints) {
  let out = { ...ref, filters: [...(ref.filters || [])], order: ref.order, limitCount: ref.limitCount };
  constraints.forEach((c) => {
    if (c?.type === 'where') out.filters.push(c);
    if (c?.type === 'orderBy') out.order = c;
    if (c?.type === 'limit') out.limitCount = c.count;
  });
  return out;
}

export function where(field, op, value) { return { type: 'where', field, op, value }; }
export function orderBy(field, direction = 'asc') { return { type: 'orderBy', field, direction }; }
export function limit(count) { return { type: 'limit', count: Number(count) }; }
export function serverTimestamp() { return new Date().toISOString(); }

function tableQuery(ref) {
  let q = supabase.from('nexus_documents').select('*');
  if (ref.kind === 'collection') q = q.eq('collection_name', ref.collectionName).or(`collection_path.eq.${ref.path},collection_path.like.${ref.path.replace(/[_%]/g, '\\$&')}/%`);
  for (const f of ref.filters || []) {
    const col = `data->>${f.field}`;
    if (f.op === '==') q = q.eq(col, String(f.value));
    else if (f.op === '!=') q = q.neq(col, String(f.value));
    else if (f.op === '>') q = q.gt(col, String(f.value));
    else if (f.op === '>=') q = q.gte(col, String(f.value));
    else if (f.op === '<') q = q.lt(col, String(f.value));
    else if (f.op === '<=') q = q.lte(col, String(f.value));
    else if (f.op === 'in') q = q.in(col, Array.isArray(f.value) ? f.value.map(String) : []);
  }
  if (ref.order) q = q.order(ref.order.field === 'ts' ? 'created_at' : 'updated_at', { ascending: ref.order.direction !== 'desc' });
  if (ref.limitCount) q = q.limit(ref.limitCount);
  return q;
}

function wrapRow(row) { return { id: row.doc_id, data: () => row.data || {}, exists: () => true }; }

export async function getDocs(ref) {
  if (ref.kind === 'doc') return getDoc(ref);
  const { data, error } = await tableQuery(ref);
  if (error) throw error;
  const docs = uniqueDocumentRows(data || []).map(wrapRow);
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function getCountFromServer(ref) {
  let q = supabase.from('nexus_documents').select('*', { count: 'exact', head: true });
  q = q.eq('collection_name', ref.collectionName).or(`collection_path.eq.${ref.path},collection_path.like.${ref.path.replace(/[_%]/g, '\\$&')}/%`);
  for (const f of ref.filters || []) if (f.op === '==') q = q.eq(`data->>${f.field}`, String(f.value));
  const { count, error } = await q;
  if (error) throw error;

  // Firebase\'s AggregateQuerySnapshot exposes data() as a method.
  // BillingPage.jsx calls formsCount.data().count, so preserve that API shape.
  return {
    data: () => ({ count: Number(count || 0) }),
  };
}

export async function getDoc(ref) {
  const { data, error } = await supabase
    .from('nexus_documents')
    .select('*')
    .eq('collection_name', ref.collectionName)
    .or(`collection_path.eq.${ref.path},collection_path.eq.${ref.path.slice(0, ref.path.lastIndexOf('/'))}`)
    .eq('doc_id', ref.id)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return {
    id: ref.id,
    path: data?.collection_path || ref.path,
    exists: () => Boolean(data),
    data: () => data?.data || {},
  };
}

async function upsertDoc(ref, payload, merge = false) {
  const current = await getDoc(ref);
  const next = merge && current.exists() ? { ...(current.data() || {}), ...payload } : payload;
  const workspaceId = next.workspaceId || next.workspace_id || null;
  const uid = next.uid || next.submitterUid || null;
  const row = {
    collection_name: ref.collectionName,
    collection_path: current.path,
    doc_id: ref.id,
    data: next,
    workspace_id: workspaceId,
    user_id: uid || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('nexus_documents').upsert(row, { onConflict: 'collection_path,doc_id' });
  if (error) throw error;
}

export async function setDoc(ref, data, options = {}) { await upsertDoc(ref, data, Boolean(options.merge)); }
export async function updateDoc(ref, data) {
  const current = await getDoc(ref);
  if (!current.exists()) throw new Error('This record no longer exists. Refresh and try again.');
  if (ref.collectionName === 'users') {
    const { error: patchError } = await supabase.rpc('nexus_profile_patch', {profile_path:current.path,profile_doc:ref.id,fields:data});
    if (!patchError) return;
    // Compatibility only until the reviewed migration is installed.
    if (!['PGRST202','42883'].includes(patchError.code)) throw patchError;
  }
  // UPDATE must not request INSERT permissions or rebuild immutable ownership columns.
  const { data: saved, error } = await supabase.from('nexus_documents')
    .update({ data: { ...current.data(), ...data }, updated_at: new Date().toISOString() })
    .eq('collection_name', ref.collectionName)
    .eq('collection_path', current.path)
    .eq('doc_id', ref.id)
    .select('doc_id').maybeSingle();
  if (error) throw error;
  if (!saved) throw new Error('This record could not be updated. Refresh and try again.');
}

export async function addDoc(ref, data) {
  const id = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await setDoc({ ...ref, kind: 'doc', id, path: `${ref.path}/${id}` }, data);
  return { id, path: `${ref.path}/${id}` };
}

export async function deleteDoc(ref) {
  const { error } = await supabase
    .from('nexus_documents')
    .delete()
    .or(`collection_path.eq.${ref.path},collection_path.eq.${ref.path.slice(0, ref.path.lastIndexOf('/'))}`)
    .eq('doc_id', ref.id);
  if (error) throw error;
}

function isAuthError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();
  return status === 401 || status === 403 || /\b401\b|\b403\b|jwt|not authenticated|permission denied|unauthorized/.test(message);
}

export function onSnapshot(ref, ...args) {
  const callbacks = args.filter((arg) => typeof arg === 'function');
  const callback = callbacks[0];
  const errorCallback = callbacks[1];
  if (typeof callback !== 'function') return () => {};

  let active = true;
  let fallbackTimer = null;
  let channel = null;
  let authSubscription = null;

  const cleanup = () => {
    active = false;
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    authSubscription?.unsubscribe?.();
    authSubscription = null;
  };

  const emit = async () => {
    if (!active) return;
    try {
      const snap = await getDocs(ref);
      if (!active) return;
      callback(ref.kind === 'doc' ? snap : { ...snap, docChanges: () => snap.docs.map((d) => ({ type: 'added', doc: d })) });
    } catch (error) {
      if (isAuthError(error)) {
        cleanup();
        if (typeof errorCallback === 'function') errorCallback(error);
        return;
      }
      console.error('Supabase compatibility listener failed:', error);
      if (typeof errorCallback === 'function') errorCallback(error);
    }
  };

  // Initial fetch so consumers receive state immediately.
  void emit();

  const channelName = `nexus-docs-${ref.collectionName || 'collection'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const realtimeConfig = {
    event: '*',
    schema: 'public',
    table: 'nexus_documents',
  };
  if (ref.collectionName) realtimeConfig.filter = `collection_name=eq.${String(ref.collectionName)}`;

  channel = supabase
    .channel(channelName)
    .on('postgres_changes', realtimeConfig, () => { void emit(); })
    .subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED' && fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
        void emit();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Realtime is preferred. If a deployment has not enabled replication yet,
        // use a low-frequency fallback rather than the previous 5s polling loop.
        if (!fallbackTimer) fallbackTimer = setInterval(emit, 30000);
      }
    });

  const authListener = supabase.auth.onAuthStateChange((event) => {
    if (!active) return;
    if (event === 'SIGNED_OUT') {
      cleanup();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      void emit();
    }
  });
  authSubscription = authListener?.data?.subscription || authListener?.subscription || null;

  return cleanup;
}

export const Timestamp = { now: () => new Date().toISOString() };
