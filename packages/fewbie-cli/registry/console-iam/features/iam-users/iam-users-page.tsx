"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useConfirm } from "@/fewbie/framework/feedback/confirm-dialog";
import PageShell from "@/fewbie/framework/page/page-shell";
import SectionTabs from "@/fewbie/framework/page/section-tabs";
import { Button } from "@/fewbie/ui/button";
import { Input } from "@/fewbie/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";
import { PaginationBar } from "@/fewbie/modules/console-kit/components/pagination-bar";
import { TableShell, type TableShellState } from "@/fewbie/modules/console-kit/components/table-shell";

import { DEFAULT_IAM_PAGE_SIZE, iamKeys, normalizeUserQuery } from "../../lib/iam-query";
import { userDisplayName, type IamUser, type IamUserInput, type IamUserStatus } from "../../lib/iam-types";
import { ApproveUserDialog } from "./approve-user-dialog";
import type { IamUsersProps } from "./types";
import { UserDialog } from "./user-dialog";
import { UsersTable } from "./users-table";

/** Select sentinel for "no status filter"; Radix forbids the empty string. */
const STATUS_ALL = "ALL";
type StatusFilter = typeof STATUS_ALL | IamUserStatus;

function isStatus(value: string): value is IamUserStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "PENDING_APPROVAL";
}

/**
 * Account management: server-side search and pagination, role assignment,
 * the PENDING_APPROVAL queue (approve with roles, reject by delete) and
 * edit/delete. The host supplies copy, transport, the session's own id and
 * the toast callbacks.
 */
export function IamUsersPage(props: IamUsersProps) {
  const {
    labels,
    port,
    tabs,
    initialQuery,
    onQueryChange,
    onError,
    onSuccess,
    currentUserId,
    formatDateTime,
    renderUserExtra,
  } = props;
  const pageSize = props.pageSize ?? DEFAULT_IAM_PAGE_SIZE;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [query, setQuery] = useState(() => normalizeUserQuery(initialQuery, pageSize));
  const [nameDraft, setNameDraft] = useState(() => query.name ?? "");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IamUser | null>(null);
  const [approving, setApproving] = useState<IamUser | null>(null);

  const usersQuery = useQuery({
    queryKey: iamKeys.users.list(query),
    queryFn: () => port.listUsers(query),
    placeholderData: keepPreviousData,
  });
  const rolesQuery = useQuery({ queryKey: iamKeys.roles.all, queryFn: () => port.listRoles() });

  // The host may rebuild its callbacks on every render; only a new request or a
  // new error should reach them.
  const callbacks = useRef({ onQueryChange, onError });
  useEffect(() => {
    callbacks.current = { onQueryChange, onError };
  });

  useEffect(() => {
    callbacks.current.onQueryChange?.(query);
  }, [query]);

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (usersQuery.error != null && usersQuery.error !== reportedError.current) {
      reportedError.current = usersQuery.error;
      callbacks.current.onError?.(usersQuery.error);
    }
  }, [usersQuery.error]);

  // Typing should not fire one request per keystroke; the status select commits
  // immediately because it is a single deliberate choice.
  useEffect(() => {
    const next = nameDraft.trim();
    if (next === (query.name ?? "")) return;
    const timer = setTimeout(() => {
      setQuery((current) => ({ ...current, name: next || undefined, page: 0 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [nameDraft, query.name]);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: iamKeys.users.all });

  const saveUser = async (input: IamUserInput) => {
    try {
      if (editing) {
        await port.updateUser(editing.id, input);
        await invalidateUsers();
        onSuccess?.("updated");
      } else {
        await port.createUser(input);
        await invalidateUsers();
        onSuccess?.("created");
      }
    } catch (error) {
      callbacks.current.onError?.(error);
      throw error;
    }
  };

  const approveUser = async (roles: string[]) => {
    if (!approving) return;
    try {
      await port.approveUser(approving.id, roles);
      await invalidateUsers();
      onSuccess?.("approved");
    } catch (error) {
      callbacks.current.onError?.(error);
      throw error;
    }
  };

  const rejectUser = (user: IamUser) => {
    void confirm({
      title: labels.usersRejectTitle,
      description: labels.usersRejectDescription(userDisplayName(user)),
      destructive: true,
      confirmationText: labels.usersReject,
      cancellationText: labels.usersCancel,
    })
      .then(async () => {
        try {
          await port.deleteUser(user.id);
          await invalidateUsers();
          onSuccess?.("rejected");
        } catch (error) {
          callbacks.current.onError?.(error);
        }
      })
      .catch(() => {});
  };

  const deleteUser = (user: IamUser) => {
    void confirm({
      title: labels.usersDeleteTitle,
      description: labels.usersDeleteDescription(userDisplayName(user)),
      destructive: true,
      confirmationText: labels.usersDelete,
      cancellationText: labels.usersCancel,
    })
      .then(async () => {
        try {
          await port.deleteUser(user.id);
          await invalidateUsers();
          onSuccess?.("deleted");
        } catch (error) {
          callbacks.current.onError?.(error);
        }
      })
      .catch(() => {});
  };

  const users = usersQuery.data?.records ?? [];
  const total = usersQuery.data?.total ?? 0;
  const roles = rolesQuery.data ?? [];
  const state: TableShellState = usersQuery.isPending
    ? "loading"
    : usersQuery.isError
      ? "error"
      : users.length === 0
        ? "empty"
        : "ready";
  const errorMessage = usersQuery.error instanceof Error ? usersQuery.error.message : undefined;

  return (
    <PageShell title={labels.usersTitle} subtitle={labels.usersSubtitle}>
      {tabs && tabs.length > 0 ? <SectionTabs items={tabs} className="mb-4" /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder={labels.usersSearchPlaceholder}
          aria-label={labels.usersSearchPlaceholder}
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
        />
        <Select
          value={query.status ?? STATUS_ALL}
          onValueChange={(value) => {
            const status: StatusFilter = value === STATUS_ALL || isStatus(value) ? value : STATUS_ALL;
            setQuery((current) => ({
              ...current,
              status: status === STATUS_ALL ? undefined : status,
              page: 0,
            }));
          }}
        >
          <SelectTrigger aria-label={labels.usersStatusFilter} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>{labels.usersStatusAll}</SelectItem>
            <SelectItem value="ACTIVE">{labels.usersStatusActive}</SelectItem>
            <SelectItem value="INACTIVE">{labels.usersStatusInactive}</SelectItem>
            <SelectItem value="PENDING_APPROVAL">{labels.usersStatusPending}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {labels.usersCreate}
          </Button>
        </div>
      </div>

      <TableShell
        state={state}
        labels={{
          loading: labels.usersLoading,
          emptyTitle: labels.usersEmptyTitle,
          emptyDescription: labels.usersEmptyDescription,
          errorTitle: labels.usersErrorTitle,
          retry: labels.usersRetry,
        }}
        errorMessage={errorMessage}
        onRetry={() => void usersQuery.refetch()}
      >
        <UsersTable
          labels={labels}
          users={users}
          currentUserId={currentUserId}
          formatDateTime={formatDateTime}
          onEdit={(user) => setEditing(user)}
          onApprove={(user) => setApproving(user)}
          onReject={rejectUser}
          onDelete={deleteUser}
        />
      </TableShell>

      <PaginationBar
        page={query.page}
        pageSize={query.pageSize}
        total={total}
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        labels={{
          previous: labels.usersPrevious,
          next: labels.usersNext,
          pageOf: labels.usersPageOf,
          recordCount: labels.usersRecordCount,
        }}
      />

      {creating ? (
        <UserDialog labels={labels} roles={roles} onClose={() => setCreating(false)} onSubmit={saveUser} />
      ) : null}
      {editing ? (
        <UserDialog
          key={editing.id}
          labels={labels}
          roles={roles}
          user={editing}
          currentUserId={currentUserId}
          renderUserExtra={renderUserExtra}
          onClose={() => setEditing(null)}
          onSubmit={saveUser}
        />
      ) : null}
      {approving ? (
        <ApproveUserDialog
          key={approving.id}
          labels={labels}
          user={approving}
          roles={roles}
          onClose={() => setApproving(null)}
          onApprove={approveUser}
        />
      ) : null}
    </PageShell>
  );
}
