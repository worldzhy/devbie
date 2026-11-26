import type { SectionTabItem } from "@/fewbie/framework/page/section-tabs";

import type {
  IamGroupPermission,
  IamGroupPermissionInput,
  IamNavPlacement,
  IamPermissionGroup,
  IamPermissionGroupDetail,
  IamPermissionGroupInput,
} from "../../lib/iam-types";

export type {
  IamGroupPermission,
  IamGroupPermissionInput,
  IamNavPlacement,
  IamPermissionGroup,
  IamPermissionGroupDetail,
  IamPermissionGroupInput,
};

/** What a successful write did, so the host owns the toast copy. */
export type IamPermissionGroupAction =
  "groupCreated" | "groupUpdated" | "groupDeleted" | "groupsReordered" | "permissionGranted" | "permissionRevoked";

/** Every string the permission-group screens render; the host supplies translated copy. */
export interface IamPermissionGroupsLabels {
  groupTitle: string;
  groupSubtitle: string;
  groupLoading: string;
  groupErrorTitle: string;
  groupRetry: string;
  groupEmptyTitle: string;
  groupEmptyDescription: string;
  groupCreate: string;
  groupCreateTitle: string;
  groupEditTitle: string;
  groupColName: string;
  groupColRoute: string;
  groupColNav: string;
  groupColType: string;
  groupColActions: string;
  groupBuiltin: string;
  groupCustom: string;
  groupBuiltinHint: string;
  groupBuiltinNoDelete: string;
  groupPlacementNone: string;
  groupMoveUp: string;
  groupMoveDown: string;
  groupManage: string;
  groupName: string;
  groupDescription: string;
  groupRoutePath: string;
  groupRoutePathPlaceholder: string;
  groupNavLabel: string;
  groupNavIcon: string;
  groupNavIconPlaceholder: string;
  groupNavPlacement: string;
  groupPlacementHeader: string;
  groupValidationNameRequired: string;
  groupValidationRouteRequired: string;
  groupValidationNavLabelRequired: string;
  groupSave: string;
  groupCancel: string;
  groupDelete: string;
  groupEdit: string;
  groupCreateAction: string;
  groupDeleteTitle: string;
  /** `name` is the group being deleted. */
  groupDeleteDescription: (name: string) => string;
  groupPermissionsTitle: string;
  groupPermissionsDescription: string;
  groupGrant: string;
  groupResource: string;
  groupAction: string;
  groupPermissionsEmpty: string;
  groupRemovePermissionTitle: string;
  /** `resource` and `action` identify the grant being revoked. */
  groupRemovePermissionDescription: (resource: string, action: string) => string;
  groupValidationResourceRequired: string;
  groupValidationActionRequired: string;
  /** Fallback shown when a write fails without a message. */
  groupActionFailed: string;
  /** 1-based record summary, e.g. `6 groups`. */
  groupRecordCount: (total: number) => string;
}

/**
 * Host-owned transport for permission groups and their grant sets. The module
 * never imports the host's fetch client, router or query keys; errors surface
 * through `onError`.
 */
export interface IamPermissionGroupsPort {
  listGroups(): Promise<IamPermissionGroup[]>;
  /** One group with every grant attached to it. */
  getGroup(groupId: number): Promise<IamPermissionGroupDetail>;
  /** Resource names the backend accepts for a grant. */
  listResources(): Promise<string[]>;
  /** Action names the backend accepts for a grant. */
  listActions(): Promise<string[]>;
  createGroup(input: IamPermissionGroupInput): Promise<void>;
  updateGroup(groupId: number, input: IamPermissionGroupInput): Promise<void>;
  deleteGroup(groupId: number): Promise<void>;
  /** Replaces the header navigation order; index 0 becomes navOrder 1. */
  reorderGroups(ids: number[]): Promise<void>;
  /** Replaces the whole grant set so the backend stays transactional. */
  replaceGroupPermissions(groupId: number, permissions: IamGroupPermissionInput[]): Promise<void>;
}

export interface IamPermissionGroupsProps {
  labels: IamPermissionGroupsLabels;
  port: IamPermissionGroupsPort;
  /** Section tabs the host wants above the table. */
  tabs?: readonly SectionTabItem[];
  /** Opens a group's grant editor; without it the manage action is hidden. */
  onOpenGroup?: (groupId: number) => void;
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Called after a write succeeds, so the host owns the toast copy. */
  onSuccess?: (action: IamPermissionGroupAction) => void;
}

export interface IamPermissionGroupDetailProps {
  labels: IamPermissionGroupsLabels;
  port: IamPermissionGroupsPort;
  groupId: number;
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Called after a write succeeds, so the host owns the toast copy. */
  onSuccess?: (action: IamPermissionGroupAction) => void;
}
