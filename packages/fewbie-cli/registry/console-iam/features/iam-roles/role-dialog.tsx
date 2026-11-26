"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";

import { OptionGrid } from "../../components/iam-presentation/option-grid";
import { iamKeys } from "../../lib/iam-query";
import type { IamRole } from "../../lib/iam-types";
import type { IamRoleAction, IamRolesLabels, IamRolesPort } from "./types";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface RoleDialogProps {
  labels: IamRolesLabels;
  port: IamRolesPort;
  /** `null` creates a role; a row edits it. */
  role?: IamRole | null;
  onClose: () => void;
  onSaved: (action: IamRoleAction) => void;
  onError?: (error: unknown) => void;
}

/**
 * Role editor: name and description, plus the permission groups the role
 * grants. Builtin roles show their bindings read-only — the backend seed owns
 * them (ADR-044) — and cannot be renamed or deleted.
 */
export function RoleDialog({ labels, port, role, onClose, onSaved, onError }: RoleDialogProps) {
  const isEdit = Boolean(role);
  const isBuiltin = role?.isBuiltin ?? false;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupsTouched, setGroupsTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [groupsPending, setGroupsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: iamKeys.roles.detail(role?.id ?? 0),
    queryFn: () => port.getRole(role!.id),
    enabled: isEdit,
  });

  const groupsQuery = useQuery({
    queryKey: iamKeys.permissionGroups.all,
    queryFn: () => port.listPermissionGroups(),
    enabled: isEdit && !isBuiltin,
  });

  const detail = detailQuery.data;
  const [seededDetailId, setSeededDetailId] = useState<number | null>(null);
  if (detail && seededDetailId !== detail.id) {
    setSeededDetailId(detail.id);
    setSelectedGroupIds((detail.permissionGroups ?? []).map((group) => String(group.id)));
    setGroupsTouched(false);
  }

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
    );
    setGroupsTouched(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(labels.rolesValidationNameRequired);
      return;
    }
    const input = { name: name.trim(), description: description.trim() || undefined };

    setPending(true);
    setError(null);
    try {
      if (role) {
        // A builtin role keeps its seeded name; the field is read-only anyway.
        await port.updateRole(role.id, { ...input, name: role.isBuiltin ? role.name : input.name });
        onSaved("roleUpdated");
      } else {
        await port.createRole(input);
        onSaved("roleCreated");
      }
      onClose();
    } catch (failure) {
      setError(messageOf(failure, labels.rolesActionFailed));
      onError?.(failure);
    } finally {
      setPending(false);
    }
  };

  const saveGroups = async () => {
    if (!role) return;
    setGroupsPending(true);
    setError(null);
    try {
      await port.replaceRoleGroups(
        role.id,
        selectedGroupIds.map((id) => Number(id)),
      );
      setGroupsTouched(false);
      onSaved("roleGroupsUpdated");
    } catch (failure) {
      setError(messageOf(failure, labels.rolesActionFailed));
      onError?.(failure);
    } finally {
      setGroupsPending(false);
    }
  };

  const boundGroups = detail?.permissionGroups ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && !groupsPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? labels.rolesEditTitle(role?.name ?? "") : labels.rolesCreateTitle}</DialogTitle>
          {isBuiltin ? <DialogDescription>{labels.rolesBuiltinHint}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="iam-role-name">{labels.rolesName}</Label>
            <Input
              id="iam-role-name"
              value={name}
              placeholder={labels.rolesNamePlaceholder}
              disabled={pending || isBuiltin}
              onChange={(event) => setName(event.target.value)}
            />
            {isBuiltin ? <p className="text-xs text-muted-foreground">{labels.rolesBuiltinNoRename}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="iam-role-description">{labels.rolesDescription}</Label>
            <Input
              id="iam-role-description"
              value={description}
              placeholder={labels.rolesDescriptionPlaceholder}
              disabled={pending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {isEdit ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{labels.rolesPermissionGroups}</p>
                  <p className="text-xs text-muted-foreground">{labels.rolesPermissionGroupsHint}</p>
                </div>
                {!isBuiltin && groupsTouched ? (
                  <Button type="button" size="sm" onClick={saveGroups} disabled={groupsPending || pending}>
                    {groupsPending ? <LoaderCircle className="mr-1 size-3.5 animate-spin" /> : null}
                    {labels.rolesSaveGroups}
                  </Button>
                ) : null}
              </div>

              {detailQuery.isPending ? (
                <p className="text-xs text-muted-foreground">{labels.rolesLoading}</p>
              ) : detailQuery.isError ? (
                <p className="text-xs text-destructive">{labels.rolesGroupsLoadError}</p>
              ) : isBuiltin ? (
                boundGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{labels.rolesNoGroupsBound}</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {boundGroups.map((group) => (
                      <Badge key={group.id} variant="outline" title={group.routePath}>
                        {group.name}
                      </Badge>
                    ))}
                  </div>
                )
              ) : (
                <OptionGrid
                  items={(groupsQuery.data ?? []).map((group) => ({
                    id: String(group.id),
                    label: group.name,
                    hint: `${group.navLabel} · ${group.routePath}`,
                  }))}
                  selected={selectedGroupIds}
                  onToggle={toggleGroup}
                  disabled={groupsPending || pending}
                  emptyLabel={labels.rolesNoGroups}
                />
              )}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending || groupsPending}>
              {labels.rolesCancel}
            </Button>
            <Button type="submit" disabled={pending || groupsPending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isEdit ? labels.rolesSave : labels.rolesCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
