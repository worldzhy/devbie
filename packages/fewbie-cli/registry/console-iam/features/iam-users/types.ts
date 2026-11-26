import type { ReactNode } from "react";

import type { SectionTabItem } from "@/fewbie/framework/page/section-tabs";

import type { IamRole, IamUser, IamUserInput, IamUserPage, IamUserQuery, IamUserStatus } from "../../lib/iam-types";

export type { IamRole, IamUser, IamUserInput, IamUserPage, IamUserQuery, IamUserStatus };

/** What a successful write did, so the host owns the toast copy. */
export type IamUserAction = "created" | "updated" | "deleted" | "approved" | "rejected";

/** Every string the users screen renders; the host supplies translated copy. */
export interface IamUsersLabels {
  usersTitle: string;
  usersSubtitle: string;
  usersSearchPlaceholder: string;
  usersStatusFilter: string;
  usersStatusAll: string;
  usersStatusActive: string;
  usersStatusInactive: string;
  usersStatusPending: string;
  usersLoading: string;
  usersErrorTitle: string;
  usersRetry: string;
  usersEmptyTitle: string;
  usersEmptyDescription: string;
  usersColUser: string;
  usersColRoles: string;
  usersColStatus: string;
  usersColLastLogin: string;
  usersColActions: string;
  usersCreate: string;
  usersCreateTitle: string;
  usersEditTitle: string;
  usersDeleteTitle: string;
  /** `name` is the display name of the row being deleted. */
  usersDeleteDescription: (name: string) => string;
  usersCannotDeleteSelf: string;
  usersApprove: string;
  usersApproveTitle: string;
  /** `name` is the display name of the account being approved. */
  usersApproveDescription: (name: string) => string;
  usersApproveRolesHint: string;
  usersReject: string;
  usersRejectTitle: string;
  /** `name` is the display name of the application being rejected. */
  usersRejectDescription: (name: string) => string;
  usersBuiltin: string;
  usersName: string;
  usersFirstName: string;
  usersMiddleName: string;
  usersLastName: string;
  usersEmail: string;
  usersPhone: string;
  usersPassword: string;
  usersPasswordHint: string;
  usersRoles: string;
  usersStatus: string;
  usersNoRoles: string;
  usersValidationEmailRequired: string;
  usersValidationEmailInvalid: string;
  usersValidationNameRequired: string;
  usersValidationRolesRequired: string;
  /** Fallback shown when a write fails without a message. */
  usersActionFailed: string;
  usersCancel: string;
  usersSave: string;
  usersEdit: string;
  usersDelete: string;
  usersPrevious: string;
  usersNext: string;
  /** 1-based page summary, e.g. `Page 2 of 7`. */
  usersPageOf: (page: number, totalPages: number) => string;
  /** 1-based record summary, e.g. `128 accounts`. */
  usersRecordCount: (total: number) => string;
}

/**
 * Host-owned transport for accounts. The module never imports the host's fetch
 * client, router or query keys; errors surface through `onError`.
 */
export interface IamUsersPort {
  listUsers(query: IamUserQuery): Promise<IamUserPage>;
  /** Every assignable role; the picker offers whatever the backend reports. */
  listRoles(): Promise<IamRole[]>;
  createUser(input: IamUserInput): Promise<void>;
  updateUser(userId: string, input: IamUserInput): Promise<void>;
  /** Accepts an application: flips the status and grants the picked roles. */
  approveUser(userId: string, roles: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export interface IamUsersProps {
  labels: IamUsersLabels;
  port: IamUsersPort;
  /** Section tabs the host wants above the table. */
  tabs?: readonly SectionTabItem[];
  /** Rows per page; defaults to 20. */
  pageSize?: number;
  /** Seeds the first request, e.g. from the URL's search params. */
  initialQuery?: Partial<IamUserQuery>;
  /** Called whenever the request changes, so the host can mirror it into the URL. */
  onQueryChange?: (query: IamUserQuery) => void;
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Called after a write succeeds, so the host owns the toast copy. */
  onSuccess?: (action: IamUserAction) => void;
  /** The signed-in account: self-delete and self-status changes are blocked. */
  currentUserId?: string;
  /** Formats an ISO timestamp in the host's locale and time zone. */
  formatDateTime: (iso: string) => string;
  /** Extra read-only content under the edit form (host-specific identity blocks). */
  renderUserExtra?: (user: IamUser) => ReactNode;
}
