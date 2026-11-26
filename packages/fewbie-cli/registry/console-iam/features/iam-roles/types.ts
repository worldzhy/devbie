import type { SectionTabItem } from "@/fewbie/framework/page/section-tabs";

import type { IamPermissionGroupOption, IamRole, IamRoleDetail, IamRoleInput } from "../../lib/iam-types";

export type { IamPermissionGroupOption, IamRole, IamRoleDetail, IamRoleInput };

/** What a successful write did, so the host owns the toast copy. */
export type IamRoleAction = "roleCreated" | "roleUpdated" | "roleDeleted" | "roleGroupsUpdated";

/** Every string the roles screen renders; the host supplies translated copy. */
export interface IamRolesLabels {
  rolesTitle: string;
  rolesSubtitle: string;
  rolesLoading: string;
  rolesErrorTitle: string;
  rolesRetry: string;
  rolesEmptyTitle: string;
  rolesEmptyDescription: string;
  rolesCreate: string;
  rolesCreateTitle: string;
  /** `name` is the role being edited. */
  rolesEditTitle: (name: string) => string;
  rolesColName: string;
  rolesColDescription: string;
  rolesColUsers: string;
  rolesColType: string;
  rolesColActions: string;
  rolesBuiltin: string;
  rolesCustom: string;
  rolesBuiltinHint: string;
  rolesBuiltinNoRename: string;
  rolesBuiltinNoDelete: string;
  rolesName: string;
  rolesNamePlaceholder: string;
  rolesDescription: string;
  rolesDescriptionPlaceholder: string;
  rolesValidationNameRequired: string;
  rolesDeleteTitle: string;
  /** `name` is the role being deleted. */
  rolesDeleteDescription: (name: string) => string;
  rolesCancel: string;
  rolesSave: string;
  rolesEdit: string;
  rolesDelete: string;
  rolesPermissionGroups: string;
  rolesPermissionGroupsHint: string;
  rolesSaveGroups: string;
  rolesNoGroups: string;
  rolesNoGroupsBound: string;
  /** Shown when the role detail (its current bindings) cannot be loaded. */
  rolesGroupsLoadError: string;
  /** Fallback shown when a write fails without a message. */
  rolesActionFailed: string;
  /** 1-based record summary, e.g. `6 roles`. */
  rolesRecordCount: (total: number) => string;
}

/**
 * Host-owned transport for roles and their permission-group bindings. The
 * module never imports the host's fetch client, router or query keys; errors
 * surface through `onError`.
 */
export interface IamRolesPort {
  listRoles(): Promise<IamRole[]>;
  /** One role with the permission groups currently bound to it. */
  getRole(roleId: number): Promise<IamRoleDetail>;
  /** Every permission group a role can be bound to. */
  listPermissionGroups(): Promise<IamPermissionGroupOption[]>;
  createRole(input: IamRoleInput): Promise<void>;
  updateRole(roleId: number, input: IamRoleInput): Promise<void>;
  deleteRole(roleId: number): Promise<void>;
  /** Replaces the whole binding set so the backend stays transactional. */
  replaceRoleGroups(roleId: number, groupIds: number[]): Promise<void>;
}

export interface IamRolesProps {
  labels: IamRolesLabels;
  port: IamRolesPort;
  /** Section tabs the host wants above the table. */
  tabs?: readonly SectionTabItem[];
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Called after a write succeeds, so the host owns the toast copy. */
  onSuccess?: (action: IamRoleAction) => void;
}
