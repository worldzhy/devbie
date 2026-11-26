"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";

import type { IamPermissionAction, IamPermissionInput, IamRole } from "../../lib/iam-types";
import type { IamPermissionsLabels } from "./types";

/** Select sentinel for "no role"; Radix forbids the empty string. */
const ROLE_NONE = "NONE";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface CreatePermissionDialogProps {
  labels: IamPermissionsLabels;
  roles: IamRole[];
  resources: string[];
  actions: string[];
  onClose: () => void;
  /** Performs the write; rejects so the dialog can show the failure inline. */
  onSubmit: (input: IamPermissionInput) => Promise<void>;
}

/**
 * Grant one (resource, action) pair to a role or directly to a trusted user.
 * Exactly one target is required, mirroring the backend's scoping rule.
 */
export function CreatePermissionDialog({
  labels,
  roles,
  resources,
  actions,
  onClose,
  onSubmit,
}: CreatePermissionDialogProps) {
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [roleId, setRoleId] = useState(ROLE_NONE);
  const [trustedUserId, setTrustedUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resource) {
      setError(labels.permValidationResourceRequired);
      return;
    }
    if (!action) {
      setError(labels.permValidationActionRequired);
      return;
    }
    const trusted = trustedUserId.trim();
    if (roleId === ROLE_NONE && !trusted) {
      setError(labels.permValidationTargetRequired);
      return;
    }

    const input: IamPermissionInput = {
      resource,
      action: action as IamPermissionAction,
      roleId: roleId === ROLE_NONE ? undefined : Number(roleId),
      trustedUserId: trusted || undefined,
    };

    setPending(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (failure) {
      setError(messageOf(failure, labels.permActionFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.permCreateTitle}</DialogTitle>
          <DialogDescription>{labels.permCreateDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="iam-permission-resource">{labels.permResource}</Label>
            <Select value={resource} onValueChange={setResource}>
              <SelectTrigger id="iam-permission-resource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resources.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iam-permission-action">{labels.permAction}</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger id="iam-permission-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {actions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iam-permission-role">{labels.permRole}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="iam-permission-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_NONE}>{labels.permRolePlaceholder}</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iam-permission-trusted-user">{labels.permTrustedUserId}</Label>
            <Input
              id="iam-permission-trusted-user"
              value={trustedUserId}
              onChange={(event) => setTrustedUserId(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{labels.permTrustedUserHint}</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {labels.permCancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {labels.permCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
