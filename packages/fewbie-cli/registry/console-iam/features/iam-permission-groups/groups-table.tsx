"use client";

import { ArrowDown, ArrowUp, Pencil, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";

import type { IamPermissionGroup } from "../../lib/iam-types";
import type { IamPermissionGroupsLabels } from "./types";

interface GroupsTableProps {
  labels: IamPermissionGroupsLabels;
  groups: IamPermissionGroup[];
  onReorder: (ids: number[]) => void;
  onManage?: (groupId: number) => void;
  onEdit: (group: IamPermissionGroup) => void;
  onDelete: (group: IamPermissionGroup) => void;
}

/**
 * Ready-state table. Header-visible groups get up/down controls that submit the
 * whole ordered id list, matching the backend's transactional reorder.
 */
export function GroupsTable({ labels, groups, onReorder, onManage, onEdit, onDelete }: GroupsTableProps) {
  const headerIds = groups.filter((group) => group.navPlacement === "HEADER_NAVIGATION").map((group) => group.id);

  const move = (group: IamPermissionGroup, direction: -1 | 1) => {
    const index = headerIds.indexOf(group.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= headerIds.length) return;
    const ids = [...headerIds];
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-1/5 font-medium">{labels.groupColName}</TableHead>
          <TableHead className="font-medium">{labels.groupColRoute}</TableHead>
          <TableHead className="font-medium">{labels.groupColNav}</TableHead>
          <TableHead className="font-medium">{labels.groupColType}</TableHead>
          <TableHead className="text-right font-medium">{labels.groupColActions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          const position = headerIds.indexOf(group.id);
          return (
            <TableRow key={group.id}>
              <TableCell>
                <p className="font-medium text-foreground">{group.name}</p>
                {group.description ? <p className="text-xs text-muted-foreground">{group.description}</p> : null}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{group.routePath}</TableCell>
              <TableCell className="text-sm">
                {group.navPlacement === "NONE" ? (
                  <span className="text-muted-foreground">{labels.groupPlacementNone}</span>
                ) : (
                  `${group.navLabel} · #${group.navOrder}`
                )}
              </TableCell>
              <TableCell>
                <Badge variant={group.isBuiltin ? "secondary" : "outline"}>
                  {group.isBuiltin ? labels.groupBuiltin : labels.groupCustom}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {position >= 0 ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.groupMoveUp}
                        title={labels.groupMoveUp}
                        disabled={position === 0}
                        onClick={() => move(group, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.groupMoveDown}
                        title={labels.groupMoveDown}
                        disabled={position === headerIds.length - 1}
                        onClick={() => move(group, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </>
                  ) : null}
                  {onManage ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={labels.groupManage}
                      title={labels.groupManage}
                      onClick={() => onManage(group.id)}
                    >
                      <Settings2 className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.groupEdit}
                    title={labels.groupEdit}
                    onClick={() => onEdit(group)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.groupDelete}
                    title={group.isBuiltin ? labels.groupBuiltinNoDelete : labels.groupDelete}
                    disabled={group.isBuiltin}
                    onClick={() => onDelete(group)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
