// passwordStrength.js — Pure password strength scorer.
// Returns a score (0–4) and label/color for UI feedback.

const COMMON_PATTERNS = [
  /^password/i, /^12345/, /^qwerty/i, /^abc/i, /^letmein/i,
  /^admin/i, /^welcome/i, /^monkey/i, /^dragon/i,
];

/**
 * Returns { score: 0-4, label: string, color: string, feedback: string[] }
 * Score 0 = very weak, 4 = strong
 */
export function checkPasswordStrength(password) {
  if (!password) {
    return { score: 0, label: "Empty", color: "#94A3B8", feedback: [] };
  }

  const feedback = [];
  let score = 0;

  // Length
  if (password.length >= 8) score++;
  else feedback.push("Use at least 8 characters");

  if (password.length >= 12) score++;

  // Complexity
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const complexCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (complexCount >= 3) score++;
  else {
    if (!hasUpper) feedback.push("Add uppercase letters");
    if (!hasDigit) feedback.push("Add numbers");
    if (!hasSymbol) feedback.push("Add symbols (!@#$...)");
  }

  // Common patterns (penalty)
  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1);
      feedback.push("Avoid common password patterns");
      break;
    }
  }

  score = Math.min(4, Math.max(0, score));

  const LEVELS = [
    { label: "Very weak",  color: "#EF4444" },
    { label: "Weak",       color: "#F97316" },
    { label: "Fair",       color: "#EAB308" },
    { label: "Good",       color: "#22C55E" },
    { label: "Strong",     color: "#10B981" },
  ];

  return { score, ...LEVELS[score], feedback };
}
