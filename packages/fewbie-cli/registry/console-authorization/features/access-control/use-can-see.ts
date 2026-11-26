"use client";

import { hasRouteAccess } from "../../lib/route-access";
import { useConsoleAccess } from "./access-provider";

/**
 * Whether the caller holds the permission group that owns `routePath`.
 * Fails closed while the account is still loading.
 */
export function useCanSee(routePath: string): boolean {
  const { groups } = useConsoleAccess();
  return hasRouteAccess(groups, routePath);
}
