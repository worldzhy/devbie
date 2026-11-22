"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SecuritySession, SecuritySettingsProps, SecurityTwoFactorSetup } from "./types";

const CODE_LENGTH = 6;

/** SSR-safe date fallback: fixed locale and zone, so both renders agree. */
const DEFAULT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
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

function ShieldCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-green-600 dark:text-green-500"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ShieldOffIcon() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

function TrashIcon() {
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
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </svg>
  );
}

/** Format the location parts carried on a session row. */
function formatLocation(session: SecuritySession): string {
  return [session.city, session.region, session.countryCode].filter(Boolean).join(", ");
}

/**
 * Account security cards: active sessions with per-row sign-out, and
 * authenticator-app enrollment. The host owns transport, cache invalidation
 * and toasts; the module only renders and reports through callbacks.
 */
export function SecuritySettings({
  labels,
  twoFactorEnabled,
  formatDateTime,
  port,
  onSessionsChanged,
  onTwoFactorChanged,
}: SecuritySettingsProps) {
  // Keep the port reachable from the mount effect without re-running it when
  // the host re-creates its callback objects on every render.
  const portRef = useRef(port);
  useEffect(() => {
    portRef.current = port;
  }, [port]);

  const [sessions, setSessions] = useState<SecuritySession[] | null>(null);
  const [sessionsPending, setSessionsPending] = useState(true);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [setupData, setSetupData] = useState<SecurityTwoFactorSetup | null>(null);
  const [setupPending, setSetupPending] = useState(false);
  const [enableCode, setEnableCode] = useState("");
  const [enablePending, setEnablePending] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disablePending, setDisablePending] = useState(false);

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const result = await portRef.current.listSessions();
      setSessions(result.records);
      setSessionsFailed(false);
    } catch {
      setSessionsFailed(true);
    } finally {
      setSessionsPending(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function retrySessions(): void {
    setSessionsPending(true);
    setSessionsFailed(false);
    void loadSessions();
  }

  // Deterministic fallback: a locale/timezone-sensitive formatter would render
  // differently on the server and in the browser (R84-10). Hosts pass
  // `formatDateTime` to localize.
  const formatDate = formatDateTime ?? ((iso: string) => DEFAULT_DATE_FORMATTER.format(new Date(iso)));

  async function handleRevoke(id: number): Promise<void> {
    if (revokingId !== null) return;
    setRevokingId(id);
    setActionError(null);
    try {
      await port.revokeSession(id);
      onSessionsChanged?.();
      await loadSessions();
    } catch {
      setActionError(labels.actionFailed);
    } finally {
      setRevokingId(null);
    }
  }

  async function handleSetup(): Promise<void> {
    if (setupPending) return;
    setSetupPending(true);
    setActionError(null);
    try {
      setSetupData(await port.setupTwoFactor());
    } catch {
      setActionError(labels.actionFailed);
    } finally {
      setSetupPending(false);
    }
  }

  async function handleEnable(): Promise<void> {
    if (enablePending) return;
    setEnablePending(true);
    setActionError(null);
    try {
      await port.enableTwoFactor(enableCode);
      setSetupData(null);
      setEnableCode("");
      onTwoFactorChanged?.();
    } catch {
      setActionError(labels.actionFailed);
    } finally {
      setEnablePending(false);
    }
  }

  async function handleDisable(): Promise<void> {
    if (disablePending) return;
    setDisablePending(true);
    setActionError(null);
    try {
      await port.disableTwoFactor(disablePassword ? { password: disablePassword } : { code: disableCode });
      setDisableMode(false);
      setDisablePassword("");
      setDisableCode("");
      onTwoFactorChanged?.();
    } catch {
      setActionError(labels.actionFailed);
    } finally {
      setDisablePending(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorIcon />
            {labels.activeSessions}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {labels.loadingSessions}
            </div>
          ) : sessionsFailed ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              {labels.loadSessionsFailed}
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={retrySessions}>
                {labels.retry}
              </Button>
            </div>
          ) : !sessions?.length ? (
            <p className="text-sm text-muted-foreground">{labels.noSessions}</p>
          ) : (
            <ul className="divide-y">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {[session.browser, session.operatingSystem].filter(Boolean).join(" · ") || labels.unknownDevice}
                      </p>
                      {session.isCurrentSession && (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400"
                        >
                          {labels.thisDevice}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[session.ipAddress, formatLocation(session)].filter(Boolean).join(" · ")} ·{" "}
                      {formatDate(session.createdAt)}
                    </p>
                  </div>
                  {!session.isCurrentSession && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.signOutSession}
                      disabled={revokingId !== null}
                      onClick={() => void handleRevoke(session.id)}
                    >
                      {revokingId === session.id ? <Spinner /> : <TrashIcon />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              {twoFactorEnabled ? <ShieldCheckIcon /> : <ShieldOffIcon />}
              {labels.twoFactorTitle}
            </span>
            <Badge variant={twoFactorEnabled ? "default" : "outline"}>
              {twoFactorEnabled ? labels.statusEnabled : labels.statusDisabled}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{labels.twoFactorDesc}</p>

          {/* Enrollment flow: QR code plus code confirmation */}
          {setupData && (
            <div className="space-y-4 rounded-md border bg-muted/30 p-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrCodeDataUrl}
                  alt={labels.qrAlt}
                  className="h-40 w-40 rounded-md border bg-white p-2"
                />
                <div className="min-w-0 space-y-2">
                  <p className="text-xs text-muted-foreground">{labels.scanQr}</p>
                  <p className="break-all rounded bg-background p-2 font-mono text-xs">{setupData.secret}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="security-settings-enable-code">{labels.enterCode}</Label>
                <Input
                  id="security-settings-enable-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={enableCode}
                  onChange={(event) => setEnableCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  placeholder="123456"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSetupData(null);
                    setEnableCode("");
                  }}
                  disabled={enablePending}
                >
                  {labels.cancel}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleEnable()}
                  disabled={enablePending || enableCode.length !== CODE_LENGTH}
                >
                  {enablePending ? <Spinner /> : labels.confirmEnable}
                </Button>
              </div>
            </div>
          )}

          {/* Disable flow: prove identity with password or a current code */}
          {disableMode && (
            <div className="space-y-4 rounded-md border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label htmlFor="security-settings-disable-password">{labels.currentPassword}</Label>
                <Input
                  id="security-settings-disable-password"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(event) => {
                    setDisablePassword(event.target.value);
                    setDisableCode("");
                  }}
                  placeholder={labels.passwordPlaceholder}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">{labels.or}</p>
              <div className="space-y-2">
                <Label htmlFor="security-settings-disable-code">{labels.authenticatorCode}</Label>
                <Input
                  id="security-settings-disable-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={disableCode}
                  onChange={(event) => {
                    setDisableCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH));
                    setDisablePassword("");
                  }}
                  placeholder="123456"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisableMode(false);
                    setDisablePassword("");
                    setDisableCode("");
                  }}
                  disabled={disablePending}
                >
                  {labels.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDisable()}
                  disabled={disablePending || (!disablePassword && disableCode.length !== CODE_LENGTH)}
                >
                  {disablePending ? <Spinner /> : labels.disable}
                </Button>
              </div>
            </div>
          )}

          {actionError && <p className="text-sm text-destructive">{actionError}</p>}

          {/* Idle actions */}
          {!setupData && !disableMode && (
            <div>
              {twoFactorEnabled ? (
                <Button type="button" variant="outline" onClick={() => setDisableMode(true)}>
                  {labels.disableTwoFactor}
                </Button>
              ) : (
                <Button type="button" onClick={() => void handleSetup()} disabled={setupPending}>
                  {setupPending ? <Spinner /> : labels.setupWithApp}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
