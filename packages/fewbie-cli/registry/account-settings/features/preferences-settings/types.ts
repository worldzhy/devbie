export type ThemePreferenceValue = "LIGHT" | "DARK" | "SYSTEM";

export interface PreferencesLanguageOption {
  value: string;
  label: string;
}

/**
 * Every string the cards render. The host supplies translated copy, including
 * the labels of the language options it passes in.
 */
export interface PreferencesSettingsLabels {
  languageTitle: string;
  languageDesc: string;
  themeTitle: string;
  themeDesc: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  timezoneTitle: string;
  timezoneDesc: string;
  timezonePlaceholder: string;
  useBrowserTimezone: string;
  saveTimezone: string;
  updateFailed: string;
}

export interface PreferencesSettingsValues {
  language: string;
  theme: ThemePreferenceValue;
  timezone: string;
}

/**
 * Host-owned write path. The module never calls fetch, a router or a toast
 * library: the host persists each preference and decides how to apply it.
 */
export interface PreferencesSettingsPort {
  saveLanguage(language: string): Promise<void>;
  saveTheme(theme: ThemePreferenceValue): Promise<void>;
  saveTimezone(timezone: string): Promise<void>;
}

export interface PreferencesSettingsProps {
  labels: PreferencesSettingsLabels;
  values: PreferencesSettingsValues;
  /** Languages the host ships dictionaries for. */
  languages: PreferencesLanguageOption[];
  port: PreferencesSettingsPort;
  /** Called after a language was saved; the host refreshes its locale. */
  onLanguageChanged?: (language: string) => void;
  /** Called after a theme was saved; the host applies it locally. */
  onThemeChanged?: (theme: ThemePreferenceValue) => void;
  /** Called after a timezone was saved; the host refreshes its cache. */
  onTimezoneChanged?: (timezone: string) => void;
}
