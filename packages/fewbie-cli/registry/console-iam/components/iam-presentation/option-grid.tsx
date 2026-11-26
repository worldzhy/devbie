"use client";

import { Check } from "lucide-react";

import { Button } from "@/fewbie/ui/button";

/** One toggleable option; `hint` becomes the button tooltip text. */
export interface OptionGridItem {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Pill grid for multi-select options (roles, permission groups). Buttons keep
 * the atom surface small — no checkbox primitive — while `aria-pressed` still
 * exposes the selected state to assistive technology.
 */
export function OptionGrid({
  items,
  selected,
  onToggle,
  disabled,
  emptyLabel,
}: {
  items: OptionGridItem[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  emptyLabel: string;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
      {items.map((item) => {
        const active = selected.includes(item.id);
        return (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            title={item.hint}
            disabled={disabled}
            onClick={() => onToggle(item.id)}
          >
            {active ? <Check className="size-3" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
