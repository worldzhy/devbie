import type { ReactNode } from "react";

/**
 * Every string the page renders. The host supplies translated copy; the module
 * owns no user-facing text of its own.
 */
export interface ForgotPasswordLabels {
  title: string;
  description: string;
  emailLabel: string;
  codeLabel: string;
  newPasswordLabel: string;
  getCode: string;
  resetButton: string;
  back: string;
  clearEmail: string;
  clearCode: string;
  clearPassword: string;
  showPassword: string;
  hidePassword: string;
  invalidEmail: string;
  emailRequired: string;
  codeDigits: string;
  codeRequired: string;
  passwordRule: string;
  passwordRequired: string;
  requestFailed: string;
  resetFailed: string;
  passwordRequirements: string;
  passwordRuleLength: string;
  passwordRuleLowercase: string;
  passwordRuleUppercase: string;
  passwordRuleNumber: string;
  passwordRuleSymbol: string;
}

export interface ResetPasswordInput {
  email: string;
  verificationCode: string;
  newPassword: string;
}

export interface SendResetCodeResult {
  /** Resend cooldown reported by the backend; defaults to 60 seconds. */
  secondsOfCountdown?: number;
}

/**
 * Host-owned transport. The module never calls fetch, a router or a toast
 * library: the host decides how to reach its backend and what to do after a
 * successful reset.
 */
export interface ForgotPasswordPort {
  sendResetCode(email: string): Promise<SendResetCodeResult>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
}

export interface ForgotPasswordProps {
  labels: ForgotPasswordLabels;
  port: ForgotPasswordPort;
  /** Email carried over from the sign-in page, used to seed the form. */
  initialEmail?: string;
  /** Persistent banners, host-styled. */
  notices?: ReactNode;
  /** Called after a verification code was sent; the host may toast. */
  onCodeSent?: () => void;
  /** Called after a successful reset; the host navigates. */
  onReset?: () => void;
  /** Renders the back link when provided; the host navigates. */
  onBack?: () => void;
}
