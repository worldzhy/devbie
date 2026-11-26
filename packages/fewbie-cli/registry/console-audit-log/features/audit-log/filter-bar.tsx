"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/fewbie/ui/button";
import { Input } from "@/fewbie/ui/input";
import { Label } from "@/fewbie/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";

import type { AuditLogQuery } from "../../lib/audit-query";
import type { AuditLogLabels } from "./types";

type ResultFilter = "" | "success" | "failure";

interface FilterDraft {
  keyword: string;
  event: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId: string;
  result: ResultFilter;
  startTime: string;
  endTime: string;
}

function toDraft(query: AuditLogQuery): FilterDraft {
  return {
    keyword: query.keyword ?? "",
    event: query.event ?? "",
    action: query.action ?? "",
    resourceType: query.resourceType ?? "",
    resourceId: query.resourceId ?? "",
    actorId: query.actorId ?? "",
    result: query.result ?? "",
    startTime: query.startTime ?? "",
    endTime: query.endTime ?? "",
  };
}

const EMPTY_FILTERS: FilterDraft = {
  keyword: "",
  event: "",
  action: "",
  resourceType: "",
  resourceId: "",
  actorId: "",
  result: "",
  startTime: "",
  endTime: "",
};

interface FilterBarProps {
  labels: AuditLogLabels;
  /** The applied request; the draft re-seeds from it after apply or reset. */
  value: AuditLogQuery;
  onApply: (filters: Partial<AuditLogQuery>) => void;
  onReset: () => void;
}

/**
 * Controlled draft form: edits stay local until submitted, so typing never
 * refetches. Apply hands the whole draft to the host; reset clears it.
 */
export function FilterBar({ labels, value, onApply, onReset }: FilterBarProps) {
  const [draft, setDraft] = useState<FilterDraft>(() => toDraft(value));

  const reset = () => {
    setDraft(EMPTY_FILTERS);
    onReset();
  };

  const setField = <K extends keyof FilterDraft>(key: K, next: FilterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: next }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(draft);
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor="audit-keyword">{labels.filterKeyword}</Label>
        <Input
          id="audit-keyword"
          className="w-56"
          placeholder={labels.filterKeywordPlaceholder}
          value={draft.keyword}
          onChange={(event) => setField("keyword", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-event">{labels.filterEvent}</Label>
        <Input
          id="audit-event"
          className="w-44"
          placeholder={labels.filterEventPlaceholder}
          value={draft.event}
          onChange={(event) => setField("event", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-action">{labels.filterAction}</Label>
        <Input
          id="audit-action"
          className="w-36"
          placeholder={labels.filterActionPlaceholder}
          value={draft.action}
          onChange={(event) => setField("action", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-resource-type">{labels.filterResourceType}</Label>
        <Input
          id="audit-resource-type"
          className="w-40"
          placeholder={labels.filterResourceTypePlaceholder}
          value={draft.resourceType}
          onChange={(event) => setField("resourceType", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-resource-id">{labels.filterResourceId}</Label>
        <Input
          id="audit-resource-id"
          className="w-48"
          placeholder={labels.filterResourceIdPlaceholder}
          value={draft.resourceId}
          onChange={(event) => setField("resourceId", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-actor-id">{labels.filterActorId}</Label>
        <Input
          id="audit-actor-id"
          className="w-52"
          placeholder={labels.filterActorIdPlaceholder}
          value={draft.actorId}
          onChange={(event) => setField("actorId", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-result">{labels.filterResult}</Label>
        <Select value={draft.result} onValueChange={(next) => setField("result", next as ResultFilter)}>
          <SelectTrigger id="audit-result" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{labels.resultAll}</SelectItem>
            <SelectItem value="success">{labels.resultSuccess}</SelectItem>
            <SelectItem value="failure">{labels.resultFailure}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-start-time">{labels.filterStartTime}</Label>
        <Input
          id="audit-start-time"
          type="datetime-local"
          className="w-52"
          value={draft.startTime}
          onChange={(event) => setField("startTime", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-end-time">{labels.filterEndTime}</Label>
        <Input
          id="audit-end-time"
          type="datetime-local"
          className="w-52"
          value={draft.endTime}
          onChange={(event) => setField("endTime", event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          {labels.apply}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          {labels.reset}
        </Button>
      </div>
    </form>
  );
}
