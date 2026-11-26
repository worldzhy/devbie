"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";
import { Label } from "@/fewbie/ui/label";

import { OptionGrid } from "../../components/iam-presentation/option-grid";
import { userDisplayName, type IamRole, type IamUser } from "../../lib/iam-types";
import type { IamUsersLabels } from "./types";

/** Role preselected for a newly approved self-service account. */
const DEFAULT_ROLE = "MEMBER";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface ApproveUserDialogProps {
  labels: IamUsersLabels;
  user: IamUser;
  roles: IamRole[];
  onClose: () => void;
  onApprove: (roles: string[]) => Promise<void>;
}

/**
 * Accepts a PENDING_APPROVAL account in one step: flips the status to ACTIVE
 * and grants the roles picked here (defaults to MEMBER). Rejection is a delete
 * and stays on the table's action bar.
 */
export function ApproveUserDialog({ labels, user, roles, onClose, onApprove }: ApproveUserDialogProps) {
  const defaultRole = roles.some((role) => role.name === DEFAULT_ROLE) ? DEFAULT_ROLE : "";
  const [selectedRoles, setSelectedRoles] = useState<string[]>(defaultRole ? [defaultRole] : []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: string) =>
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  const noRoleSelected = roles.length > 0 && selectedRoles.length === 0;

  const submit = async () => {
    if (noRoleSelected) {
      setError(labels.usersValidationRolesRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onApprove(selectedRoles);
      onClose();
    } catch (failure) {
      setError(messageOf(failure, labels.usersActionFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.usersApproveTitle}</DialogTitle>
          <DialogDescription>{labels.usersApproveDescription(userDisplayName(user))}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>{labels.usersRoles}</Label>
          <OptionGrid
            items={roles.map((role) => ({
              id: role.name,
              label: role.name,
              hint: role.isBuiltin ? labels.usersBuiltin : undefined,
            }))}
            selected={selectedRoles}
            onToggle={toggleRole}
            disabled={pending}
            emptyLabel={labels.usersNoRoles}
          />
          <p className="text-xs text-muted-foreground">{labels.usersApproveRolesHint}</p>
          {noRoleSelected ? <p className="text-sm text-destructive">{labels.usersValidationRolesRequired}</p> : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {labels.usersCancel}
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {labels.usersApprove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
