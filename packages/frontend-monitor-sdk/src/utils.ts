import type { RedactFn } from "./types";

export function randomString(len?: number): string {
  const l = len || 10;
  const chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz123456789";
  const maxPos = chars.length;
  let pwd = "";
  for (let i = 0; i < l; i++) {
    pwd = pwd + chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return pwd + new Date().getTime();
}

/**
 * Prepare a URL for reporting. Query strings and fragments routinely carry
 * session tokens, reset links and passwords, so they are dropped unless body
 * capture was explicitly enabled. The redact hook still runs so anything
 * sensitive left in the path can be scrubbed.
 */
export const reportUrl = (url: string, captureQuery: boolean, redact?: RedactFn): string => {
  let out = url || "";
  if (!captureQuery) {
    const cut = out.search(/[?#]/);
    if (cut > -1) out = out.slice(0, cut);
  }
  return redact ? redact(out, "url") : out;
};

/** Hard cap on captured text so a large failed response cannot bloat reports. */
export const truncateText = (value: string, maxLength: number): string => {
  if (!value) return "";
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…(truncated)`;
};

/** Run the redact hook, then truncate captured request/response text. */
export const sanitizeText = (
  value: unknown,
  kind: "query" | "body" | "response",
  maxLength: number,
  redact?: RedactFn,
): string => {
  // Non-string bodies (FormData/Blob/ArrayBuffer) are only summarised by their
  // type tag; redact only applies to actual text.
  const text = typeof value === "string" ? value : Object.prototype.toString.apply(value);
  const redacted = redact ? redact(text, kind) : text;
  return truncateText(redacted, maxLength);
};

export const getHeaderMap = (ajax: any): Record<string, string> => {
  const headers: string = ajax.getAllResponseHeaders();
  const arr = headers.trim().split(/[\r\n]+/);
  const headerMap: Record<string, string> = {};
  arr.forEach((line: string) => {
    const parts = line.split(": ");
    const header = parts.shift() as string;
    const value = parts.join(": ");
    headerMap[header.toLocaleLowerCase()] = value;
  });
  return headerMap;
};

const API_ERROR_TYPES = ["bussiness-fetch", "bussiness-ajax"];
export const filterResourceError = ({ conf, opt }: { conf: any; opt: { filterUrls: string[] } }): void => {
  const list = conf.errorList;
  const filterUrls = opt.filterUrls;
  const newlist: any[] = [];
  if (list && list.length && filterUrls && filterUrls.length) {
    for (let i = 0; i < list.length; i++) {
      let isIgnore = false;
      for (let j = 0; j < filterUrls.length; j++) {
        if (
          API_ERROR_TYPES.indexOf(list[i]["type"]) > -1 &&
          list[i]["data"]["resourceUrl"] &&
          list[i]["data"]["resourceUrl"].indexOf(filterUrls[j]) > -1
        ) {
          isIgnore = true;
          break;
        }
      }
      if (!isIgnore) newlist.push(list[i]);
    }
  }
  conf.errorList = newlist;
};
