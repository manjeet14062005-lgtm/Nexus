// exportHelpers.js — Pure, tested CSV export helpers.
// Fixed defect: previous CSV builder did not escape commas/quotes/newlines.

/**
 * Properly escape a single CSV field value.
 * Rules (RFC 4180 + common extensions):
 *  - Wrap in double-quotes if the value contains commas, double-quotes, or newlines.
 *  - Escape existing double-quotes by doubling them ("").
 *  - Null/undefined → empty string.
 */
export function csvEscapeField(value) {
  let str = value == null ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(str)) str = "'" + str;
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of rows (arrays of values) into a CSV string.
 * The first row should be the header.
 */
export function buildCsvString(rows) {
  return rows
    .map((row) => row.map(csvEscapeField).join(","))
    .join("\r\n");
}

/**
 * Build a profile CSV from profile data.
 * Only exports the fields that are safe for the user to download about themselves.
 */
export function buildProfileCsv(profileData) {
  if (!profileData) return buildCsvString([["No profile data available."]]);

  const headers = ["name", "email", "phone", "country", "bio", "createdAt", "updatedAt"];
  const values = headers.map((k) => profileData[k] ?? "");
  return buildCsvString([
    headers.map((h) => h.charAt(0).toUpperCase() + h.slice(1)),
    values,
  ]);
}

/**
 * Trigger a browser file download from a string.
 */
export function downloadString(content, filename, mimeType = "text/plain; charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download profile data as CSV.
 */
export function downloadProfileCsv(profileData, uid) {
  const csv = buildProfileCsv(profileData);
  downloadString(csv, `nexus-profile-${uid || "export"}.csv`, "text/csv; charset=utf-8");
}
