"use client";

import { Bell } from "lucide-react";
import { Button } from "@/fewbie/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/fewbie/ui/tooltip";
import type { NotificationCenterShellLabels } from "./types";

/** Badge + tooltip that jumps to the full page; the item never imports a router. */
export function NotificationBell({
  labels,
  unreadCount,
  onOpen,
}: {
  labels: NotificationCenterShellLabels;
  unreadCount: number;
  onOpen: () => void;
}) {
  const label = unreadCount > 0 ? `${labels.bellLabel} (${unreadCount})` : labels.bellLabel;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 rounded-full"
          aria-label={label}
          onClick={onOpen}
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
