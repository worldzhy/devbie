"use client";

import { ArrowRight, LoaderCircle, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { SettingsRequiredStateProps } from "./types";

/**
 * Unified "required settings are missing" state. Feature modules render this
 * when their backing configuration has not been set up yet, so the
 * empty-state visuals and the settings entry point stay consistent.
 */
export function SettingsRequiredState({
  labels,
  title,
  description,
  settingsHref,
  onOpenSettings,
  onAction,
  actionPending = false,
  icon,
  fullHeight = false,
  className,
}: SettingsRequiredStateProps) {
  return (
    <div className={cn("flex w-full items-center justify-center", fullHeight ? "h-full" : "py-8 md:py-16", className)}>
      <Card className="w-full max-w-xl text-center">
        <CardContent className="flex flex-col items-center px-6 py-10 md:px-12">
          {/* Tinted icon badge */}
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon ?? <Settings2 className="size-8" />}
          </div>

          <h2 className="text-lg font-semibold text-foreground">{title}</h2>

          {description ? <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">{description}</p> : null}

          {onAction ? (
            <Button className="mt-6" onClick={onAction} disabled={actionPending}>
              {actionPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {labels.actionLabel}
            </Button>
          ) : settingsHref && onOpenSettings ? (
            <Button className="mt-6" onClick={() => onOpenSettings(settingsHref)}>
              {labels.actionLabel}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
