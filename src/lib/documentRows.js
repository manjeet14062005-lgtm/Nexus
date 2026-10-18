// Legacy parent paths and current full paths can represent the same document.
// Preserve query order while resolving each identity to its newest revision.
export function uniqueDocumentRows(rows = []) {
  const documents = new Map();
  for (const row of rows) {
    const current = documents.get(row.doc_id);
    if (!current || Date.parse(row.updated_at || 0) > Date.parse(current.updated_at || 0)) {
      documents.set(row.doc_id, row);
    }
  }
  return [...documents.values()];
}
