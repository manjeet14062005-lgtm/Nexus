// exportHelpers.test.js — Unit tests for CSV export helpers.

import { csvEscapeField, buildCsvString, buildProfileCsv } from "./exportHelpers";

describe("csvEscapeField", () => {
  test("returns value unchanged for simple strings", () => {
    expect(csvEscapeField("hello")).toBe("hello");
    expect(csvEscapeField("world")).toBe("world");
  });

  test("wraps in quotes when value contains comma", () => {
    expect(csvEscapeField("hello, world")).toBe('"hello, world"');
  });

  test("wraps in quotes when value contains double-quote", () => {
    expect(csvEscapeField('say "hi"')).toBe('"say ""hi"""');
  });

  test("wraps in quotes when value contains newline", () => {
    expect(csvEscapeField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("wraps in quotes when value contains carriage return", () => {
    expect(csvEscapeField("line1\rline2")).toBe('"line1\rline2"');
  });

  test("returns empty string for null", () => {
    expect(csvEscapeField(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(csvEscapeField(undefined)).toBe("");
  });

  test("converts number to string", () => {
    expect(csvEscapeField(42)).toBe("42");
  });

  test("handles value with both comma and quote", () => {
    const result = csvEscapeField('a, "b"');
    expect(result).toBe('"a, ""b"""');
  });
});

describe("buildCsvString", () => {
  test("produces correct CSV from simple data", () => {
    const rows = [["Name", "Email"], ["Alice", "alice@example.com"]];
    const csv = buildCsvString(rows);
    expect(csv).toBe("Name,Email\r\nAlice,alice@example.com");
  });

  test("escapes fields with special chars", () => {
    const rows = [["Name"], ['Bob, "Jr"']];
    const csv = buildCsvString(rows);
    expect(csv).toBe('Name\r\n"Bob, ""Jr"""');
  });

  test("handles empty rows array", () => {
    expect(buildCsvString([])).toBe("");
  });
});

describe("buildProfileCsv", () => {
  test("returns header and values for profile data", () => {
    const profile = { name: "Alice", email: "alice@example.com", country: "US", bio: "Hello", phone: "+1555" };
    const csv = buildProfileCsv(profile);
    expect(csv).toContain("Alice");
    expect(csv).toContain("US");
    expect(csv).toContain("Hello");
  });

  test("returns fallback for null profile", () => {
    const csv = buildProfileCsv(null);
    expect(csv).toContain("No profile data");
  });

  test("escapes commas in profile bio", () => {
    const profile = { bio: "Hello, world" };
    const csv = buildProfileCsv(profile);
    expect(csv).toContain('"Hello, world"');
  });
});

test('escapes spreadsheet formulas in user-controlled fields', () => {
 expect(csvEscapeField('=1+1')).toBe("'=1+1");
 expect(csvEscapeField('+12345')).toBe("'+12345");
});
