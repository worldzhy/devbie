/**
 * Every string the form renders. The host supplies translated copy; the module
 * owns no user-facing text of its own.
 */
export interface LoginFormLabels {
  title: string;
  description: string;
  account: string;
  accountPlaceholder: string;
  password: string;
  submit: string;
  loginFailed: string;
}

export interface LoginFormProps {
  labels: LoginFormLabels;
  /** App path to open after a successful sign-in; the host usually reads `?redirect=`. */
  redirectPath?: string;
  /** Called after sign-in succeeds; the host performs the navigation. */
  onLoggedIn: (path: string) => void;
}
