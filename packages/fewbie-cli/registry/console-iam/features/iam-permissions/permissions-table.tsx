"use client";

import { Trash2 } from "lucide-react";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";

import type { IamPermission, IamRole } from "../../lib/iam-types";
import type { IamPermissionsLabels } from "./types";

interface PermissionsTableProps {
  labels: IamPermissionsLabels;
  permissions: IamPermission[];
  roles: IamRole[];
  formatDateTime: (iso: string) => string;
  onDelete: (permission: IamPermission) => void;
}

/**
 * Ready-state table. The surrounding `TableShell` owns the border and the
 * non-ready states, so this renders only rows.
 */
export function PermissionsTable({ labels, permissions, roles, formatDateTime, onDelete }: PermissionsTableProps) {
  const roleName = (roleId?: number | null) =>
    roleId ? (roles.find((role) => role.id === roleId)?.name ?? `#${roleId}`) : null;

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-1/4 font-medium">{labels.permColResource}</TableHead>
          <TableHead className="font-medium">{labels.permColAction}</TableHead>
          <TableHead className="font-medium">{labels.permColScope}</TableHead>
          <TableHead className="font-medium">{labels.permColCreatedAt}</TableHead>
          <TableHead className="text-right font-medium">{labels.permColActions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {permissions.map((permission) => {
          const role = roleName(permission.roleId);
          return (
            <TableRow key={permission.id}>
              <TableCell className="font-mono text-xs text-foreground">{permission.resource}</TableCell>
              <TableCell>
                <Badge variant="secondary">{permission.action}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {role
                  ? labels.permGrantedToRole(role)
                  : permission.trustedUserId
                    ? labels.permGrantedToUser(permission.trustedUserId)
                    : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {permission.createdAt ? formatDateTime(permission.createdAt) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.permDelete}
                  title={labels.permDelete}
                  onClick={() => onDelete(permission)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
