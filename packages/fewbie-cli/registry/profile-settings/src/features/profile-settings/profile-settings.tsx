"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileSettingsProps, ProfileSettingsValues } from "./types";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
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

function sameValues(left: ProfileSettingsValues, right: ProfileSettingsValues): boolean {
  return (
    left.name === right.name &&
    left.firstName === right.firstName &&
    left.middleName === right.middleName &&
    left.lastName === right.lastName &&
    left.email === right.email
  );
}

/**
 * Account profile card: first/middle/last name plus the display name. The host
 * owns data loading, persistence and toasts; the module only edits the values.
 */
export function ProfileSettings({ labels, profile, onSave }: ProfileSettingsProps) {
  const [form, setForm] = useState<ProfileSettingsValues>(profile);
  // Re-seed when the host supplies a different account, comparing values (not
  // object identity) so a parent re-render never overwrites in-progress edits.
  const [seed, setSeed] = useState<ProfileSettingsValues>(profile);
  if (!sameValues(profile, seed)) {
    setSeed(profile);
    setForm(profile);
  }

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof ProfileSettingsValues, value: string): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onSave(form);
    } catch {
      setError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{labels.personalInfo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="profile-settings-first-name">{labels.firstName}</Label>
            <Input
              id="profile-settings-first-name"
              value={form.firstName}
              onChange={(event) => updateField("firstName", event.target.value)}
              placeholder={labels.firstName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-settings-middle-name">{labels.middleName}</Label>
            <Input
              id="profile-settings-middle-name"
              value={form.middleName}
              onChange={(event) => updateField("middleName", event.target.value)}
              placeholder={labels.middleName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-settings-last-name">{labels.lastName}</Label>
            <Input
              id="profile-settings-last-name"
              value={form.lastName}
              onChange={(event) => updateField("lastName", event.target.value)}
              placeholder={labels.lastName}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-settings-name">{labels.displayName}</Label>
          <Input
            id="profile-settings-name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder={labels.displayNamePlaceholder}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button type="button" onClick={() => void handleSave()} disabled={pending}>
            {pending ? <Spinner /> : <SaveIcon />}
            {labels.saveChanges}
          </Button>
          <p className="text-xs text-muted-foreground">
            {labels.email}: {profile.email ?? "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
