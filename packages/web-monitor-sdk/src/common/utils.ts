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

export const ERRORTYPES = {
  log: "log",
  script: "script",
  ajax: "ajax",
  fetch: "fetch",
  bussinessAjax: "bussiness-ajax",
  bussinessFetch: "bussiness-fetch",
  resource: "resource",
} as const;

/**
 * Error sources written to the `api` column, and the single source of truth for
 * where an error came from (error-source classification, ADR-050). Values are
 * matched literally by the alert predicates in the web-monitor module, so they
 * are part of the published contract: change them only together with those.
 */
export const ERROR_APIS = {
  /** `console.error` output, including stack-bearing single-argument calls. Reported as `log`. */
  consoleError: "console-error",
  /** Uncaught JS exception (`window.onerror`). Reported as `script`. */
  onerror: "onerror",
  /** Unhandled promise rejection. Reported as `script`. */
  unhandledRejection: "unhandled-rejection",
  /** Failed resource load (image/script/link). Reported as `resource`. */
  resourceError: "resource-error",
} as const;
