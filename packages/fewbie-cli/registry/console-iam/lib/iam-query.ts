import type { IamPermissionQuery, IamUserQuery, IamUserStatus } from "./iam-types";

/** Rows per page unless the host asks for a different size. */
export const DEFAULT_IAM_PAGE_SIZE = 20;

const ROOT = ["modules", "console-iam"] as const;

/**
 * TanStack keys for this module. The namespace keeps the cache apart from the
 * host's own queries; one root per entity lets a write invalidate exactly the
 * lists it invalidates on the backend.
 */
export const iamKeys = {
  users: {
    /** Every user-shaped query, invalidated together after a user write. */
    all: [...ROOT, "users"] as const,
    list: (query: IamUserQuery) => [...ROOT, "users", "page", query] as const,
  },
  roles: {
    /** Every role-shaped query, including details. */
    all: [...ROOT, "roles"] as const,
    detail: (roleId: number) => [...ROOT, "roles", "detail", roleId] as const,
  },
  permissions: {
    /** Every grant list, invalidated after a grant or revoke. */
    all: [...ROOT, "permissions"] as const,
    list: (query: IamPermissionQuery) => [...ROOT, "permissions", "page", query] as const,
    /** Resource names the backend accepts, used by the grant pickers. */
    resources: [...ROOT, "permissions", "resources"] as const,
    /** Action names the backend accepts, used by the grant pickers. */
    actions: [...ROOT, "permissions", "actions"] as const,
  },
  permissionGroups: {
    /** Every permission-group query, including details. */
    all: [...ROOT, "permission-groups"] as const,
    detail: (groupId: number) => [...ROOT, "permission-groups", "detail", groupId] as const,
  },
};

const STATUSES: readonly IamUserStatus[] = ["ACTIVE", "INACTIVE", "PENDING_APPROVAL"];

/**
 * Trim the filters, drop the blank ones and clamp the page, so the port and the
 * cache both see one canonical request shape.
 */
export function normalizeUserQuery(
  query: Partial<IamUserQuery> | undefined,
  pageSize: number = DEFAULT_IAM_PAGE_SIZE,
): IamUserQuery {
  const next: IamUserQuery = { page: Math.max(0, Math.trunc(query?.page ?? 0)), pageSize };

  const name = query?.name?.trim();
  if (name) next.name = name;

  const status = query?.status;
  if (status && STATUSES.includes(status)) next.status = status;

  return next;
}

/** Same canonicalization for the grant ledger: trim the resource, clamp the page. */
export function normalizePermissionQuery(
  query: Partial<IamPermissionQuery> | undefined,
  pageSize: number = DEFAULT_IAM_PAGE_SIZE,
): IamPermissionQuery {
  const next: IamPermissionQuery = { page: Math.max(0, Math.trunc(query?.page ?? 0)), pageSize };
  const resource = query?.resource?.trim();
  if (resource) next.resource = resource;
  return next;
}
