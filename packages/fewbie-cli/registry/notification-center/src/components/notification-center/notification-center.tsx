"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NotificationCenterProps } from "./types";

const NotificationCenterContext = createContext<NotificationCenterProps | null>(null);

/**
 * Supplies copy, transport and host callbacks to every surface in this item.
 * The provider is required: labels and ports are never hard-coded here.
 */
export function NotificationCenterProvider({ children, ...props }: NotificationCenterProps & { children: ReactNode }) {
  return <NotificationCenterContext.Provider value={props}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenter(): NotificationCenterProps {
  const value = useContext(NotificationCenterContext);
  if (!value) {
    throw new Error("NotificationCenter surfaces must render inside <NotificationCenterProvider>.");
  }
  return value;
}

export interface PolledResult<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/**
 * Minimal polling loader: no query library, so the item installs into any host
 * without a `QueryClientProvider`. The first load owns the loading state; later
 * polls refresh silently.
 */
export function usePolled<T>(load: () => Promise<T>, intervalMs: number, enabled = true): PolledResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      if (!loaded.current) setLoading(true);
      try {
        const next = await loadRef.current();
        if (!alive) return;
        loaded.current = true;
        setData(next);
        setError(undefined);
      } catch (caught) {
        if (alive) setError(caught);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    const timer = intervalMs > 0 ? window.setInterval(() => void run(), intervalMs) : undefined;
    return () => {
      alive = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [enabled, intervalMs, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}
