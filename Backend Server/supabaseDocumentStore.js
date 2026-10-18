const crypto = require('crypto');
const { supabaseAdmin, ensureSupabaseAdmin } = require('./supabaseAdmin');

const FieldValue = {
  increment(amount) { return { __nexusFieldOp: 'increment', amount: Number(amount) || 0 }; },
  serverTimestamp() { return { __nexusFieldOp: 'serverTimestamp' }; },
};

function randomId(prefix = 'doc') {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function getFieldValue(obj, field) {
  if (!obj) return undefined;
  return field.split('.').reduce((value, key) => value == null ? undefined : value[key], obj);
}

class SupabaseDocSnapshot {
  constructor(id, row) {
    this.id = id;
    this._row = row || null;
    // Firebase Admin's DocumentSnapshot exposes `exists` as a boolean property.
    // Keep the compatibility shim identical so server code such as `if (!snap.exists)` works.
    this.exists = Boolean(this._row);
    if (row) {
      const parent = row.collection_path.endsWith(`/${id}`)
        ? row.collection_path.slice(0, -(String(id).length + 1)) : row.collection_path;
      this.ref = new DocumentRef(parent, row.collection_name, id);
    }
  }
  data = () => (this._row?.data ? { ...this._row.data } : undefined);
}

class SupabaseQuerySnapshot {
  constructor(rows) {
    this.docs = (rows || []).map((r) => new SupabaseDocSnapshot(r.doc_id, r));
    this.empty = this.docs.length === 0;
    this.size = this.docs.length;
  }
}

class QueryRef {
  constructor(collectionPath, collectionName, filters = [], order = null, limitCount = null) {
    this.kind = 'query';
    this.path = collectionPath;
    this.collectionName = collectionName;
    this.filters = filters;
    this.order = order;
    this.limitCount = limitCount;
  }
  where(field, op, value) { return new QueryRef(this.path, this.collectionName, [...this.filters, { field, op, value }], this.order, this.limitCount); }
  orderBy(field, direction = 'asc') { return new QueryRef(this.path, this.collectionName, this.filters, { field, direction }, this.limitCount); }
  limit(count) { return new QueryRef(this.path, this.collectionName, this.filters, this.order, Number(count)); }
  async get() { return getDocs(this); }
}

class CollectionRef extends QueryRef {
  constructor(collectionPath, collectionName) { super(collectionPath, collectionName); this.kind = 'collection'; }
  doc(id = randomId()) { return new DocumentRef(this.path, this.collectionName, String(id)); }
  async add(data) { return addDoc(this, data); }
}

class DocumentRef {
  constructor(parentPath, collectionName, id) {
    this.kind = 'doc';
    this.parentPath = parentPath;
    this.collectionName = collectionName;
    this.id = String(id);
    this.path = `${parentPath}/${this.id}`;
  }
  collection(name) { return new CollectionRef(`${this.path}/${name}`, String(name)); }
  async get() { return getDoc(this); }
  async set(data, options = {}) { return setDoc(this, data, options); }
  async update(data) { return updateDoc(this, data); }
  async delete() { return deleteDoc(this); }
}

function collection(name) { return new CollectionRef(String(name), String(name)); }
function collectionGroup(name) { return new QueryRef(null, String(name)); }

function buildSupabaseQuery(ref, select = '*') {
  ensureSupabaseAdmin();
  let q = supabaseAdmin.from('nexus_documents').select(select);
  if (ref.path) {
    // Firestore-style collection queries target descendants beneath the
    // collection path (e.g. workspaces/doc_123), while document queries
    // target the exact document path (workspaces/doc_123).
    // A collection query may become a QueryRef after .where(), .orderBy(), or .limit().
    // Only exact document refs should use an equality predicate.
    if (ref.kind !== 'doc') q = q.or(`collection_path.eq.${ref.path},collection_path.like.${ref.path.replace(/[_%]/g, '\\$&')}/%`);
    else q = q.eq('collection_path', ref.path);
  }
  if (ref.collectionName) q = q.eq('collection_name', ref.collectionName);
  for (const filter of ref.filters || []) {
    const key = `data->>${filter.field}`;
    switch (filter.op) {
      case '==': q = q.eq(key, String(filter.value)); break;
      case '!=': q = q.neq(key, String(filter.value)); break;
      case '>': q = q.gt(key, String(filter.value)); break;
      case '>=': q = q.gte(key, String(filter.value)); break;
      case '<': q = q.lt(key, String(filter.value)); break;
      case '<=': q = q.lte(key, String(filter.value)); break;
      case 'in': q = q.in(key, Array.isArray(filter.value) ? filter.value.map(String) : []); break;
      default: throw new Error(`Unsupported document filter operator: ${filter.op}`);
    }
  }
  if (ref.order) q = q.order(`data->${ref.order.field}`, { ascending: ref.order.direction !== 'desc' });
  return q;
}

async function getDocs(ref) {
  const { data, error } = await buildSupabaseQuery(ref).limit(ref.limitCount || 1000);
  if (error) throw error;
  let rows = data || [];
  if (ref.order) {
    const { field, direction } = ref.order;
    rows = rows.sort((a, b) => {
      const av = getFieldValue(a.data, field) ?? '';
      const bv = getFieldValue(b.data, field) ?? '';
      if (av === bv) return 0;
      const result = av < bv ? -1 : 1;
      return direction === 'desc' ? -result : result;
    });
    if (ref.limitCount) rows = rows.slice(0, ref.limitCount);
  }
  return new SupabaseQuerySnapshot(rows);
}

async function getDoc(ref) {
  ensureSupabaseAdmin();
  const { data, error } = await supabaseAdmin.from('nexus_documents')
    .select('*').or(`collection_path.eq.${ref.path},collection_path.eq.${ref.parentPath}`).eq('collection_name', ref.collectionName).eq('doc_id', ref.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return new SupabaseDocSnapshot(ref.id, data);
}

async function addDoc(ref, payload) {
  const id = ref.doc().id;
  const docRef = ref.doc(id);
  await setDoc(docRef, payload);
  return docRef;
}


function operation(type, ref, data, options = {}) {
  return { type, path: ref.path, parent: ref.parentPath, collection: ref.collectionName, id: ref.id, data: data || {}, merge: Boolean(options.merge) };
}

async function commitOperations(operations, reads = []) {
  const { error } = await supabaseAdmin.rpc('nexus_commit_documents', { operations, reads });
  if (error) throw error;
}

async function setDoc(ref, payload, options = {}) {
  await commitOperations([operation('set', ref, payload, options)]);
}
async function updateDoc(ref, payload) {
  await commitOperations([operation('update', ref, payload, { merge: true })]);
}
async function deleteDoc(ref) { await commitOperations([operation('delete', ref)]); }

class WriteBatch {
  constructor() { this.ops = []; }
  set(ref, data, options = {}) { this.ops.push(operation('set', ref, data, options)); return this; }
  update(ref, data) { this.ops.push(operation('update', ref, data, { merge: true })); return this; }
  delete(ref) { this.ops.push(operation('delete', ref)); return this; }
  async commit() { await commitOperations(this.ops); }
}

class TransactionShim extends WriteBatch {
  constructor() { super(); this.reads = []; }
  async get(ref) {
    const snap = await getDoc(ref);
    this.reads.push({ ...operation('read', ref), version: snap._row?.updated_at || null });
    return snap;
  }
  async commit() { await commitOperations(this.ops, this.reads); }
}

async function runTransaction(callback) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = new TransactionShim();
    const result = await callback(tx);
    try { await tx.commit(); return result; }
    catch (error) { if (error.code !== 'NX409' || attempt === 4) throw error; }
  }
}

async function recursiveDelete(ref) {
  ensureSupabaseAdmin();
  const { error } = await supabaseAdmin.rpc('nexus_delete_document_tree', { target_path: ref.path, target_id: ref.id });
  if (error) throw error;
}

function adminDb() {
  ensureSupabaseAdmin();
  return {
    collection,
    collectionGroup,
    batch: () => new WriteBatch(),
    runTransaction,
    recursiveDelete,
  };
}

module.exports = { adminDb, collection, collectionGroup, FieldValue, getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, QueryRef, CollectionRef, DocumentRef };
