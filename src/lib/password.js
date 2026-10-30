// src/lib/password.js
// Single source of truth for password rules.
// The forms use it for live feedback; the server (src/server/auth.js) uses it to enforce the same rules,
// so a request that skips the browser still cannot set a weak password. Pure JS, no imports.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", missing: "at least 8 characters", test: (p) => p.length >= PASSWORD_MIN },
  { id: "upper", label: "An uppercase letter", missing: "an uppercase letter", test: (p) => /\p{Lu}/u.test(p) },
  { id: "lower", label: "A lowercase letter", missing: "a lowercase letter", test: (p) => /\p{Ll}/u.test(p) },
  { id: "number", label: "A number", missing: "a number", test: (p) => /\p{Nd}/u.test(p) },
  { id: "special", label: "A special character, like ! ? @ #", missing: "a special character", test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

// Passes every rule above but is still one of the first things an attacker tries.
const COMMON = ["password", "qwerty", "letmein", "iloveyou", "123456", "abc123"];
export const isCommonPassword = (p) => { const s = String(p).toLowerCase(); return COMMON.some((w) => s.includes(w)); };

export const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

/** Live evaluation for the UI. level: 0 empty, 1 weak, 2 fair, 3 good (all rules met), 4 strong (all rules and 12+ characters). */
export function checkPassword(p = "") {
  const rules = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(p) }));
  const met = rules.filter((r) => r.ok).length;
  const allMet = met === rules.length;
  const common = p.length > 0 && isCommonPassword(p);
  let level = p.length ? 1 : 0;
  if (met >= 3) level = 2;
  if (allMet) level = p.length >= 12 ? 4 : 3;
  if (common) level = Math.min(level, 1);
  return { rules, met, allMet, common, level, label: STRENGTH_LABELS[level], valid: allMet && !common && p.length <= PASSWORD_MAX };
}

/** One human sentence describing what is wrong with a password, or null when it is acceptable. */
export function passwordProblem(p) {
  if (typeof p !== "string" || p.length === 0) return "Enter a password";
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  const missing = PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.missing);
  if (missing.length) {
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
    return `Password needs ${list}`;
  }
  if (isCommonPassword(p)) return "That password is too common. Choose something less guessable";
  return null;
}