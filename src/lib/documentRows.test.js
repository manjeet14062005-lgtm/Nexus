import { uniqueDocumentRows } from './documentRows';

test('legacy and current paths resolve to the newest document without duplicate rows', () => {
  const old = { doc_id: 'user-a', collection_path: 'users', updated_at: '2026-09-01T00:00:00Z', data: { name: 'Old' } };
  const recent = { ...old, collection_path: 'users/user-a', updated_at: '2026-09-28T00:00:00Z', data: { name: 'Current' } };
  const other = { doc_id: 'user-b', updated_at: '2026-09-20T00:00:00Z' };
  expect(uniqueDocumentRows([old, other, recent])).toEqual([recent, other]);
  expect(uniqueDocumentRows([recent, old])).toEqual([recent]);
  expect(uniqueDocumentRows([])).toEqual([]);
});
