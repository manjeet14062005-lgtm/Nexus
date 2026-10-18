// deletionCountdown.test.js — Unit tests for deletionCountdown helper.

import { getDeletionCountdown } from "./deletionCountdown";

describe("getDeletionCountdown", () => {
  test("returns null for null input", () => {
    expect(getDeletionCountdown(null)).toBeNull();
  });

  test("returns null for undefined input", () => {
    expect(getDeletionCountdown(undefined)).toBeNull();
  });

  test("returns null for invalid date string", () => {
    expect(getDeletionCountdown("not-a-date")).toBeNull();
  });

  test("returns expired for past timestamp", () => {
    const past = new Date(Date.now() - 10000).toISOString();
    const result = getDeletionCountdown(past);
    expect(result?.expired).toBe(true);
  });

  test("returns future countdown for future timestamp", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = getDeletionCountdown(future);
    expect(result?.expired).toBe(false);
    expect([2, 3]).toContain(result?.days); // 3 if fast enough, 2 if delayed
  });

  test("marks urgent when < 1 day remaining", () => {
    const soonFuture = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const result = getDeletionCountdown(soonFuture);
    expect(result?.urgent).toBe(true);
  });

  test("label is a non-empty string", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = getDeletionCountdown(future);
    expect(typeof result?.label).toBe("string");
    expect(result?.label.length).toBeGreaterThan(0);
  });
});
