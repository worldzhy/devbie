"use client";

import { CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/fewbie/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fewbie/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/fewbie/ui/tabs";
import {
  interpolate,
  NotificationDetailPanel,
  NotificationDetailSheet,
  NotificationPresentationProvider,
  NotificationPushFailures,
  resolveLocale,
  severityLabelKey,
  useNotificationPresentation,
  useOpenNotification,
  usePolled,
  type NotificationGroup,
  type NotificationPresentationConfig,
  type NotificationPushFailure,
} from "@/fewbie/modules/notification-center/components/notification-presentation";
import { formatDayLabel, groupNotifications } from "./grouping";
import { NotificationRow } from "./notification-row";
import { useIsDesktop } from "./use-is-desktop";
import type { NotificationCenterPage, NotificationCenterProps, NotificationCenterQuery } from "./types";

// Larger pages make duplicate-alert merging effective.
const DEFAULT_PAGE_SIZE = 50;
const SEVERITY_VALUES = ["all", "critical", "high", "medium", "low"] as const;

type UnreadFilter = "all" | "unread";

/**
 * Full notifications page body: filters, grouped list, pagination, detail pane
 * on desktop and the sheet on narrow screens. The host renders it below its own
 * page header and supplies transport, domain mapping and routing.
 */
export function NotificationCenter(props: NotificationCenterProps) {
  return (
    <NotificationPresentationProvider config={props.presentation}>
      <NotificationCenterBody {...props} />
    </NotificationPresentationProvider>
  );
}

interface NotificationCenterContentProps extends NotificationCenterProps {
  data: NotificationCenterPage | undefined;
  loading: boolean;
  failures: NotificationPushFailure[];
  pageSize: number;
  queryKey: string;
  filter: UnreadFilter;
  severityFilter: string;
  categoryFilter: string;
  projectFilter: string;
  page: number;
  onFilterChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onPageChange: (page: number) => void;
  reload: () => void;
}

function NotificationCenterBody(props: NotificationCenterProps) {
  const base = useNotificationPresentation();
  const pageSize = props.pageSize ?? DEFAULT_PAGE_SIZE;

  const [filter, setFilter] = useState<UnreadFilter>("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: NotificationCenterPage } | null>(null);
  const [nonce, setNonce] = useState(0);

  // The host may rebuild the port object on every render; only the request
  // identity and an explicit reload should refetch.
  const portRef = useRef(props.port);
  const onErrorRef = useRef(props.onError);
  useEffect(() => {
    portRef.current = props.port;
    onErrorRef.current = props.onError;
  });

  const categoryKeys = useMemo(() => {
    if (categoryFilter === "all") return undefined;
    const entry = props.categoryFilters.find((candidate) => candidate.value === categoryFilter);
    return entry ? [...entry.keys] : undefined;
  }, [categoryFilter, props.categoryFilters]);

  const query = useMemo<NotificationCenterQuery>(
    () => ({
      page,
      pageSize,
      unreadOnly: filter === "unread",
      ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
      ...(categoryKeys ? { notificationKeys: categoryKeys } : {}),
      ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
    }),
    [page, pageSize, filter, severityFilter, categoryKeys, projectFilter],
  );
  const queryKey = JSON.stringify(query);
  // A response is current only while it carries the request key it answered.
  const requestKey = `${queryKey}#${nonce}`;
  const data = result?.data;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let alive = true;
    portRef.current
      .fetchPage(query)
      .then((next) => {
        if (alive) setResult({ key: requestKey, data: next });
      })
      .catch((error) => {
        if (alive) setResult({ key: requestKey });
        onErrorRef.current?.(error);
      });
    return () => {
      alive = false;
    };
  }, [query, requestKey]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const failures = usePolled<NotificationPushFailure[]>(
    () => (portRef.current.fetchPushFailures ? portRef.current.fetchPushFailures() : Promise.resolve([])),
    props.pollIntervalMs ?? 60_000,
  );

  // Marking one record read from the shared sheet/panel also refreshes the page.
  const config = useMemo<NotificationPresentationConfig>(
    () => ({
      ...base,
      onMarkRead: async (id: string) => {
        await portRef.current.markRead([id]);
        reload();
      },
      loadDeliveryAttempt: (id: string) =>
        portRef.current.fetchDeliveryAttempt ? portRef.current.fetchDeliveryAttempt(id) : Promise.resolve(null),
      onError: props.onError,
    }),
    [base, reload, props.onError],
  );

  return (
    <NotificationPresentationProvider config={config}>
      <NotificationCenterContent
        {...props}
        data={data}
        loading={loading}
        failures={failures.data ?? []}
        pageSize={pageSize}
        queryKey={queryKey}
        filter={filter}
        severityFilter={severityFilter}
        categoryFilter={categoryFilter}
        projectFilter={projectFilter}
        page={page}
        onFilterChange={(value) => {
          setFilter(value as UnreadFilter);
          setPage(0);
        }}
        onSeverityChange={(value) => {
          setSeverityFilter(value);
          setPage(0);
        }}
        onCategoryChange={(value) => {
          setCategoryFilter(value);
          setPage(0);
        }}
        onProjectChange={(value) => {
          setProjectFilter(value);
          setPage(0);
        }}
        onPageChange={setPage}
        reload={reload}
      />
    </NotificationPresentationProvider>
  );
}

function NotificationCenterContent(props: NotificationCenterContentProps) {
  const { labels, presentation } = props;
  const { onOpenLink } = useNotificationPresentation();
  const locale = resolveLocale(presentation.locale);
  const isDesktop = useIsDesktop();
  const { openNotification, sheetProps } = useOpenNotification();

  const [selection, setSelection] = useState<{
    queryKey: string;
    key: string;
    snapshot: NotificationGroup;
  } | null>(null);
  const [pendingMarkAll, setPendingMarkAll] = useState(false);

  // A new page or filter drops the previous selection: the stored selection is
  // honoured only while it belongs to the current query.
  const selectionHere = selection?.queryKey === props.queryKey ? selection : null;
  const selectedKey = selectionHere?.key ?? null;
  const selectedSnapshot = selectionHere?.snapshot ?? null;

  const records = useMemo(() => props.data?.records ?? [], [props.data]);
  const total = props.data?.total ?? 0;
  const unreadCount = props.data?.unreadCount ?? 0;

  const dayGroups = useMemo(
    () => groupNotifications(records, presentation.resolveSource),
    [records, presentation.resolveSource],
  );
  const flatGroups = useMemo(() => dayGroups.flatMap((day) => day.groups), [dayGroups]);

  const selectedGroup = useMemo(() => {
    if (!isDesktop) {
      return null;
    }
    const found = flatGroups.find((group) => group.key === selectedKey);
    if (found) {
      return found;
    }
    if (selectedSnapshot && selectedSnapshot.key === selectedKey) {
      return selectedSnapshot;
    }
    return flatGroups[0] ?? null;
  }, [flatGroups, isDesktop, selectedKey, selectedSnapshot]);
  const selectedGroupKey = selectedGroup?.key ?? null;

  const { port, reload, onError, queryKey } = props;

  const markGroupRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      port
        .markRead(ids)
        .then(() => reload())
        .catch((error) => onError?.(error));
    },
    [port, reload, onError],
  );

  const selectGroup = useCallback(
    (group: NotificationGroup) => {
      setSelection({ queryKey, key: group.key, snapshot: group });
      if (group.unreadIds.length > 0) {
        markGroupRead(group.unreadIds);
      }
    },
    [markGroupRead, queryKey],
  );

  const handleRowSelect = (group: NotificationGroup) => {
    if (isDesktop) {
      selectGroup(group);
      return;
    }
    // Narrow screens keep the sheet; the hook marks the newest occurrence read, the rest are marked here.
    const others = group.unreadIds.filter((id) => id !== group.latest.id);
    if (others.length > 0) {
      markGroupRead(others);
    }
    void openNotification(group.latest, { forceSheet: true });
  };

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "j" && event.key !== "k") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) {
        return;
      }
      if (document.querySelector("[role='dialog'], [role='listbox']")) {
        return;
      }
      event.preventDefault();
      const index = flatGroups.findIndex((group) => group.key === selectedGroupKey);
      const next = flatGroups[index + (event.key === "j" ? 1 : -1)];
      if (next) {
        selectGroup(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flatGroups, isDesktop, selectGroup, selectedGroupKey]);

  useEffect(() => {
    document.querySelector("[data-notification-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [selectedGroupKey]);

  const markAllRead = () => {
    setPendingMarkAll(true);
    props.port
      .markAllRead()
      .then((marked) => {
        if (marked > 0) {
          props.onMarkedRead?.(marked);
        }
        props.reload();
      })
      .catch((error) => props.onError?.(error))
      .finally(() => setPendingMarkAll(false));
  };

  const pageCount = Math.max(1, Math.ceil(total / props.pageSize));

  return (
    <div className={`flex flex-col ${props.className ?? ""}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={props.filter} onValueChange={props.onFilterChange}>
          <TabsList>
            <TabsTrigger value="all">{labels.tabAll}</TabsTrigger>
            <TabsTrigger value="unread">
              {unreadCount > 0 ? interpolate(labels.tabUnreadWithCount, { count: unreadCount }) : labels.tabUnread}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={props.severityFilter} onValueChange={props.onSeverityChange}>
          <SelectTrigger className="h-8 w-36" aria-label={labels.ariaSeverity}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? labels.severityAll : presentation.labels[severityLabelKey(value)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={props.categoryFilter} onValueChange={props.onCategoryChange}>
          <SelectTrigger className="h-8 w-40" aria-label={labels.ariaCategory}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.allCategories}</SelectItem>
            {props.categoryFilters.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={props.projectFilter} onValueChange={props.onProjectChange}>
          <SelectTrigger className="h-8 w-44" aria-label={labels.ariaProject}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.allProjects}</SelectItem>
            {props.projectOptions.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="ml-auto"
          variant="outline"
          size="sm"
          disabled={unreadCount === 0 || pendingMarkAll}
          onClick={markAllRead}
        >
          <CheckCheck className="size-4" />
          {labels.markAllRead}
        </Button>
      </div>

      {props.failures.length > 0 ? <NotificationPushFailures failures={props.failures} /> : null}

      <div className="flex min-h-[420px] flex-1 overflow-hidden rounded-lg border bg-card">
        <div className="flex min-h-0 w-full flex-col lg:w-[380px] lg:shrink-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {props.loading && flatGroups.length === 0 ? (
              <div className="flex h-full items-center justify-center py-10 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : flatGroups.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                <ShieldAlert className="size-8" />
                <span className="text-sm">{labels.emptyFiltered}</span>
              </div>
            ) : (
              dayGroups.map((day) => (
                <div key={day.label}>
                  <div className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                    {day.label === "today"
                      ? labels.dayToday
                      : day.label === "yesterday"
                        ? labels.dayYesterday
                        : formatDayLabel(day.label, locale)}
                  </div>
                  {day.groups.map((group) => (
                    <NotificationRow
                      key={group.key}
                      group={group}
                      selected={isDesktop && group.key === selectedGroupKey}
                      onSelect={handleRowSelect}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            {total > props.pageSize ? (
              <>
                <span className="tabular-nums">
                  {props.page + 1} / {pageCount}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={labels.ariaPrevPage}
                    disabled={props.page === 0}
                    onClick={() => props.onPageChange(props.page - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={labels.ariaNextPage}
                    disabled={(props.page + 1) * props.pageSize >= total}
                    onClick={() => props.onPageChange(props.page + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </>
            ) : (
              <span className="tabular-nums">{interpolate(labels.totalNotifications, { count: total })}</span>
            )}
            <span className="hidden lg:inline">
              <kbd className="rounded border bg-muted px-1 font-mono">{"J"}</kbd>{" "}
              <kbd className="rounded border bg-muted px-1 font-mono">{"K"}</kbd> {labels.keyboardHint}
            </span>
          </div>
        </div>

        <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">
          <NotificationDetailPanel
            group={selectedGroup}
            onOpenLink={(notification) => {
              if (notification.link) onOpenLink?.(notification.link);
            }}
          />
        </div>
      </div>

      <NotificationDetailSheet {...sheetProps} />
    </div>
  );
}
