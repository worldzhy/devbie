"use client";

import { AlertTriangle, Bot, Lightbulb, RotateCcw, SendHorizontal, Settings, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/fewbie/ui/button";
import { Textarea } from "@/fewbie/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/fewbie/ui/tooltip";
import { CopilotEmptyState } from "./copilot-empty-state";
import { CopilotProvider, interpolate, useCopilotRuntime } from "./copilot-context";
import { CopilotTimeline } from "./copilot-timeline";
import type { CopilotDockProps, CopilotSkillsCatalog } from "./types";
import { useCopilotChat, type CopilotBanner } from "./use-copilot-chat";

const MIN_DEFAULT = 480;
const MAX_DEFAULT = 960;
const WIDTH_DEFAULT = 576;
const STORAGE_DEFAULT = "copilot-dock-width-v2";
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** Resizable chat dock. All transport, navigation and domain data enter as props. */
export function CopilotDock(props: CopilotDockProps) {
  const {
    labels,
    port,
    open,
    onClose,
    contextLabel,
    pageContext,
    catalogKey,
    settingsHref,
    canManageModels,
    modelBadge,
    renderChart,
    emptyStateExtra,
    onOpenLink,
    onNavigate,
    locale,
    className,
  } = props;
  const minWidth = props.minWidth ?? MIN_DEFAULT;
  const maxWidth = props.maxWidth ?? MAX_DEFAULT;
  const defaultWidth = props.defaultWidth ?? WIDTH_DEFAULT;
  const storageKey = props.storageKey ?? STORAGE_DEFAULT;
  const resolvedLocale = locale ?? (typeof navigator === "undefined" ? "en" : navigator.language);

  const clamp = useCallback((value: number) => Math.min(maxWidth, Math.max(minWidth, value)), [minWidth, maxWidth]);

  const [draft, setDraft] = useState("");
  const [width, setWidth] = useState(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const parsed = stored ? Number(stored) : Number.NaN;
    return Number.isFinite(parsed) ? clamp(parsed) : defaultWidth;
  });
  const [dragging, setDragging] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const chat = useCopilotChat({ port, pageContext, onToolFinished: props.onToolFinished });
  const catalog = useCatalog(port, catalogKey ?? pageContext?.route ?? "generic", pageContext?.route, open);
  const prompts = catalog.data?.recommendedPrompts ?? [];

  const navigate = useCallback(
    (href: string) => {
      if (onNavigate) onNavigate(href);
      else onOpenLink(href);
    },
    [onNavigate, onOpenLink],
  );

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragState.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    setWidth(clamp(drag.startWidth + (drag.startX - event.clientX)));
  };
  const onResizeEnd = () => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
    window.localStorage.setItem(storageKey, String(width));
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && open) element.scrollTop = element.scrollHeight;
  }, [chat.entries, open]);

  const submit = () => {
    const text = draft.trim();
    if (!text || chat.running) return;
    chat.send(text);
    setDraft("");
  };

  return (
    <CopilotProvider value={{ labels, locale: resolvedLocale, renderChart, onOpenLink }}>
      {/* Spacer in flex flow so main content shrinks; the dock itself is fixed. */}
      <div
        aria-hidden
        className={`shrink-0 ${dragging ? "transition-none" : "transition-all duration-200"} ${className ?? ""}`}
        style={{ width: open ? width : 0 }}
      />
      <aside
        aria-label={labels.title}
        aria-hidden={!open}
        className={`fixed top-14 right-0 bottom-0 z-20 flex flex-col overflow-hidden border-l border-border bg-card ${
          dragging ? "transition-none" : "transition-all duration-200"
        } ${open ? "" : "pointer-events-none"}`}
        style={{ width: open ? width : 0 }}
      >
        {open ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={labels.resizeAria}
            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
        ) : null}

        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <Bot className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          {modelBadge}
          <span className="ml-2 truncate text-xs text-muted-foreground">
            {contextLabel ? interpolate(labels.context, { label: contextLabel }) : null}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {canManageModels && settingsHref ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.manageModelsAria}
                    onClick={() => navigate(settingsHref)}
                  >
                    <Settings />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{labels.manageModels}</TooltipContent>
              </Tooltip>
            ) : null}
            {chat.conversationId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.newConversationAria}
                    onClick={chat.resetConversation}
                  >
                    <RotateCcw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{labels.newConversation}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </header>

        {chat.banner ? (
          <CopilotBannerView
            banner={chat.banner}
            onConfigure={settingsHref ? () => navigate(settingsHref) : undefined}
            onReset={chat.resetConversation}
            onDismiss={chat.dismissBanner}
          />
        ) : null}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          {chat.entries.length === 0 ? (
            <CopilotEmptyState catalog={catalog.data} isLoading={catalog.isLoading} extra={emptyStateExtra} />
          ) : (
            <CopilotTimeline
              entries={chat.entries}
              catalog={catalog.data?.skills}
              stoppedIds={chat.stoppedIds}
              confirmingId={chat.confirmingId}
              onConfirm={chat.confirm}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="relative flex items-end gap-2">
            {prompts.length > 0 && !chat.running ? (
              <div
                className="group/suggest relative shrink-0"
                onMouseEnter={() => setShowSuggest(true)}
                onMouseLeave={() => setShowSuggest(false)}
              >
                <button
                  type="button"
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setShowSuggest(false)}
                  aria-label={labels.suggestAria}
                  aria-expanded={showSuggest}
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary ${
                    showSuggest ? "bg-accent text-primary" : ""
                  }`}
                >
                  <Lightbulb className="size-4" />
                </button>

                <div
                  className={`absolute bottom-full left-0 z-20 w-72 origin-bottom-left pb-2 transition-all duration-150 ${
                    showSuggest ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                  }`}
                >
                  <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
                    <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {contextLabel
                        ? interpolate(labels.suggestOnPage, { label: contextLabel })
                        : labels.suggestGeneric}
                    </div>
                    <div className="flex flex-col gap-1">
                      {prompts.map((prompt) => (
                        <button
                          key={prompt.label}
                          type="button"
                          onClick={() => {
                            chat.send(prompt.prompt);
                            setShowSuggest(false);
                          }}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-primary"
                        >
                          <span className="min-w-0 flex-1">{prompt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={chat.running ? labels.placeholderRunning : labels.placeholderIdle}
              rows={2}
              disabled={chat.running}
              className="min-h-0 resize-none"
            />
            {chat.running ? (
              <Button variant="destructive" size="icon" aria-label={labels.stopAria} onClick={chat.stop}>
                <Square />
              </Button>
            ) : (
              <Button size="icon" aria-label={labels.sendAria} onClick={submit} disabled={!draft.trim()}>
                <SendHorizontal />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">{labels.disclaimer}</p>
          <p className="text-[10px] text-muted-foreground/50">{labels.disclaimerShortcuts}</p>
        </div>
      </aside>
    </CopilotProvider>
  );
}

function CopilotBannerView({
  banner,
  onConfigure,
  onReset,
  onDismiss,
}: {
  banner: CopilotBanner;
  onConfigure?: () => void;
  onReset: () => void;
  onDismiss: () => void;
}) {
  const { labels } = useCopilotRuntime();
  const message = banner.rawMessage
    ? banner.rawMessage
    : banner.messageKey
      ? interpolate(labels[banner.messageKey], banner.values ?? {})
      : null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-muted/40 px-3 py-2">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{labels[banner.titleKey]}</p>
        {message ? <p className="mt-0.5 text-xs text-muted-foreground">{message}</p> : null}
        <div className="mt-1.5 flex gap-2">
          {banner.tone === "model" && onConfigure ? (
            <Button variant="outline" size="xs" onClick={onConfigure}>
              {labels.configureModel}
            </Button>
          ) : null}
          {banner.tone === "conflict" || banner.tone === "auth" ? (
            <Button variant="outline" size="xs" onClick={onReset}>
              {labels.newConversation}
            </Button>
          ) : null}
          <Button variant="ghost" size="xs" onClick={onDismiss}>
            {labels.dismiss}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Catalog fetch with a per-key in-memory cache. A short TTL keeps capability
 * lists fresh enough without a query library or a provider requirement.
 */
function useCatalog(
  port: CopilotDockProps["port"],
  cacheKey: string,
  route: string | undefined,
  enabled: boolean,
): { data: CopilotSkillsCatalog | undefined; isLoading: boolean } {
  const cache = useRef(new Map<string, { data: CopilotSkillsCatalog; at: number }>());
  const [data, setData] = useState<CopilotSkillsCatalog | undefined>(undefined);
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.current.get(cacheKey);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) {
      setData(cached.data);
      return;
    }
    let alive = true;
    setLoading(true);
    port
      .fetchCatalog(route)
      .then((result) => {
        if (!alive) return;
        cache.current.set(cacheKey, { data: result, at: Date.now() });
        setData(result);
      })
      .catch(() => {
        if (alive) setData(undefined);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [port, cacheKey, route, enabled]);

  return { data, isLoading };
}
