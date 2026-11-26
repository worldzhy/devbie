"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useConfirm } from "@/fewbie/framework/feedback/confirm-dialog";
import PageShell from "@/fewbie/framework/page/page-shell";
import SectionTabs from "@/fewbie/framework/page/section-tabs";
import { Button } from "@/fewbie/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";
import { PaginationBar } from "@/fewbie/modules/console-kit/components/pagination-bar";
import { TableShell, type TableShellState } from "@/fewbie/modules/console-kit/components/table-shell";

import { DEFAULT_IAM_PAGE_SIZE, iamKeys, normalizePermissionQuery } from "../../lib/iam-query";
import type { IamPermission, IamPermissionInput } from "../../lib/iam-types";
import { CreatePermissionDialog } from "./create-permission-dialog";
import { PermissionsTable } from "./permissions-table";
import type { IamPermissionsProps } from "./types";

/** Select sentinel for "no resource filter"; Radix forbids the empty string. */
const RESOURCE_ALL = "ALL";

/**
 * The global grant ledger: every (resource, action) granted to a role or a
 * trusted user, with a resource filter, server-side paging, grant and revoke.
 */
export function IamPermissionsPage(props: IamPermissionsProps) {
  const { labels, port, tabs, initialQuery, onQueryChange, onError, onSuccess, formatDateTime } = props;
  const pageSize = props.pageSize ?? DEFAULT_IAM_PAGE_SIZE;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [query, setQuery] = useState(() => normalizePermissionQuery(initialQuery, pageSize));
  const [creating, setCreating] = useState(false);

  const permissionsQuery = useQuery({
    queryKey: iamKeys.permissions.list(query),
    queryFn: () => port.listPermissions(query),
    placeholderData: keepPreviousData,
  });
  const rolesQuery = useQuery({ queryKey: iamKeys.roles.all, queryFn: () => port.listRoles() });
  const resourcesQuery = useQuery({
    queryKey: iamKeys.permissions.resources,
    queryFn: () => port.listResources(),
  });
  const actionsQuery = useQuery({ queryKey: iamKeys.permissions.actions, queryFn: () => port.listActions() });

  const callbacks = useRef({ onQueryChange, onError });
  useEffect(() => {
    callbacks.current = { onQueryChange, onError };
  });

  useEffect(() => {
    callbacks.current.onQueryChange?.(query);
  }, [query]);

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (permissionsQuery.error != null && permissionsQuery.error !== reportedError.current) {
      reportedError.current = permissionsQuery.error;
      callbacks.current.onError?.(permissionsQuery.error);
    }
  }, [permissionsQuery.error]);

  const invalidatePermissions = () => queryClient.invalidateQueries({ queryKey: iamKeys.permissions.all });

  const createPermission = async (input: IamPermissionInput) => {
    try {
      await port.createPermission(input);
      await invalidatePermissions();
      onSuccess?.("created");
    } catch (error) {
      callbacks.current.onError?.(error);
      throw error;
    }
  };

  const deletePermission = (permission: IamPermission) => {
    void confirm({
      title: labels.permDeleteTitle,
      description: labels.permDeleteDescription(permission.resource, permission.action),
      destructive: true,
      confirmationText: labels.permDelete,
      cancellationText: labels.permCancel,
    })
      .then(async () => {
        try {
          await port.deletePermission(permission.id);
          await invalidatePermissions();
          onSuccess?.("deleted");
        } catch (error) {
          callbacks.current.onError?.(error);
        }
      })
      .catch(() => {});
  };

  const permissions = permissionsQuery.data?.records ?? [];
  const total = permissionsQuery.data?.total ?? 0;
  const roles = rolesQuery.data ?? [];
  const state: TableShellState = permissionsQuery.isPending
    ? "loading"
    : permissionsQuery.isError
      ? "error"
      : permissions.length === 0
        ? "empty"
        : "ready";
  const errorMessage = permissionsQuery.error instanceof Error ? permissionsQuery.error.message : undefined;

  return (
    <PageShell title={labels.permTitle} subtitle={labels.permSubtitle}>
      {tabs && tabs.length > 0 ? <SectionTabs items={tabs} className="mb-4" /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={query.resource ?? RESOURCE_ALL}
          onValueChange={(value) =>
            setQuery((current) => ({
              ...current,
              resource: value === RESOURCE_ALL ? undefined : value,
              page: 0,
            }))
          }
        >
          <SelectTrigger aria-label={labels.permResourceFilter} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RESOURCE_ALL}>{labels.permAllResources}</SelectItem>
            {(resourcesQuery.data ?? []).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {labels.permCreate}
          </Button>
        </div>
      </div>

      <TableShell
        state={state}
        labels={{
          loading: labels.permLoading,
          emptyTitle: labels.permEmptyTitle,
          emptyDescription: labels.permEmptyDescription,
          errorTitle: labels.permErrorTitle,
          retry: labels.permRetry,
        }}
        errorMessage={errorMessage}
        onRetry={() => void permissionsQuery.refetch()}
      >
        <PermissionsTable
          labels={labels}
          permissions={permissions}
          roles={roles}
          formatDateTime={formatDateTime}
          onDelete={deletePermission}
        />
      </TableShell>

      <PaginationBar
        page={query.page}
        pageSize={query.pageSize}
        total={total}
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        labels={{
          previous: labels.permPrevious,
          next: labels.permNext,
          pageOf: labels.permPageOf,
          recordCount: labels.permRecordCount,
        }}
      />

      {creating ? (
        <CreatePermissionDialog
          labels={labels}
          roles={roles}
          resources={resourcesQuery.data ?? []}
          actions={actionsQuery.data ?? []}
          onClose={() => setCreating(false)}
          onSubmit={createPermission}
        />
      ) : null}
    </PageShell>
  );
}
