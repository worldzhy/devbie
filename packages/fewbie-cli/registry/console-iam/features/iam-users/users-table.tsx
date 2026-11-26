"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";

import { userDisplayName, type IamUser, type IamUserStatus } from "../../lib/iam-types";
import { UserStatusBadge } from "../../components/iam-presentation/user-status-badge";
import type { IamUsersLabels } from "./types";

function statusLabel(labels: IamUsersLabels, status: IamUserStatus): string {
  if (status === "PENDING_APPROVAL") return labels.usersStatusPending;
  if (status === "INACTIVE") return labels.usersStatusInactive;
  return labels.usersStatusActive;
}

function initialOf(user: IamUser): string {
  return userDisplayName(user).charAt(0).toUpperCase() || "U";
}

interface UsersTableProps {
  labels: IamUsersLabels;
  users: IamUser[];
  currentUserId?: string;
  formatDateTime: (iso: string) => string;
  onEdit: (user: IamUser) => void;
  onApprove: (user: IamUser) => void;
  onReject: (user: IamUser) => void;
  onDelete: (user: IamUser) => void;
}

/**
 * Ready-state table. The surrounding `TableShell` owns the border and the
 * non-ready states, so this renders only rows.
 */
export function UsersTable({
  labels,
  users,
  currentUserId,
  formatDateTime,
  onEdit,
  onApprove,
  onReject,
  onDelete,
}: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-1/3 font-medium">{labels.usersColUser}</TableHead>
          <TableHead className="font-medium">{labels.usersColRoles}</TableHead>
          <TableHead className="font-medium">{labels.usersColStatus}</TableHead>
          <TableHead className="font-medium">{labels.usersColLastLogin}</TableHead>
          <TableHead className="text-right font-medium">{labels.usersColActions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const pending = user.status === "PENDING_APPROVAL";
          const isSelf = currentUserId !== undefined && user.id === currentUserId;
          return (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {initialOf(user)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{userDisplayName(user)}</p>
                    {user.email && user.email !== userDisplayName(user) ? (
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {(user.roles ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">{labels.usersNoRoles}</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="outline">
                        {role}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <UserStatusBadge status={user.status} label={statusLabel(labels, user.status)} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {pending ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.usersApprove}
                        title={labels.usersApprove}
                        onClick={() => onApprove(user)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.usersReject}
                        title={labels.usersReject}
                        onClick={() => onReject(user)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.usersEdit}
                        title={labels.usersEdit}
                        onClick={() => onEdit(user)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.usersDelete}
                        title={isSelf ? labels.usersCannotDeleteSelf : labels.usersDelete}
                        disabled={isSelf}
                        onClick={() => onDelete(user)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
