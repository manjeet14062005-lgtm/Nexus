// accountMetrics.test.js — Unit tests for pure accountMetrics helpers.

import {
  calcCompleteness,
  completenessFields,
  calcAccountHealth,
  getXpInfo,
  getBadges,
  PROFILE_FIELDS,
} from "./accountMetrics";

describe("calcCompleteness", () => {
  test("returns 0 for null", () => {
    expect(calcCompleteness(null)).toBe(0);
  });

  test("returns 0 for empty object", () => {
    expect(calcCompleteness({})).toBe(0);
  });

  test("returns 100 for fully filled profile", () => {
    const full = {
      name: "Test",
      country: "CA",
      bio: "Hello",
      phone: "+15551234567",
      photoUrl: "https://example.com/photo.jpg",
      linkedin: "https://linkedin.com/in/test",
    };
    expect(calcCompleteness(full)).toBe(100);
  });

  test("returns partial completeness correctly", () => {
    const partial = { name: "Test", country: "CA" };
    const result = calcCompleteness(partial);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

describe("completenessFields", () => {
  test("marks done fields correctly", () => {
    const profileData = { name: "Test" };
    const fields = completenessFields(profileData);
    const nameField = fields.find((f) => f.key === "name");
    const bioField = fields.find((f) => f.key === "bio");
    expect(nameField?.done).toBe(true);
    expect(bioField?.done).toBe(false);
  });

  test("returns correct number of fields", () => {
    const fields = completenessFields({});
    expect(fields.length).toBe(PROFILE_FIELDS.length);
  });
});

describe("calcAccountHealth", () => {
  test("returns object with score and signals", () => {
    const result = calcAccountHealth({}, { emailVerified: false });
    expect(typeof result.score).toBe("number");
    expect(Array.isArray(result.signals)).toBe(true);
  });

  test("email verified increases score", () => {
    const unverified = calcAccountHealth({}, { emailVerified: false });
    const verified = calcAccountHealth({}, { emailVerified: true });
    expect(verified.score).toBeGreaterThan(unverified.score);
  });

  test("score is between 0 and 100", () => {
    const result = calcAccountHealth({}, {});
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("getXpInfo", () => {
  test("returns xp, level, progress", () => {
    const result = getXpInfo({});
    expect(typeof result.xp).toBe("number");
    expect(result.level).toBeTruthy();
    expect(typeof result.progress).toBe("number");
  });

  test("progress is 0-100", () => {
    const result = getXpInfo({ name: "Test", bio: "Hello" });
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(100);
  });
});

describe("getBadges", () => {
  test("first_login badge earned when user exists", () => {
    const badges = getBadges({}, { uid: "123" });
    const badge = badges.find((b) => b.id === "first_login");
    expect(badge?.earned).toBe(true);
  });

  test("registered badge not earned for empty profile", () => {
    const badges = getBadges({}, { uid: "123" });
    const badge = badges.find((b) => b.id === "registered");
    expect(badge?.earned).toBe(false);
  });

  test("streak_7 earned for >= 7 days", () => {
    const badges = getBadges({ loginBonusDays: 7 }, { uid: "123" });
    const badge = badges.find((b) => b.id === "streak_7");
    expect(badge?.earned).toBe(true);
  });

  test("streak_7 not earned for 6 days", () => {
    const badges = getBadges({ loginBonusDays: 6 }, { uid: "123" });
    const badge = badges.find((b) => b.id === "streak_7");
    expect(badge?.earned).toBe(false);
  });
});

 test('pending and unknown deletion states never earn a healthy status', () => {
  const unknown = calcAccountHealth({}, {});
  const pending = calcAccountHealth({}, {}, { status: 'pending' });
  const clear = calcAccountHealth({}, {}, null);
  expect(unknown.score).toBeLessThan(clear.score);
  expect(pending.score).toBeLessThan(clear.score);
 });
