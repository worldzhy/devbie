/**
 * Every string the card renders. The host supplies translated copy.
 */
export interface ProfileSettingsLabels {
  personalInfo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  displayNamePlaceholder: string;
  saveChanges: string;
  email: string;
  saveFailed: string;
}

export interface ProfileSettingsValues {
  name: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email?: string;
}

/**
 * Host-owned write path. The module never calls fetch or a toast library: the
 * host persists the values and decides how to report the outcome.
 */
export interface ProfileSettingsProps {
  labels: ProfileSettingsLabels;
  /** Current account values; the form re-seeds when these change. */
  profile: ProfileSettingsValues;
  /** Persist the edited values; the host toasts and refreshes its cache. */
  onSave(values: ProfileSettingsValues): Promise<void>;
}
