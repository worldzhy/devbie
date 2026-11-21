import type { ReactNode } from "react";

/**
 * Every string the page renders. The host supplies translated copy; the module
 * owns no user-facing text of its own, so a host that follows the fewbie
 * i18n rule (display copy lives in the host message files) stays compliant.
 */
export interface LoginLabels {
  title: string;
  description: string;
  tabPassword: string;
  tabVerificationCode: string;
  email: string;
  password: string;
  submit: string;
  verificationCode: string;
  getCode: string;
  orContinueWith: string;
  back: string;
  clearEmail: string;
  clearPassword: string;
  hidePassword: string;
  showPassword: string;
  clearCode: string;
  invalidEmail: string;
  emailRequired: string;
  passwordMin: string;
  passwordRequired: string;
  codeDigits: string;
  codeRequired: string;
  invalidCredentials: string;
  loginFailed: string;
  totpLabel: string;
  totpHint: string;
  totpSubmit: string;
}

/** One third-party sign-in entry; the host owns the URL and the brand mark. */
export interface LoginOAuthProvider {
  /** Stable key for React, e.g. "google". */
  id: string;
  label: string;
  /** Absolute URL of the provider's backend entry point. */
  href: string;
  icon?: ReactNode;
}

export interface LoginCredentials {
  account: string;
  password: string;
}

export interface LoginVerificationCode {
  account: string;
  verificationCode: string;
}

/** Second factor for a sign-in the backend already accepted. */
export interface LoginTotpChallenge {
  totpToken: string;
  code: string;
}

export interface LoginResult {
  /** True only when a session was established. */
  ok: boolean;
  /** The backend rejected the credentials (as opposed to a transport error). */
  invalidCredentials?: boolean;
  /** A second factor is still required; the page renders the authenticator form. */
  multiFactorRequired?: boolean;
  totpToken?: string;
}

export interface VerificationCodeResult {
  ok: boolean;
  /** Resend cooldown reported by the backend; defaults to 60 seconds. */
  secondsOfCountdown?: number;
}

/**
 * Host-owned transport and side effects. The module never calls fetch or the
 * router: the host decides how to reach its backend and where to navigate.
 */
export interface LoginPort {
  signIn(input: LoginCredentials | LoginVerificationCode | LoginTotpChallenge): Promise<LoginResult>;
  sendVerificationCode(email: string): Promise<VerificationCodeResult>;
}

export interface LoginPageProps {
  labels: LoginLabels;
  port: LoginPort;
  /** Persistent banners (pending approval, disabled account, ...), host-styled. */
  notices?: ReactNode;
  /** Third-party providers; the divider is hidden when empty. */
  oauthProviders?: LoginOAuthProvider[];
  /** Called after a successful sign-in; the host navigates. */
  onSignedIn?: () => void;
  /** Called after a verification code was sent; the host may toast. */
  onCodeSent?: () => void;
}
