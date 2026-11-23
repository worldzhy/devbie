/** Rule keys in display order; each is also a field of `PasswordPolicyChecks`. */
export type PasswordRuleKey = "length" | "lowercase" | "uppercase" | "number" | "symbol";

export type PasswordPolicyChecks = Record<PasswordRuleKey, boolean>;

/**
 * validator.isStrongPassword's symbol set, copied verbatim from
 * `validator/lib/isStrongPassword.js`. It includes `_`, space and `£`, and
 * excludes non-ASCII symbols such as `€` and `§` (R84-01).
 */
const SYMBOL_PATTERN = /^[-#!$@£%^&*()_+|~=`{}\[\]:";'<>?,.\/\\ ]$/;

/**
 * The backend password policy, mirrored exactly (R84-01): the newbie account
 * module calls `validator.isStrongPassword` with its default options — at
 * least 8 UTF-16 code units, one lowercase, one uppercase, one digit and one
 * symbol from the set above. Keep this in sync with
 * `newbie-modules/packages/modules/account/helpers/validator.ts`.
 *
 * This is the single frontend copy: the reset form renders it through its own
 * local checklist shell, so the policy travels with the account-access block
 * instead of a standalone registry item (ADR-073).
 */
export function checkPasswordPolicy(password: string): PasswordPolicyChecks {
  return {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    // validator classifies characters one code point at a time, so emoji and
    // other surrogate pairs never count as a symbol.
    symbol: Array.from(password).some((char) => SYMBOL_PATTERN.test(char)),
  };
}

export function isStrongPassword(password: string): boolean {
  const checks = checkPasswordPolicy(password);
  return checks.length && checks.lowercase && checks.uppercase && checks.number && checks.symbol;
}
