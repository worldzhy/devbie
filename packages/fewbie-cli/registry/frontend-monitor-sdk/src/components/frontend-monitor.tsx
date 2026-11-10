"use client";

import { useEffect } from "react";

/**
 * Browser-side monitoring bootstrap.
 *
 * Dynamically imports @devbie/frontend-monitor-sdk on mount and initializes it
 * with NEXT_PUBLIC_WEB_MONITOR_ENDPOINT (report endpoint) and
 * NEXT_PUBLIC_WEB_MONITOR_TOKEN (report token — the collector resolves it to
 * the application partition). Renders nothing; it is a no-op until both env
 * vars are set. Heartbeat wiring is intentionally NOT handled here — it lives
 * in the template's instrumentation.ts (Node process only).
 *
 * The dynamic import keeps the SDK out of SSR/Edge evaluation entirely:
 * the monitor bundle is only loaded in the browser when the component mounts.
 */
export function FrontendMonitor() {
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_WEB_MONITOR_ENDPOINT;
    const token = process.env.NEXT_PUBLIC_WEB_MONITOR_TOKEN;

    // Required configuration missing — stay silent in production, warn in dev.
    if (!api || !token) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[FrontendMonitor] NEXT_PUBLIC_WEB_MONITOR_ENDPOINT / NEXT_PUBLIC_WEB_MONITOR_TOKEN not set; monitoring disabled.",
        );
      }
      return;
    }

    let disposed = false;

    void import("@devbie/frontend-monitor-sdk").then(({ default: init }) => {
      // StrictMode mounts effects twice in dev; guard against double init.
      if (disposed) return;
      init({
        api,
        token,
        isPage: true,
        isAjax: true,
        isResource: true,
        isError: true,
      });
    });

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
