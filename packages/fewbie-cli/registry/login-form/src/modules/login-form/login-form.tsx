"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { login } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { LoginFormProps } from "./types";

export function LoginForm({ labels, redirectPath = "/", onLoggedIn }: LoginFormProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ account, password });
      onLoggedIn(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.loginFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{labels.title}</CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="account">{labels.account}</Label>
              <Input
                id="account"
                name="account"
                autoComplete="username"
                placeholder={labels.accountPlaceholder}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{labels.password}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : labels.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
