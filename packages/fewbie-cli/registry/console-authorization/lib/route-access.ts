import type { PermissionGroupSummary } from "./types";

/**
 * Whether the caller's permission groups include the one that owns a route.
 *
 * The backend authorizes by (resource, action) atoms derived from permission
 * groups, never by role name, so gating on roles made non-admin accounts hit a
 * dead end the backend would have served. Exact match on purpose: `/iam` does
 * not grant `/iam/users` for free. Fails closed when the groups are unknown.
 */
export function hasRouteAccess(groups: PermissionGroupSummary[] | undefined, routePath: string): boolean {
  return (groups ?? []).some((group) => group.routePath === routePath);
}
