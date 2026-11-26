"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/fewbie/ui/button";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import type { LoginLabels } from "./types";

const CODE_LENGTH = 6;

/** The four dictionary entries the challenge renders; a host passes only these. */
export type TotpChallengeLabels = Pick<LoginLabels, "totpLabel" | "totpHint" | "totpSubmit" | "back">;

export interface TotpChallengeProps {
  labels: TotpChallengeLabels;
  /** True while the host's verify call is in flight. */
  isPending: boolean;
  onSubmit: (code: string) => void;
  /** Where the escape hatch under the submit button goes; the host decides. */
  onBack: () => void;
}

/**
 * Second factor for a sign-in the backend already accepted.
 *
 * Every entry that pauses on TOTP uses this form — the password page, the
 * verification-code tab and the OAuth landing pages — so the field, the
 * six-digit guard and the pending state have one implementation, while the
 * host keeps the verify transport and the "back" destination (R107-04).
 */
export function TotpChallenge({ labels, isPending, onSubmit, onBack }: TotpChallengeProps) {
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

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || totpCode.length !== CODE_LENGTH}
        aria-busy={isPending}
        aria-label={labels.totpSubmit}
      >
        {isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : labels.totpSubmit}
      </Button>
      <Button type="button" variant="link" size="sm" className="w-full" onClick={onBack}>
        {labels.back}
      </Button>
    </form>
  );
}
