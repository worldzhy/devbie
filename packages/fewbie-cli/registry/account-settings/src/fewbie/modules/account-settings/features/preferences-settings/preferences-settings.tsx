"use client";

import { useState } from "react";

import { Button } from "@/fewbie/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/fewbie/ui/card";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";
import type { PreferencesSettingsProps, ThemePreferenceValue } from "./types";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function SunIcon() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
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
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function MonitorIcon() {
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
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SaveIcon() {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

/**
 * Account display preferences: interface language, theme and timezone. The
 * host owns transport and the side effects of each change (locale cookie,
 * theme class, caching), which enter through `port` and the `on*` callbacks.
 */
export function PreferencesSettings({
  labels,
  values,
  languages,
  port,
  onLanguageChanged,
  onThemeChanged,
  onTimezoneChanged,
}: PreferencesSettingsProps) {
  const [timezone, setTimezone] = useState(values.timezone);
  // Re-seed when the host supplies a different account, comparing values (not
  // object identity) so a parent re-render never overwrites in-progress edits.
  const [seedTimezone, setSeedTimezone] = useState(values.timezone);
  if (values.timezone !== seedTimezone) {
    setSeedTimezone(values.timezone);
    setTimezone(values.timezone);
  }

  const [languagePending, setLanguagePending] = useState(false);
  const [themePending, setThemePending] = useState(false);
  const [timezonePending, setTimezonePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLanguage(value: string): Promise<void> {
    if (languagePending) return;
    setLanguagePending(true);
    setError(null);
    try {
      await port.saveLanguage(value);
      onLanguageChanged?.(value);
    } catch {
      setError(labels.updateFailed);
    } finally {
      setLanguagePending(false);
    }
  }

  async function handleTheme(value: ThemePreferenceValue): Promise<void> {
    if (themePending) return;
    setThemePending(true);
    setError(null);
    try {
      await port.saveTheme(value);
      onThemeChanged?.(value);
    } catch {
      setError(labels.updateFailed);
    } finally {
      setThemePending(false);
    }
  }

  async function handleTimezone(): Promise<void> {
    if (timezonePending) return;
    setTimezonePending(true);
    setError(null);
    try {
      await port.saveTimezone(timezone.trim());
      onTimezoneChanged?.(timezone.trim());
    } catch {
      setError(labels.updateFailed);
    } finally {
      setTimezonePending(false);
    }
  }

  // Read the browser zone only inside the click handler: resolving it during
  // render would differ between the server and the browser.
  function fillBrowserTimezone(): void {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  const themeOptions: { value: ThemePreferenceValue; label: string; icon: React.ReactNode }[] = [
    { value: "LIGHT", label: labels.themeLight, icon: <SunIcon /> },
    { value: "DARK", label: labels.themeDark, icon: <MoonIcon /> },
    { value: "SYSTEM", label: labels.themeSystem, icon: <MonitorIcon /> },
  ];

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.languageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{labels.languageDesc}</p>
          <Select
            value={values.language}
            onValueChange={(value) => void handleLanguage(value)}
            disabled={languagePending}
          >
            <SelectTrigger id="preferences-settings-language" aria-label={labels.languageTitle} className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.themeTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{labels.themeDesc}</p>
          <div className="flex flex-wrap gap-2">
            {themeOptions.map((option) => {
              const active = values.theme === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  disabled={themePending}
                  onClick={() => void handleTheme(option.value)}
                >
                  {option.icon}
                  {option.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.timezoneTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{labels.timezoneDesc}</p>
          <div className="space-y-2">
            <Label htmlFor="preferences-settings-timezone">{labels.timezoneTitle}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="preferences-settings-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder={labels.timezonePlaceholder}
                className="w-72"
                disabled={timezonePending}
              />
              <Button
                type="button"
                onClick={() => void handleTimezone()}
                disabled={timezonePending || timezone.trim() === ""}
              >
                {timezonePending ? <Spinner /> : <SaveIcon />}
                {labels.saveTimezone}
              </Button>
              <Button type="button" variant="outline" onClick={fillBrowserTimezone} disabled={timezonePending}>
                {labels.useBrowserTimezone}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
