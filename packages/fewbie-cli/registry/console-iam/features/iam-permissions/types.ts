import type { SectionTabItem } from "@/fewbie/framework/page/section-tabs";

import type {
  IamPermission,
  IamPermissionAction,
  IamPermissionInput,
  IamPermissionPage,
  IamPermissionQuery,
  IamRole,
} from "../../lib/iam-types";

export type { IamPermission, IamPermissionAction, IamPermissionInput, IamPermissionPage, IamPermissionQuery, IamRole };

/** What a successful write did, so the host owns the toast copy. */
export type IamPermissionWrite = "created" | "deleted";

/** Every string the permissions screen renders; the host supplies translated copy. */
export interface IamPermissionsLabels {
  permTitle: string;
  permSubtitle: string;
  permLoading: string;
  permErrorTitle: string;
  permRetry: string;
  permEmptyTitle: string;
  permEmptyDescription: string;
  permResourceFilter: string;
  permAllResources: string;
  permCreate: string;
  permCreateTitle: string;
  permCreateDescription: string;
  permColResource: string;
  permColAction: string;
  permColScope: string;
  permColCreatedAt: string;
  permColActions: string;
  /** `role` is the granted role's display name. */
  permGrantedToRole: (role: string) => string;
  /** `id` is the trusted user id. */
  permGrantedToUser: (id: string) => string;
  permResource: string;
  permAction: string;
  permRole: string;
  permRolePlaceholder: string;
  permTrustedUserId: string;
  permTrustedUserHint: string;
  permValidationResourceRequired: string;
  permValidationActionRequired: string;
  permValidationTargetRequired: string;
  permDeleteTitle: string;
  /** `action` and `resource` identify the grant being revoked. */
  permDeleteDescription: (resource: string, action: string) => string;
  /** Fallback shown when a write fails without a message. */
  permActionFailed: string;
  permCancel: string;
  permDelete: string;
  permPrevious: string;
  permNext: string;
  /** 1-based page summary, e.g. `Page 2 of 7`. */
  permPageOf: (page: number, totalPages: number) => string;
  /** 1-based record summary, e.g. `128 grants`. */
  permRecordCount: (total: number) => string;
}

/**
 * Host-owned transport for the grant ledger. The module never imports the
 * host's fetch client, router or query keys; errors surface through `onError`.
 */
export interface IamPermissionsPort {
  listPermissions(query: IamPermissionQuery): Promise<IamPermissionPage>;
  listRoles(): Promise<IamRole[]>;
  /** Resource names the backend accepts for a grant. */
  listResources(): Promise<string[]>;
  /** Action names the backend accepts for a grant. */
  listActions(): Promise<string[]>;
  createPermission(input: IamPermissionInput): Promise<void>;
  deletePermission(permissionId: number): Promise<void>;
}

export interface IamPermissionsProps {
  labels: IamPermissionsLabels;
  port: IamPermissionsPort;
  /** Section tabs the host wants above the table. */
  tabs?: readonly SectionTabItem[];
  /** Rows per page; defaults to 20. */
  pageSize?: number;
  /** Seeds the first request, e.g. from the URL's search params. */
  initialQuery?: Partial<IamPermissionQuery>;
  /** Called whenever the request changes, so the host can mirror it into the URL. */
  onQueryChange?: (query: IamPermissionQuery) => void;
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Called after a write succeeds, so the host owns the toast copy. */
  onSuccess?: (action: IamPermissionWrite) => void;
  /** Formats an ISO timestamp in the host's locale and time zone. */
  formatDateTime: (iso: string) => string;
}
