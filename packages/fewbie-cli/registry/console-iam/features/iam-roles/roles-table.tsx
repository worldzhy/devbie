"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";

import type { IamRole } from "../../lib/iam-types";
import type { IamRolesLabels } from "./types";

interface RolesTableProps {
  labels: IamRolesLabels;
  roles: IamRole[];
  onEdit: (role: IamRole) => void;
  onDelete: (role: IamRole) => void;
}

/**
 * Ready-state table. The surrounding `TableShell` owns the border and the
 * non-ready states, so this renders only rows.
 */
export function RolesTable({ labels, roles, onEdit, onDelete }: RolesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-1/4 font-medium">{labels.rolesColName}</TableHead>
          <TableHead className="w-1/3 font-medium">{labels.rolesColDescription}</TableHead>
          <TableHead className="font-medium">{labels.rolesColUsers}</TableHead>
          <TableHead className="font-medium">{labels.rolesColType}</TableHead>
          <TableHead className="text-right font-medium">{labels.rolesColActions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow key={role.id}>
            <TableCell className="font-medium text-foreground">{role.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{role.description || "—"}</TableCell>
            <TableCell className="text-muted-foreground">{role.userCount}</TableCell>
            <TableCell>
              {role.isBuiltin ? (
                <Badge variant="outline">{labels.rolesBuiltin}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">{labels.rolesCustom}</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.rolesEdit}
                  title={labels.rolesEdit}
                  onClick={() => onEdit(role)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.rolesDelete}
                  title={role.isBuiltin ? labels.rolesBuiltinNoDelete : labels.rolesDelete}
                  disabled={role.isBuiltin}
                  onClick={() => onDelete(role)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
