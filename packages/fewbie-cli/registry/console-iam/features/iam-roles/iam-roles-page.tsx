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
import type { IamRole } from "../../lib/iam-types";
import { RoleDialog } from "./role-dialog";
import { RolesTable } from "./roles-table";
import type { IamRoleAction, IamRolesProps } from "./types";

/**
 * Role management: one list (roles are few, so no server paging), CRUD and the
 * permission groups each role grants. Role writes also refresh the user list,
 * because a rename changes the role names shown on every account.
 */
export function IamRolesPage(props: IamRolesProps) {
  const { labels, port, tabs, onError, onSuccess } = props;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IamRole | null>(null);

  const rolesQuery = useQuery({ queryKey: iamKeys.roles.all, queryFn: () => port.listRoles() });

  const callbacks = useRef({ onError });
  useEffect(() => {
    callbacks.current = { onError };
  });

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (rolesQuery.error != null && rolesQuery.error !== reportedError.current) {
      reportedError.current = rolesQuery.error;
      callbacks.current.onError?.(rolesQuery.error);
    }
  }, [rolesQuery.error]);

  const invalidateRoles = async () => {
    await queryClient.invalidateQueries({ queryKey: iamKeys.roles.all });
    await queryClient.invalidateQueries({ queryKey: iamKeys.users.all });
  };

  const handleSaved = (action: IamRoleAction) => {
    // Saving bindings keeps the editor open so the checkbox grid stays in view;
    // creating, renaming or deleting a role ends the dialog.
    if (action !== "roleGroupsUpdated") {
      setCreating(false);
      setEditing(null);
    }
    void invalidateRoles();
    onSuccess?.(action);
  };

  const deleteRole = (role: IamRole) => {
    void confirm({
      title: labels.rolesDeleteTitle,
      description: labels.rolesDeleteDescription(role.name),
      destructive: true,
      confirmationText: labels.rolesDelete,
      cancellationText: labels.rolesCancel,
    })
      .then(async () => {
        try {
          await port.deleteRole(role.id);
          await invalidateRoles();
          onSuccess?.("roleDeleted");
        } catch (error) {
          callbacks.current.onError?.(error);
        }
      })
      .catch(() => {});
  };

  const roles = rolesQuery.data ?? [];
  const state: TableShellState = rolesQuery.isPending
    ? "loading"
    : rolesQuery.isError
      ? "error"
      : roles.length === 0
        ? "empty"
        : "ready";
  const errorMessage = rolesQuery.error instanceof Error ? rolesQuery.error.message : undefined;

  return (
    <PageShell title={labels.rolesTitle} subtitle={labels.rolesSubtitle}>
      {tabs && tabs.length > 0 ? <SectionTabs items={tabs} className="mb-4" /> : null}

      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {labels.rolesCreate}
        </Button>
      </div>

      <TableShell
        state={state}
        labels={{
          loading: labels.rolesLoading,
          emptyTitle: labels.rolesEmptyTitle,
          emptyDescription: labels.rolesEmptyDescription,
          errorTitle: labels.rolesErrorTitle,
          retry: labels.rolesRetry,
        }}
        errorMessage={errorMessage}
        onRetry={() => void rolesQuery.refetch()}
      >
        <RolesTable labels={labels} roles={roles} onEdit={(role) => setEditing(role)} onDelete={deleteRole} />
      </TableShell>

      <p className="mt-4 text-xs text-muted-foreground">{labels.rolesRecordCount(roles.length)}</p>

      {creating ? (
        <RoleDialog
          labels={labels}
          port={port}
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
          onError={onError}
        />
      ) : null}
      {editing ? (
        <RoleDialog
          key={editing.id}
          labels={labels}
          port={port}
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onError={onError}
        />
      ) : null}
    </PageShell>
  );
}
