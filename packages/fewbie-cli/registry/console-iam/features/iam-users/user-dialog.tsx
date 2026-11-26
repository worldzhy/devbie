"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";

import { OptionGrid } from "../../components/iam-presentation/option-grid";
import type { IamRole, IamUser, IamUserInput, IamUserStatus } from "../../lib/iam-types";
import type { IamUsersLabels } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_ALLOWED: readonly IamUserStatus[] = ["ACTIVE", "INACTIVE", "PENDING_APPROVAL"];

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface UserDialogProps {
  labels: IamUsersLabels;
  roles: IamRole[];
  /** `null` creates an account; a row edits it. */
  user?: IamUser | null;
  currentUserId?: string;
  renderUserExtra?: (user: IamUser) => ReactNode;
  onClose: () => void;
  /** Performs the write; rejects so the dialog can show the failure inline. */
  onSubmit: (input: IamUserInput) => Promise<void>;
}

/**
 * Create/edit form for one account. The module owns the fields and the client
 * validation; the host owns the transport and the post-write cache refresh.
 */
export function UserDialog({
  labels,
  roles,
  user,
  currentUserId,
  renderUserExtra,
  onClose,
  onSubmit,
}: UserDialogProps) {
  const isEdit = Boolean(user);
  const isSelf = Boolean(user && currentUserId !== undefined && user.id === currentUserId);
  const statusLocked = isSelf || user?.status === "PENDING_APPROVAL";

  const [name, setName] = useState(user?.name ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [middleName, setMiddleName] = useState(user?.middleName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<IamUserStatus>(user?.status ?? "ACTIVE");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user?.roles ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: string) =>
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(labels.usersValidationEmailRequired);
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError(labels.usersValidationEmailInvalid);
      return;
    }
    if (!name.trim() && !firstName.trim() && !lastName.trim()) {
      setError(labels.usersValidationNameRequired);
      return;
    }

    const input: IamUserInput = {
      name: name.trim() || undefined,
      firstName: firstName.trim() || undefined,
      middleName: middleName.trim() || (isEdit ? null : undefined),
      lastName: lastName.trim() || undefined,
      email: trimmedEmail,
      phone: phone.trim() || (isEdit ? null : undefined),
      roles: selectedRoles,
      status: STATUS_ALLOWED.includes(status) ? status : undefined,
    };
    // Only a create accepts a password; an edit leaves the stored one untouched.
    if (!isEdit && password) input.password = password;

    setPending(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (failure) {
      setError(messageOf(failure, labels.usersActionFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? labels.usersEditTitle : labels.usersCreateTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="iam-user-name">{labels.usersName}</Label>
              <Input id="iam-user-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-user-first-name">{labels.usersFirstName}</Label>
              <Input
                id="iam-user-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-user-middle-name">{labels.usersMiddleName}</Label>
              <Input
                id="iam-user-middle-name"
                value={middleName}
                onChange={(event) => setMiddleName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-user-last-name">{labels.usersLastName}</Label>
              <Input id="iam-user-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-user-email">{labels.usersEmail}</Label>
              <Input
                id="iam-user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iam-user-phone">{labels.usersPhone}</Label>
              <Input id="iam-user-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            {isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="iam-user-status">{labels.usersStatus}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as IamUserStatus)}
                  disabled={statusLocked || pending}
                >
                  <SelectTrigger id="iam-user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{labels.usersStatusActive}</SelectItem>
                    <SelectItem value="INACTIVE">{labels.usersStatusInactive}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="iam-user-password">{labels.usersPassword}</Label>
                <Input
                  id="iam-user-password"
                  type="password"
                  value={password}
                  placeholder={labels.usersPasswordHint}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}
          </div>

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
          </div>

          {isEdit && user && renderUserExtra ? renderUserExtra(user) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {labels.usersCancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isEdit ? labels.usersSave : labels.usersCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
