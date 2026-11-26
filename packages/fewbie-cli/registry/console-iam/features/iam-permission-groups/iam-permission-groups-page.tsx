"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useConfirm } from "@/fewbie/framework/feedback/confirm-dialog";
import PageShell from "@/fewbie/framework/page/page-shell";
import SectionTabs from "@/fewbie/framework/page/section-tabs";
import { Button } from "@/fewbie/ui/button";
import { TableShell, type TableShellState } from "@/fewbie/modules/console-kit/components/table-shell";

import { iamKeys } from "../../lib/iam-query";
import type { IamPermissionGroup, IamPermissionGroupInput } from "../../lib/iam-types";
import { GroupDialog } from "./group-dialog";
import { GroupsTable } from "./groups-table";
import type { IamPermissionGroupsProps } from "./types";

/**
 * Permission-group list: CRUD, header navigation order (up/down) and the handle
 * that opens a group's grant editor. Group writes also refresh role details,
 * which embed the group summaries a role is bound to.
 */
export function IamPermissionGroupsPage(props: IamPermissionGroupsProps) {
  const { labels, port, tabs, onOpenGroup, onError, onSuccess } = props;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IamPermissionGroup | null>(null);

  const groupsQuery = useQuery({ queryKey: iamKeys.permissionGroups.all, queryFn: () => port.listGroups() });

  const callbacks = useRef({ onError });
  useEffect(() => {
    callbacks.current = { onError };
  });

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (groupsQuery.error != null && groupsQuery.error !== reportedError.current) {
      reportedError.current = groupsQuery.error;
      callbacks.current.onError?.(groupsQuery.error);
    }
  }, [groupsQuery.error]);

  const invalidateGroups = async () => {
    await queryClient.invalidateQueries({ queryKey: iamKeys.permissionGroups.all });
    await queryClient.invalidateQueries({ queryKey: iamKeys.roles.all });
  };

  const saveGroup = async (input: IamPermissionGroupInput) => {
    try {
      if (editing) {
        await port.updateGroup(editing.id, input);
        await invalidateGroups();
        onSuccess?.("groupUpdated");
      } else {
        await port.createGroup(input);
        await invalidateGroups();
        onSuccess?.("groupCreated");
      }
    } catch (error) {
      callbacks.current.onError?.(error);
      throw error;
    }
  };

  const reorder = async (ids: number[]) => {
    try {
      await port.reorderGroups(ids);
      await invalidateGroups();
      onSuccess?.("groupsReordered");
    } catch (error) {
      callbacks.current.onError?.(error);
    }
  };

  const deleteGroup = (group: IamPermissionGroup) => {
    void confirm({
      title: labels.groupDeleteTitle,
      description: labels.groupDeleteDescription(group.name),
      destructive: true,
      confirmationText: labels.groupDelete,
      cancellationText: labels.groupCancel,
    })
      .then(async () => {
        try {
          await port.deleteGroup(group.id);
          await invalidateGroups();
          onSuccess?.("groupDeleted");
        } catch (error) {
          callbacks.current.onError?.(error);
        }
      })
      .catch(() => {});
  };

  const groups = groupsQuery.data ?? [];
  const state: TableShellState = groupsQuery.isPending
    ? "loading"
    : groupsQuery.isError
      ? "error"
      : groups.length === 0
        ? "empty"
        : "ready";
  const errorMessage = groupsQuery.error instanceof Error ? groupsQuery.error.message : undefined;

  return (
    <PageShell title={labels.groupTitle} subtitle={labels.groupSubtitle}>
      {tabs && tabs.length > 0 ? <SectionTabs items={tabs} className="mb-4" /> : null}

      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {labels.groupCreate}
        </Button>
      </div>

      <TableShell
        state={state}
        labels={{
          loading: labels.groupLoading,
          emptyTitle: labels.groupEmptyTitle,
          emptyDescription: labels.groupEmptyDescription,
          errorTitle: labels.groupErrorTitle,
          retry: labels.groupRetry,
        }}
        errorMessage={errorMessage}
        onRetry={() => void groupsQuery.refetch()}
      >
        <GroupsTable
          labels={labels}
          groups={groups}
          onReorder={(ids) => void reorder(ids)}
          onManage={onOpenGroup}
          onEdit={(group) => setEditing(group)}
          onDelete={deleteGroup}
        />
      </TableShell>

      <p className="mt-4 text-xs text-muted-foreground">{labels.groupRecordCount(groups.length)}</p>

      {creating ? <GroupDialog labels={labels} onClose={() => setCreating(false)} onSubmit={saveGroup} /> : null}
      {editing ? (
        <GroupDialog
          key={editing.id}
          labels={labels}
          group={editing}
          onClose={() => setEditing(null)}
          onSubmit={saveGroup}
        />
      ) : null}
    </PageShell>
  );
}
