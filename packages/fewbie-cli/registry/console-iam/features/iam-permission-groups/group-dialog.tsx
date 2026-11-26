"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";

import type { IamNavPlacement, IamPermissionGroup, IamPermissionGroupInput } from "../../lib/iam-types";
import type { IamPermissionGroupsLabels } from "./types";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface GroupDialogProps {
  labels: IamPermissionGroupsLabels;
  /** `null` creates a group; a row edits it. */
  group?: IamPermissionGroup | null;
  onClose: () => void;
  /** Performs the write; rejects so the dialog can show the failure inline. */
  onSubmit: (input: IamPermissionGroupInput) => Promise<void>;
}

/**
 * Create/edit form for one permission group: identity fields plus where it
 * appears in the console navigation.
 */
export function GroupDialog({ labels, group, onClose, onSubmit }: GroupDialogProps) {
  const isEdit = Boolean(group);

  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [routePath, setRoutePath] = useState(group?.routePath ?? "");
  const [navLabel, setNavLabel] = useState(group?.navLabel ?? "");
  const [navIcon, setNavIcon] = useState(group?.navIcon ?? "");
  const [navPlacement, setNavPlacement] = useState<IamNavPlacement>(group?.navPlacement ?? "HEADER_NAVIGATION");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(labels.groupValidationNameRequired);
      return;
    }
    if (!routePath.trim()) {
      setError(labels.groupValidationRouteRequired);
      return;
    }
    if (!navLabel.trim()) {
      setError(labels.groupValidationNavLabelRequired);
      return;
    }

    const input: IamPermissionGroupInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      routePath: routePath.trim(),
      navLabel: navLabel.trim(),
      navIcon: navIcon.trim() || undefined,
      navPlacement,
    };

    setPending(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (failure) {
      setError(messageOf(failure, labels.groupActionFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? labels.groupEditTitle : labels.groupCreateTitle}</DialogTitle>
          {group?.isBuiltin ? <DialogDescription>{labels.groupBuiltinHint}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="iam-group-name">{labels.groupName}</Label>
            <Input id="iam-group-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iam-group-description">{labels.groupDescription}</Label>
            <Input
              id="iam-group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="iam-group-route">{labels.groupRoutePath}</Label>
              <Input
                id="iam-group-route"
                value={routePath}
                placeholder={labels.groupRoutePathPlaceholder}
                onChange={(event) => setRoutePath(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-group-nav-label">{labels.groupNavLabel}</Label>
              <Input id="iam-group-nav-label" value={navLabel} onChange={(event) => setNavLabel(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="iam-group-nav-icon">{labels.groupNavIcon}</Label>
              <Input
                id="iam-group-nav-icon"
                value={navIcon}
                placeholder={labels.groupNavIconPlaceholder}
                onChange={(event) => setNavIcon(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-group-placement">{labels.groupNavPlacement}</Label>
              <Select value={navPlacement} onValueChange={(value) => setNavPlacement(value as IamNavPlacement)}>
                <SelectTrigger id="iam-group-placement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HEADER_NAVIGATION">{labels.groupPlacementHeader}</SelectItem>
                  <SelectItem value="NONE">{labels.groupPlacementNone}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {labels.groupCancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isEdit ? labels.groupSave : labels.groupCreateAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
