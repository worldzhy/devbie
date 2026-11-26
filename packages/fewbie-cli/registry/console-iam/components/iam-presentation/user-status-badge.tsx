"use client";

import { Badge } from "@/fewbie/ui/badge";

import type { IamUserStatus } from "../../lib/iam-types";

const VARIANT: Record<IamUserStatus, "secondary" | "outline"> = {
  ACTIVE: "secondary",
  INACTIVE: "outline",
  PENDING_APPROVAL: "outline",
};

const CLASS_NAME: Record<IamUserStatus, string> = {
  ACTIVE: "",
  INACTIVE: "text-muted-foreground",
  PENDING_APPROVAL: "border-warning/50 text-warning",
};

/** Status pill shared by the user table; the host supplies the translated copy. */
export function UserStatusBadge({ status, label }: { status: IamUserStatus; label: string }) {
  return (
    <Badge variant={VARIANT[status]} className={CLASS_NAME[status]}>
      {label}
    </Badge>
  );
}
