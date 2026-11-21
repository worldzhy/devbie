"use client";

import { Check, X } from "lucide-react";

import type { PasswordChecklistLabels, PasswordChecklistProps } from "./types";

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

const RULES: ReadonlyArray<{ key: PasswordRuleKey; labelKey: keyof PasswordChecklistLabels }> = [
  { key: "length", labelKey: "ruleLength" },
  { key: "lowercase", labelKey: "ruleLowercase" },
  { key: "uppercase", labelKey: "ruleUppercase" },
  { key: "number", labelKey: "ruleNumber" },
  { key: "symbol", labelKey: "ruleSymbol" },
];

export function PasswordChecklist({ labels, password }: PasswordChecklistProps) {
  // Show nothing until the user starts typing, to keep the form calm.
  if (!password) return null;

  const checks = checkPasswordPolicy(password);

  return (
    <ul className="space-y-1.5 rounded-md border bg-muted/40 p-3" aria-label={labels.requirements}>
      {RULES.map((rule) => {
        const met = checks[rule.key];
        return (
          <li
            key={rule.key}
            className={`flex items-center gap-2 text-xs ${met ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}
          >
            {met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {labels[rule.labelKey]}
          </li>
        );
      })}
    </ul>
  );
}
