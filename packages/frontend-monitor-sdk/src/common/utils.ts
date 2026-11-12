export function isObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.apply(value) === "[object Object]";
}

const middle: Record<number, string> = {
  0: "QR",
  1: "xa",
  2: "cL",
  3: "pF",
  4: "Oe",
  5: "bn",
  6: "sM",
  7: "yt",
  8: "Uv",
  9: "ik",
};

export function encryptP(value: string | number): string {
  const str = typeof value === "number" ? String(value) : value;
  if (typeof str !== "string") throw new Error("Invalid p field format: only a number or a numeric string is allowed");
  return str
    .split("")
    .map((item) => {
      const n = Number(item);
      return Number.isInteger(n) && middle[n] ? middle[n] : "";
    })
    .join("");
}

export function isIgnore(url: string, filterUrls: string[]): boolean {
  let ignore = false;
  if (url && filterUrls && filterUrls.length) {
    filterUrls.find((item) => {
      if (url.indexOf(item) !== -1) {
        ignore = true;
        return true;
      }
      return false;
    });
  }
  return ignore;
}

export function endsWith(str: string, endStr: string): boolean {
  const reg = new RegExp(endStr + "$");
  return reg.test(str);
}

function ifGetReasonOrStr(err: any): string {
  if (Object.prototype.toString.apply(err) === "[object PromiseRejectionEvent]") {
    return "PromiseRejectionEvent: " + err.reason;
  } else if (isObject(err)) {
    return JSON.stringify(err);
  }
  return String(err);
}

export function getConsoleErrorMsg(args: any[]): string {
  let msg = "";
  try {
    if (args.length === 1) {
      msg = "" + ifGetReasonOrStr(args[0]);
    } else if (args.length > 1) {
      const arr: string[] = [];
      for (const i in args) {
        arr.push("" + ifGetReasonOrStr(args[i]));
      }
      msg = arr.toString();
    }
  } catch {
    // no-op
  }
  return msg;
}

/**
 * Diagnostic fields copied out of a rejection reason. A reason reaching here has
 * no usable stack, so it is whatever the host passed to `Promise.reject` — only
 * these low-entropy scalars are kept; payload subtrees (where credentials live)
 * are dropped before the entry leaves the browser.
 */
const REJECTION_SUMMARY_KEYS = ["name", "message", "msg", "code", "status", "errorCode", "errorMessage", "type"];
const REJECTION_SUMMARY_MAX_FIELD = 120;
const REJECTION_SUMMARY_MAX_TOTAL = 300;

/**
 * Builds `msg` for a rejected promise that carries no stack. Never serializes the
 * reason wholesale: nested objects, arrays and unknown keys are replaced by
 * placeholders so host business data cannot reach shared storage.
 */
export function getRejectionMsg(reason: unknown): string {
  try {
    if (reason === null || reason === undefined) return String(reason);
    if (Array.isArray(reason)) return `[array:${reason.length}]`;
    if (!isObject(reason)) {
      const str = String(reason);
      return str.length > REJECTION_SUMMARY_MAX_FIELD ? `${str.slice(0, REJECTION_SUMMARY_MAX_FIELD)}…` : str;
    }
    const parts: string[] = [];
    let total = 0;
    for (const key of REJECTION_SUMMARY_KEYS) {
      const value = reason[key];
      const scalar = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      if (!scalar) continue;
      const text = `${key}: ${String(value)}`;
      const capped =
        text.length > REJECTION_SUMMARY_MAX_FIELD ? `${text.slice(0, REJECTION_SUMMARY_MAX_FIELD)}…` : text;
      if (total + capped.length > REJECTION_SUMMARY_MAX_TOTAL) break;
      parts.push(capped);
      total += capped.length + 2;
    }
    return parts.length ? parts.join("; ") : "[rejection object]";
  } catch {
    // A hostile or exotic reason (throwing getter, revoked proxy) must not break
    // the rejection listener.
    return "[rejection object]";
  }
}

export const ERRORTYPES = {
  log: "log",
  script: "script",
  ajax: "ajax",
  fetch: "fetch",
  bussinessAjax: "bussiness-ajax",
  bussinessFetch: "bussiness-fetch",
  resource: "resource",
  /** A rejected promise. Named for what we observe (a rejection), not for its
   * handling state: the SDK never listens to `rejectionhandled`, so a rejection
   * may be caught after we record it. */
  promiseRejection: "promise-rejection",
} as const;

/**
 * Error sources written to the `api` column, and the single source of truth for
 * where an error came from (error-source classification, ADR-050). Values are
 * matched literally by the alert predicates in the frontend-monitor module, so they
 * are part of the published contract: change them only together with those.
 */
export const ERROR_APIS = {
  /** `console.error` output, including stack-bearing single-argument calls. Reported as `log`. */
  consoleError: "console-error",
  /** Uncaught JS exception (`window.onerror`). Reported as `script`. */
  onerror: "onerror",
  /** Rejected promise without a usable stack. Reported as `promise-rejection`. */
  unhandledRejection: "unhandled-rejection",
  /** Failed resource load (image/script/link). Reported as `resource`. */
  resourceError: "resource-error",
} as const;
