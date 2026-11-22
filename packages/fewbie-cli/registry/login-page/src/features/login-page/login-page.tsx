"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LoginLabels, LoginPageProps, LoginResult } from "./types";

type LoginMode = "password" | "code";

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

/**
 * Page-level login module: password and verification-code tabs, an inline TOTP
 * challenge, and third-party entries. Transport, navigation, toasts and brand
 * shell belong to the host and enter through `port`, `oauthProviders` and the
 * `onSignedIn`/`onCodeSent` callbacks.
 */
export function LoginPage({ labels, port, notices, oauthProviders, onSignedIn, onCodeSent }: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>("password");
  const [showPassword, setShowPassword] = useState(false);
  // Seconds left before the user can request another verification code.
  const [secondsLeft, setSecondsLeft] = useState(0);
  // When set, the primary factor was accepted and the user must finish login
  // with a TOTP code from their authenticator app.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{ email?: string; password?: string }>({});

  const [codeEmail, setCodeEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeErrors, setCodeErrors] = useState<{ email?: string; code?: string }>({});

  const [pending, setPending] = useState(false);
  const [sendPending, setSendPending] = useState(false);

  const isCountingDown = secondsLeft > 0;

  // Countdown timer for resending the verification code.
  useEffect(() => {
    if (!isCountingDown) return;
    const timer = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [isCountingDown]);

  function complete(result: LoginResult): void {
    if (result.multiFactorRequired && result.totpToken) {
      setMfaToken(result.totpToken);
      return;
    }
    if (!result.ok) {
      setError(result.invalidCredentials ? labels.invalidCredentials : labels.loginFailed);
      return;
    }
    onSignedIn?.();
  }

  async function submit(input: Parameters<LoginPageProps["port"]["signIn"]>[0]): Promise<void> {
    setPending(true);
    setError(null);
    try {
      complete(await port.signIn(input));
    } catch {
      setError(labels.loginFailed);
    } finally {
      setPending(false);
    }
  }

  function validateEmail(value: string): string | undefined {
    if (!value.trim()) return labels.emailRequired;
    if (!EMAIL_PATTERN.test(value)) return labels.invalidEmail;
    return undefined;
  }

  function onPasswordSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(passwordEmail),
      password: !password ? labels.passwordRequired : password.length < 8 ? labels.passwordMin : undefined,
    };
    setPasswordErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;
    void submit({ account: passwordEmail, password });
  }

  function onCodeSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(codeEmail),
      code: !code ? labels.codeRequired : code.length !== CODE_LENGTH ? labels.codeDigits : undefined,
    };
    setCodeErrors(nextErrors);
    if (nextErrors.email || nextErrors.code) return;
    void submit({ account: codeEmail, verificationCode: code });
  }

  async function handleSendCode(): Promise<void> {
    if (secondsLeft > 0 || sendPending) return;
    const emailError = validateEmail(codeEmail);
    setCodeErrors((prev) => ({ ...prev, email: emailError }));
    if (emailError) return;

    setSendPending(true);
    try {
      const result = await port.sendVerificationCode(codeEmail);
      if (!result.ok) {
        setError(labels.loginFailed);
        return;
      }
      // Follow the resend cooldown returned by the backend.
      setSecondsLeft(result.secondsOfCountdown ?? DEFAULT_RESEND_SECONDS);
      onCodeSent?.();
    } catch {
      setError(labels.loginFailed);
    } finally {
      setSendPending(false);
    }
  }

  // Switch login mode while carrying the typed email between the two forms.
  function handleModeChange(value: LoginMode): void {
    if (value === "code") {
      if (passwordEmail) setCodeEmail(passwordEmail);
    } else if (codeEmail) {
      setPasswordEmail(codeEmail);
    }
    setError(null);
    setMode(value);
  }

  const showOAuth = (oauthProviders?.length ?? 0) > 0;

  return (
    <Card className="w-full shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {notices}

        <Tabs value={mode} onValueChange={(value) => handleModeChange(value as LoginMode)} className="mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="password">{labels.tabPassword}</TabsTrigger>
            <TabsTrigger value="code">{labels.tabVerificationCode}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* MFA challenge — primary factor accepted, TOTP code still required */}
        {mfaToken && (
          <TotpChallenge
            labels={labels}
            isPending={pending}
            onSubmit={(totpCode) => void submit({ totpToken: mfaToken, code: totpCode })}
            onBack={() => {
              setError(null);
              setMfaToken(null);
            }}
          />
        )}

        {/* Password login form. method="post" keeps a native submit (before
            hydration) from serializing credentials into the query string. */}
        {mode === "password" && !mfaToken && (
          <form method="post" onSubmit={onPasswordSubmit} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-page-email">{labels.email}</Label>
              <div className="relative">
                <Input
                  id="login-page-email"
                  autoComplete="email"
                  value={passwordEmail}
                  onChange={(event) => setPasswordEmail(event.target.value)}
                  className="pr-10"
                />
                {passwordEmail && (
                  <button
                    type="button"
                    onClick={() => setPasswordEmail("")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={labels.clearEmail}
                  >
                    <ClearIcon />
                  </button>
                )}
              </div>
              {passwordErrors.email && <p className="text-sm text-destructive">{passwordErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-page-password">{labels.password}</Label>
              <div className="relative">
                <Input
                  id="login-page-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  className="pr-20"
                />
                <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                  {password && (
                    <button
                      type="button"
                      onClick={() => setPasswordValue("")}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={labels.clearPassword}
                    >
                      <ClearIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? labels.hidePassword : labels.showPassword}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              {passwordErrors.password && <p className="text-sm text-destructive">{passwordErrors.password}</p>}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Spinner /> : labels.submit}
            </Button>
          </form>
        )}

        {/* Verification code login form */}
        {mode === "code" && !mfaToken && (
          <form method="post" onSubmit={onCodeSubmit} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-page-code-email">{labels.email}</Label>
              <div className="relative">
                <Input
                  id="login-page-code-email"
                  autoComplete="email"
                  value={codeEmail}
                  onChange={(event) => setCodeEmail(event.target.value)}
                  className="pr-10"
                />
                {codeEmail && (
                  <button
                    type="button"
                    onClick={() => setCodeEmail("")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={labels.clearEmail}
                  >
                    <ClearIcon />
                  </button>
                )}
              </div>
              {codeErrors.email && <p className="text-sm text-destructive">{codeErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-page-code">{labels.verificationCode}</Label>
              <div className="relative">
                <Input
                  id="login-page-code"
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
                      aria-label={labels.clearCode}
                    >
                      <ClearIcon />
                    </button>
                  )}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-normal"
                    onClick={() => void handleSendCode()}
                    disabled={secondsLeft > 0 || sendPending}
                  >
                    {sendPending ? <Spinner /> : secondsLeft > 0 ? `${secondsLeft}s` : labels.getCode}
                  </Button>
                </div>
              </div>
              {codeErrors.code && <p className="text-sm text-destructive">{codeErrors.code}</p>}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Spinner /> : labels.submit}
            </Button>
          </form>
        )}

        {/* Third-party entries */}
        {showOAuth && (
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{labels.orContinueWith}</span>
              </div>
            </div>
            {oauthProviders?.map((provider, index) => (
              <Button key={provider.id} asChild variant="outline" className={index === 0 ? "w-full" : "mt-3 w-full"}>
                <a href={provider.href}>
                  {provider.icon && <span className="mr-2 inline-flex items-center">{provider.icon}</span>}
                  {provider.label}
                </a>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TotpChallengeProps {
  labels: LoginLabels;
  isPending: boolean;
  onSubmit: (code: string) => void;
  onBack: () => void;
}

function TotpChallenge({ labels, isPending, onSubmit, onBack }: TotpChallengeProps) {
  const [totpCode, setTotpCode] = useState("");

  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        if (totpCode.length === CODE_LENGTH) onSubmit(totpCode);
      }}
      noValidate
      className="space-y-5"
    >
      <div className="space-y-2">
        <Label htmlFor="login-page-totp">{labels.totpLabel}</Label>
        <Input
          id="login-page-totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          placeholder="123456"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{labels.totpHint}</p>
      </div>

      <Button type="submit" className="w-full" disabled={isPending || totpCode.length !== CODE_LENGTH}>
        {isPending ? <Spinner /> : labels.totpSubmit}
      </Button>
      <Button type="button" variant="link" size="sm" className="w-full" onClick={onBack}>
        {labels.back}
      </Button>
    </form>
  );
}
