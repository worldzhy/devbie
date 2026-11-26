/** Account status the backend reports; PENDING_APPROVAL is the application queue. */
export type IamUserStatus = "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL";

/**
 * One account row as the host's backend returns it. Structural on purpose: a
 * host can pass its generated user DTO without a mapping layer.
 */
export interface IamUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  roles: string[];
  status: IamUserStatus;
  /** ISO timestamp; the host supplies the formatter. */
  lastLoginAt?: string | null;
}

/** One platform role. */
export interface IamRole {
  id: number;
  name: string;
  description?: string | null;
  /** Builtin roles cannot be renamed or deleted. */
  isBuiltin: boolean;
  /** Number of accounts holding this role. */
  userCount: number;
}

/** One permission group a role or account can be bound to. */
export interface IamPermissionGroupOption {
  id: number;
  name: string;
  routePath: string;
  navLabel: string;
}

/** A role with the permission groups currently bound to it. */
export interface IamRoleDetail extends IamRole {
  permissionGroups: IamPermissionGroupOption[];
}

/** One user-list request; an absent filter means "no constraint". */
export interface IamUserQuery {
  page: number;
  pageSize: number;
  name?: string;
  status?: IamUserStatus;
}

/** One page of accounts plus the total behind it. */
export interface IamUserPage {
  records: IamUser[];
  total: number;
}

/**
 * Writable account fields. Every field is optional so create and update share
 * one shape; the port decides which subset its endpoint accepts.
 */
export interface IamUserInput {
  name?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  email?: string;
  phone?: string | null;
  /** Create only; hashed by the backend. */
  password?: string;
  roles?: string[];
  status?: IamUserStatus;
}

/** Writable role fields. */
export interface IamRoleInput {
  name: string;
  description?: string;
}

/** The actions the backend accepts for a permission grant. */
export type IamPermissionAction = "List" | "Get" | "Create" | "Update" | "Delete";

/** One row of the grant ledger: a (resource, action) pair granted to a role or a user. */
export interface IamPermission {
  id: number;
  resource: string;
  action: IamPermissionAction;
  roleId?: number | null;
  trustedUserId?: string | null;
  createdAt?: string | null;
}

/** One permission-list request; an absent resource means "no constraint". */
export interface IamPermissionQuery {
  page: number;
  pageSize: number;
  resource?: string;
}

/** One page of grants plus the total behind it. */
export interface IamPermissionPage {
  records: IamPermission[];
  total: number;
}

/** New grant; exactly one of `roleId` / `trustedUserId` scopes it. */
export interface IamPermissionInput {
  resource: string;
  action: IamPermissionAction;
  roleId?: number;
  trustedUserId?: string;
}

/** Where a permission group appears in the console navigation. */
export type IamNavPlacement = "HEADER_NAVIGATION" | "NONE";

/** One permission group as the list endpoint returns it. */
export interface IamPermissionGroup {
  id: number;
  name: string;
  description?: string | null;
  routePath: string;
  navPlacement: IamNavPlacement;
  navOrder: number;
  navLabel: string;
  navIcon?: string | null;
  /** Builtin groups cannot be deleted; their name comes from the seed. */
  isBuiltin: boolean;
}

/** One (resource, action) grant inside a permission group. */
export interface IamGroupPermission {
  id: number;
  resource: string;
  action: IamPermissionAction;
}

/** A permission group with every grant attached to it. */
export interface IamPermissionGroupDetail extends IamPermissionGroup {
  permissions: IamGroupPermission[];
}

/** Writable permission-group fields. */
export interface IamPermissionGroupInput {
  name: string;
  description?: string;
  routePath: string;
  navPlacement: IamNavPlacement;
  navLabel: string;
  navIcon?: string;
}

/** One grant in a group's replacement set. */
export interface IamGroupPermissionInput {
  resource: string;
  action: IamPermissionAction;
}

/** Best display label for an account, mirroring the backend's own fallback order. */
export function userDisplayName(user: IamUser): string {
  const joined = [user.firstName, user.lastName].filter((part) => part && part.trim()).join(" ");
  return user.name?.trim() || joined || user.email?.trim() || user.phone?.trim() || user.id;
}
