"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/fewbie/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fewbie/ui/card";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { checkPasswordPolicy, isStrongPassword } from "@/items/password-checklist/components/password-checklist";
import type { ForgotPasswordLabels, ForgotPasswordProps } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const DEFAULT_RESEND_SECONDS = 60;

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function ClearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
      <path d="M6.2 6.2A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.2-.9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PasswordChecklist({ password, labels }: { password: string; labels: ForgotPasswordLabels }) {
  // Show nothing until the user starts typing, to keep the form calm.
  if (!password) return null;

  const checks = checkPasswordPolicy(password);
  const rules = [
    { key: "length", label: labels.passwordRuleLength, met: checks.length },
    { key: "lowercase", label: labels.passwordRuleLowercase, met: checks.lowercase },
    { key: "uppercase", label: labels.passwordRuleUppercase, met: checks.uppercase },
    { key: "number", label: labels.passwordRuleNumber, met: checks.number },
    { key: "symbol", label: labels.passwordRuleSymbol, met: checks.symbol },
  ];

  return (
    <ul className="space-y-1.5 rounded-md border bg-muted/40 p-3" aria-label={labels.passwordRequirements}>
      {rules.map((rule) => (
        <li
          key={rule.key}
          className={`flex items-center gap-2 text-xs ${rule.met ? "text-success" : "text-muted-foreground"}`}
        >
          {rule.met ? <CheckIcon /> : <ClearIcon />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Page-level password reset module: email plus verification code plus a new
 * password, with a live strength checklist. Transport, navigation and toasts
 * belong to the host and enter through `port` and the `on*` callbacks.
 */
export function ForgotPasswordPage({
  labels,
  port,
  initialEmail = "",
  notices,
  onCodeSent,
  onReset,
  onBack,
}: ForgotPasswordProps) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Seconds left before the user can request another verification code.
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sendPending, setSendPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; code?: string; newPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const isCountingDown = secondsLeft > 0;

  // Countdown timer for resending the verification code.
  useEffect(() => {
    if (!isCountingDown) return;
    const timer = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [isCountingDown]);

  function validateEmail(value: string): string | undefined {
    if (!value.trim()) return labels.forgotEmailRequired;
    if (!EMAIL_PATTERN.test(value)) return labels.forgotInvalidEmail;
    return undefined;
  }

  async function handleGetCode(): Promise<void> {
    if (secondsLeft > 0 || sendPending) return;
    const emailError = validateEmail(email);
    setErrors((prev) => ({ ...prev, email: emailError }));
    if (emailError) return;

    setSendPending(true);
    setError(null);
    try {
      const result = await port.sendResetCode(email);
      // Follow the resend cooldown returned by the backend.
      setSecondsLeft(result.secondsOfCountdown ?? DEFAULT_RESEND_SECONDS);
      onCodeSent?.();
    } catch {
      setError(labels.requestFailed);
    } finally {
      setSendPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (resetPending) return;

    const nextErrors = {
      email: validateEmail(email),
      code: !code ? labels.forgotCodeRequired : code.length !== CODE_LENGTH ? labels.forgotCodeDigits : undefined,
      newPassword: !newPassword
        ? labels.forgotPasswordRequired
        : isStrongPassword(newPassword)
          ? undefined
          : labels.passwordRule,
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.code || nextErrors.newPassword) return;

    setResetPending(true);
    setError(null);
    try {
      await port.resetPassword({ email, verificationCode: code, newPassword });
      onReset?.();
    } catch {
      setError(labels.resetFailed);
    } finally {
      setResetPending(false);
    }
  }

  return (
    <Card className="w-full shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{labels.forgotTitle}</CardTitle>
        <CardDescription>{labels.forgotDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {notices}

        {/* method="post" keeps a native submit (before hydration) from
            serializing the new password into the query string. */}
        <form method="post" onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="forgot-password-email">{labels.emailLabel}</Label>
            <div className="relative">
              <Input
                id="forgot-password-email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pr-10"
              />
              {email && (
                <button
                  type="button"
                  onClick={() => setEmail("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={labels.forgotClearEmail}
                >
                  <ClearIcon />
                </button>
              )}
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="forgot-password-code">{labels.codeLabel}</Label>
            <div className="relative">
              <Input
                id="forgot-password-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                className="pr-32"
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2">
                {code && (
                  <button
                    type="button"
                    onClick={() => setCode("")}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={labels.forgotClearCode}
                  >
                    <ClearIcon />
                  </button>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-normal"
                  onClick={() => void handleGetCode()}
                  disabled={secondsLeft > 0 || sendPending}
                  aria-busy={sendPending}
                  aria-label={labels.forgotGetCode}
                >
                  {sendPending ? <Spinner /> : secondsLeft > 0 ? `${secondsLeft}s` : labels.forgotGetCode}
                </Button>
              </div>
            </div>
            {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="forgot-password-new-password">{labels.newPasswordLabel}</Label>
            <div className="relative">
              <Input
                id="forgot-password-new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="pr-20"
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {newPassword && (
                  <button
                    type="button"
                    onClick={() => setNewPassword("")}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={labels.forgotClearPassword}
                  >
                    <ClearIcon />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? labels.forgotHidePassword : labels.forgotShowPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            <PasswordChecklist password={newPassword} labels={labels} />
            {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword}</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {onBack && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs font-normal"
                onClick={onBack}
              >
                {labels.forgotBack}
              </Button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={resetPending}
            aria-busy={resetPending}
            aria-label={labels.resetButton}
          >
            {resetPending ? <Spinner /> : labels.resetButton}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
