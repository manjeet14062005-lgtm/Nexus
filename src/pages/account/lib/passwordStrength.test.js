// passwordStrength.test.js — Unit tests for password strength helper.

import { checkPasswordStrength } from "./passwordStrength";

describe("checkPasswordStrength", () => {
  test("returns score 0 for empty string", () => {
    const result = checkPasswordStrength("");
    expect(result.score).toBe(0);
  });

  test("returns score 0 for null", () => {
    const result = checkPasswordStrength(null);
    expect(result.score).toBe(0);
  });

  test("weak short password gets low score", () => {
    const result = checkPasswordStrength("abc");
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test("common pattern gets penalized", () => {
    const result = checkPasswordStrength("password123");
    expect(result.score).toBeLessThanOrEqual(2);
  });

  test("strong long mixed password gets high score", () => {
    const result = checkPasswordStrength("Tr0ub4dor&3!");
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  test("returns label and color", () => {
    const result = checkPasswordStrength("Hello123!");
    expect(typeof result.label).toBe("string");
    expect(typeof result.color).toBe("string");
    expect(result.color.startsWith("#")).toBe(true);
  });

  test("returns feedback array", () => {
    const result = checkPasswordStrength("short");
    expect(Array.isArray(result.feedback)).toBe(true);
  });

  test("score is always 0-4", () => {
    const passwords = ["", "a", "abc12", "Password1!", "Tr0ub4dor&3!Secure"];
    for (const p of passwords) {
      const { score } = checkPasswordStrength(p);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});
