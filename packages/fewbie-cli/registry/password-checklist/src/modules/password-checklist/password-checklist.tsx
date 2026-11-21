"use client";

import { Check, X } from "lucide-react";

import type { PasswordChecklistLabels, PasswordChecklistProps } from "./types";

/**
 * Live password rule checklist. Rules mirror the backend IsStrongPassword
 * validator (validator.isStrongPassword defaults), so what the user sees is
 * exactly what the API enforces.
 *
 * NOTE: this is a manual mirror of the newbie account module's password
 * policy. When the backend strategy changes, update the rules array here.
 */
const rules: ReadonlyArray<{
  key: string;
  labelKey: keyof PasswordChecklistLabels;
  test: (password: string) => boolean;
}> = [
  { key: "length", labelKey: "ruleLength", test: (password) => password.length >= 8 },
  { key: "lowercase", labelKey: "ruleLowercase", test: (password) => /[a-z]/.test(password) },
  { key: "uppercase", labelKey: "ruleUppercase", test: (password) => /[A-Z]/.test(password) },
  { key: "number", labelKey: "ruleNumber", test: (password) => /\d/.test(password) },
  { key: "symbol", labelKey: "ruleSymbol", test: (password) => /[^\w\s]/.test(password) },
];

export function isStrongPassword(password: string): boolean {
  return rules.every((rule) => rule.test(password));
}

export function PasswordChecklist({ labels, password }: PasswordChecklistProps) {
  // Show nothing until the user starts typing, to keep the form calm.
  if (!password) return null;

  return (
    <ul className="space-y-1.5 rounded-md border bg-muted/40 p-3" aria-label={labels.requirements}>
      {rules.map((rule) => {
        const met = rule.test(password);
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
