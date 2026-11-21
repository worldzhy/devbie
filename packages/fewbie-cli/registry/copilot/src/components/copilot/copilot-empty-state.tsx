"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { interpolate, skillDisplayName, useCopilotRuntime } from "./copilot-context";
import type { CopilotSkillsCatalog } from "./types";

export interface CopilotEmptyStateProps {
  catalog: CopilotSkillsCatalog | undefined;
  isLoading: boolean;
  /** Host-specific card rendered above the capability list. */
  extra?: ReactNode;
}

export function CopilotEmptyState({ catalog, isLoading, extra }: CopilotEmptyStateProps) {
  const { labels } = useCopilotRuntime();
  const relevant = catalog?.skills.filter((skill) => skill.relevant) ?? [];
  const others = catalog?.skills.filter((skill) => !skill.relevant) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {extra}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">{labels.emptyIntro}</p>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">{labels.loadingCapabilities}</p> : null}

      <SkillSection title={labels.availableOnPage} skills={relevant} collapsible defaultOpen />
      <SkillSection title={labels.otherCapabilities} skills={others} collapsible />
    </div>
  );
}

function SkillSection({
  title,
  skills,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string;
  skills: CopilotSkillsCatalog["skills"];
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const { labels } = useCopilotRuntime();
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  if (skills.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1 text-left text-xs font-semibold text-foreground"
        >
          <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          {title}
          <span className="font-normal text-muted-foreground">
            {"("}
            {skills.length}
            {")"}
          </span>
        </button>
      ) : (
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      )}
      {open ? (
        <ul className="flex flex-col gap-1.5">
          {skills.map((skill) => (
            <li key={skill.name} className="rounded-md border border-border px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{skillDisplayName(skill.name)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={interpolate(labels.aboutSkill, { name: skillDisplayName(skill.name) })}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-64">
                    {skill.description}
                  </TooltipContent>
                </Tooltip>
                <Badge variant="secondary" className="ml-auto text-[10px] capitalize">
                  {skill.resultHint.kind}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
