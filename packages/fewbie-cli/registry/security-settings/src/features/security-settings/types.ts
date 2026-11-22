/**
 * Every string the cards render. The host supplies translated copy.
 */
export interface SecuritySettingsLabels {
  activeSessions: string;
  loadingSessions: string;
  loadSessionsFailed: string;
  noSessions: string;
  unknownDevice: string;
  thisDevice: string;
  signOutSession: string;
  twoFactorTitle: string;
  statusEnabled: string;
  statusDisabled: string;
  twoFactorDesc: string;
  qrAlt: string;
  scanQr: string;
  enterCode: string;
  confirmEnable: string;
  currentPassword: string;
  passwordPlaceholder: string;
  or: string;
  authenticatorCode: string;
  disable: string;
  disableTwoFactor: string;
  setupWithApp: string;
  cancel: string;
  retry: string;
  actionFailed: string;
}

/** One active session row, trimmed to what the card displays. */
export interface SecuritySession {
  id: number;
  browser?: string;
  operatingSystem?: string;
  isCurrentSession?: boolean;
  ipAddress?: string;
  city?: string;
  region?: string;
  countryCode?: string;
  createdAt: string;
}

export interface SecurityTwoFactorSetup {
  qrCodeDataUrl: string;
  secret: string;
}

/**
 * Host-owned transport. The module never calls fetch or a query library: the
 * host decides how to reach its backend and what to do after each mutation.
 */
export interface SecuritySettingsPort {
  listSessions(): Promise<{ records: SecuritySession[] }>;
  revokeSession(id: number): Promise<void>;
  setupTwoFactor(): Promise<SecurityTwoFactorSetup>;
  enableTwoFactor(code: string): Promise<void>;
  disableTwoFactor(input: { password?: string; code?: string }): Promise<void>;
}

export interface SecuritySettingsProps {
  labels: SecuritySettingsLabels;
  /** True when the account already has an authenticator app enrolled. */
  twoFactorEnabled: boolean;
  /**
   * Formats a session timestamp for display. The host owns locale formatting;
   * the module falls back to `toLocaleString` when omitted.
   */
  formatDateTime?: (iso: string) => string;
  port: SecuritySettingsPort;
  /** Called after a session was revoked so the host can refresh its cache. */
  onSessionsChanged?: () => void;
  /** Called after two-factor was enabled or disabled so the host can refresh. */
  onTwoFactorChanged?: () => void;
}
