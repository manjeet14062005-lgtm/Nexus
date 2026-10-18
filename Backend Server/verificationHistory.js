const { ensureSupabaseAdmin } = require('./supabaseAdmin');

const publicFields = ['method', 'status', 'environment', 'email', 'phoneMasked', 'externalUserId', 'riskScore', 'riskSignals', 'disposable', 'delivery', 'createdAt', 'updatedAt', 'expiresAt', 'verifiedAt', 'attempts', 'maxAttempts'];
function badInput(message) { return Object.assign(new Error(message), { status: 400 }); }
function parseHistory(input = {}) {
  const result = { page: Number(input.page || 1), limit: Number(input.limit || 25), sort: input.sort || 'newest', q: String(input.q || '').trim() };
  if (!Number.isInteger(result.page) || result.page < 1 || result.page > 10000 || !Number.isInteger(result.limit) || result.limit < 1 || result.limit > 100) throw badInput('Invalid history page or page size.');
  if (!['newest', 'oldest'].includes(result.sort)) throw badInput('Invalid request order.');
  if (result.q.length > 120 || !/^[\p{L}\p{N}@ ._+:-]*$/u.test(result.q)) throw badInput('Search by request ID, email, masked phone, or external user ID using letters, numbers, spaces, @, dots, hyphens, underscores, or +.');
  for (const [key, allowed] of Object.entries({ status: ['pending', 'verified', 'failed', 'expired'], method: ['email', 'phone'], environment: ['test', 'live'] })) {
    if (input[key] && input[key] !== 'all') { if (!allowed.includes(input[key])) throw badInput(`Invalid ${key} filter.`); result[key] = input[key]; }
  }
  for (const key of ['from', 'to']) if (input[key]) {
    const value = String(input[key]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw badInput('Use valid dates in YYYY-MM-DD format.');
    result[key] = value;
  }
  if (result.from && result.to && result.from > result.to) throw badInput('Start date must be before the end date.');
  return result;
}
function safeRequest(row) {
  const record = { id: row.doc_id };
  for (const key of publicFields) if (row.data?.[key] !== undefined) record[key] = row.data[key];
  return record;
}
async function readVerificationHistory(workspaceId, input, client = ensureSupabaseAdmin()) {
  const filters = parseHistory(input);
  const path = `workspaces/${workspaceId}/verificationRequests`;
  let query = client.from('nexus_documents').select('doc_id,data', { count: 'exact' }).eq('collection_name', 'verificationRequests').or(`collection_path.eq.${path},collection_path.like.${path.replace(/[_%]/g, '\\$&')}/%`);
  for (const key of ['status', 'method', 'environment']) if (filters[key]) query = query.eq(`data->>${key}`, filters[key]);
  if (filters.from) query = query.gte('data->>createdAt', `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lt('data->>createdAt', new Date(Date.parse(filters.to) + 86400000).toISOString());
  if (filters.q) {
    const pattern = `%${filters.q.replace(/_/g, '\\_')}%`;
    query = query.or(['doc_id', 'data->>email', 'data->>phoneMasked', 'data->>externalUserId'].map(field => `${field}.ilike.${pattern}`).join(','));
  }
  const offset = (filters.page - 1) * filters.limit;
  const { data, count, error } = await query.order('data->>createdAt', { ascending: filters.sort === 'oldest', nullsFirst: false }).order('doc_id', { ascending: true }).order('collection_path', { ascending: true }).range(offset, offset + filters.limit - 1);
  // PostgREST can return 416 after records disappear from a later page.
  if (error?.code === 'PGRST103') {
    const first = await query.range(0, 0);
    if (first.error) throw first.error;
    return { verificationRequests: [], total: first.count || 0, page: filters.page, pageSize: filters.limit };
  }
  if (error) throw error;
  return { verificationRequests: (data || []).map(safeRequest), total: count || 0, page: filters.page, pageSize: filters.limit };
}
function historyCsv(rows) {
  const fields = ['id', 'status', 'method', 'environment', 'phoneMasked', 'riskScore', 'createdAt', 'verifiedAt'];
  const cell = value => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return '\uFEFF' + [fields, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(cell).join(',')).join('\r\n');
}
module.exports = { parseHistory, safeRequest, readVerificationHistory, historyCsv };
