import type { ReactNode } from "react";

import type { PermissionGroupSummary } from "../../lib/types";

export type { PermissionGroupSummary };

/** Every string a gate renders, so the module never owns product copy. */
export interface ConsoleAuthorizationLabels {
  /** Shown when the caller does not hold the group owning the route. */
  accessDeniedTitle: string;
  /** Explains who can grant access. */
  accessDeniedDescription: string;
  /** Announced while the caller's groups are still loading. */
  loadingLabel?: string;
}

export interface ConsoleAccessProviderProps {
  labels: ConsoleAuthorizationLabels;
  /** Groups from `/account/me`; unknown or missing groups fail closed. */
  groups?: PermissionGroupSummary[];
  /** True while the account is still loading. */
  pending?: boolean;
  children: ReactNode;
}
