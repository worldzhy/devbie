"use client";

import { createContext, useContext, useMemo } from "react";

import type { ConsoleAccessProviderProps, ConsoleAuthorizationLabels, PermissionGroupSummary } from "./types";

interface AccessContextValue {
  groups: PermissionGroupSummary[];
  pending: boolean;
  labels: ConsoleAuthorizationLabels;
}

const FALLBACK_LABELS: ConsoleAuthorizationLabels = {
  accessDeniedTitle: "Access denied",
  accessDeniedDescription: "Ask an administrator for the permission group that owns this page.",
  loadingLabel: "Checking access",
};

// Fails closed: a subtree mounted without the provider sees no groups and no
// pending state, so every gate renders the denied panel instead of leaking UI.
const AccessContext = createContext<AccessContextValue>({
  groups: [],
  pending: false,
  labels: FALLBACK_LABELS,
});

/**
 * Publishes the caller's permission groups to every gate below it.
 *
 * The provider never fetches: cb injects the groups from its server session and
 * nw from its current-user query, so the module stays transport-free. It also
 * never blocks rendering — `pending` is carried in the context so each gate
 * decides between a spinner and the denied panel.
 */
export function ConsoleAccessProvider({ labels, groups, pending = false, children }: ConsoleAccessProviderProps) {
  const value = useMemo<AccessContextValue>(
    () => ({ groups: groups ?? [], pending, labels }),
    [groups, pending, labels],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useConsoleAccess(): AccessContextValue {
  return useContext(AccessContext);
}
