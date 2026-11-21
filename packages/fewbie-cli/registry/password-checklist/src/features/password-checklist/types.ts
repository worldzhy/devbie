/**
 * Every string the checklist renders. The host supplies translated copy; the
 * module owns no user-facing text of its own.
 */
export interface PasswordChecklistLabels {
  /** Accessible name of the requirement list. */
  requirements: string;
  ruleLength: string;
  ruleLowercase: string;
  ruleUppercase: string;
  ruleNumber: string;
  ruleSymbol: string;
}

export interface PasswordChecklistProps {
  labels: PasswordChecklistLabels;
  password: string;
}
