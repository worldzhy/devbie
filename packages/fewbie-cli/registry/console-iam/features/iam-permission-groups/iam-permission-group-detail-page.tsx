"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { useConfirm } from "@/fewbie/framework/feedback/confirm-dialog";
import PageShell from "@/fewbie/framework/page/page-shell";
import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";
import { TableShell, type TableShellState } from "@/fewbie/modules/console-kit/components/table-shell";

import { iamKeys } from "../../lib/iam-query";
import type { IamGroupPermission, IamGroupPermissionInput, IamPermissionAction } from "../../lib/iam-types";
import type { IamPermissionGroupDetailProps } from "./types";

/**
 * One permission group's grant set. The backend replaces the whole set
 * transactionally, so granting and revoking both submit the desired final list.
 */
export function IamPermissionGroupDetailPage(props: IamPermissionGroupDetailProps) {
  const { labels, port, groupId, onError, onSuccess } = props;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupQuery = useQuery({
    queryKey: iamKeys.permissionGroups.detail(groupId),
    queryFn: () => port.getGroup(groupId),
  });
  const resourcesQuery = useQuery({
    queryKey: iamKeys.permissions.resources,
    queryFn: () => port.listResources(),
  });
  const actionsQuery = useQuery({ queryKey: iamKeys.permissions.actions, queryFn: () => port.listActions() });

  const callbacks = useRef({ onError });
  useEffect(() => {
    callbacks.current = { onError };
  });

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (groupQuery.error != null && groupQuery.error !== reportedError.current) {
      reportedError.current = groupQuery.error;
      callbacks.current.onError?.(groupQuery.error);
    }
  }, [groupQuery.error]);

  const invalidateGroup = async () => {
    await queryClient.invalidateQueries({ queryKey: iamKeys.permissionGroups.all });
    await queryClient.invalidateQueries({ queryKey: iamKeys.roles.all });
  };

  const replace = async (next: IamGroupPermissionInput[]) => {
    await port.replaceGroupPermissions(groupId, next);
    await invalidateGroup();
  };

  const grant = async () => {
    if (!resource) {
      setError(labels.groupValidationResourceRequired);
      return;
    }
    if (!action) {
      setError(labels.groupValidationActionRequired);
      return;
    }
    const current = (groupQuery.data?.permissions ?? []).map((permission) => ({
      resource: permission.resource,
      action: permission.action,
    }));
    setPending(true);
    setError(null);
    try {
      await replace([...current, { resource, action: action as IamPermissionAction }]);
      setResource("");
      setAction("");
      onSuccess?.("permissionGranted");
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : labels.groupActionFailed);
      callbacks.current.onError?.(failure);
    } finally {
      setPending(false);
    }
  };

  const revoke = (permission: IamGroupPermission) => {
    void confirm({
      title: labels.groupRemovePermissionTitle,
      description: labels.groupRemovePermissionDescription(permission.resource, permission.action),
      destructive: true,
      confirmationText: labels.groupDelete,
      cancellationText: labels.groupCancel,
    })
      .then(async () => {
        const next = (groupQuery.data?.permissions ?? [])
          .filter((item) => item.id !== permission.id)
          .map((item) => ({ resource: item.resource, action: item.action }));
        try {
          await replace(next);
          onSuccess?.("permissionRevoked");
        } catch (failure) {
          callbacks.current.onError?.(failure);
        }
      })
      .catch(() => {});
  };

  const group = groupQuery.data;
  const permissions = group?.permissions ?? [];
  const state: TableShellState = groupQuery.isPending
    ? "loading"
    : groupQuery.isError
      ? "error"
      : permissions.length === 0
        ? "empty"
        : "ready";
  const errorMessage = groupQuery.error instanceof Error ? groupQuery.error.message : undefined;
  const subtitle = group ? `${group.routePath}${group.description ? ` · ${group.description}` : ""}` : "";

  return (
    <PageShell title={group?.name ?? labels.groupLoading} subtitle={subtitle}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{labels.groupPermissionsTitle}</p>
          <p className="text-xs text-muted-foreground">{labels.groupPermissionsDescription}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="iam-grant-resource">{labels.groupResource}</Label>
            <Select value={resource} onValueChange={setResource}>
              <SelectTrigger id="iam-grant-resource" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(resourcesQuery.data ?? []).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iam-grant-action">{labels.groupAction}</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger id="iam-grant-action" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(actionsQuery.data ?? []).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" onClick={grant} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {labels.groupGrant}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <TableShell
          state={state}
          labels={{
            loading: labels.groupLoading,
            emptyTitle: labels.groupPermissionsEmpty,
            emptyDescription: "",
            errorTitle: labels.groupErrorTitle,
            retry: labels.groupRetry,
          }}
          errorMessage={errorMessage}
          onRetry={() => void groupQuery.refetch()}
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-medium">{labels.groupResource}</TableHead>
                <TableHead className="font-medium">{labels.groupAction}</TableHead>
                <TableHead className="text-right font-medium">{labels.groupDelete}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.map((permission) => (
                <TableRow key={permission.id}>
                  <TableCell className="font-mono text-xs text-foreground">{permission.resource}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{permission.action}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={labels.groupDelete}
                      title={labels.groupDelete}
                      onClick={() => revoke(permission)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </div>
    </PageShell>
  );
}
