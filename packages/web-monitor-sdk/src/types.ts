/** Payload kinds passed to the {@link RedactFn} hook. */
export type RedactKind = "url" | "query" | "body" | "response";
export type RedactFn = (value: string, kind: RedactKind) => string;

export interface PerformanceOptions {
  appId: string;
  api: string;
  token: string;
  outTime: number;
  filterUrls: string[];
  isPage: boolean;
  isAjax: boolean;
  isResource: boolean;
  isError: boolean;
  user?: { uid?: string; p?: string };
  traceIdHeaderName: string;
  isTraceId: boolean;
  customsThrottleMs: number;
  captureBody: boolean;
  redact?: RedactFn;
  maxResponseTextLength: number;
  errcodeReport?: (responseData: Record<string, unknown>) => {
    isReport: boolean;
    errMsg: string;
    code: number | string;
  };
}

export interface InitOptions {
  appId: string;
  api: string;
  /** Secret report token (distinct from the public appId partition key). */
  token: string;
  filterUrls?: string[];
  isPage?: boolean;
  isAjax?: boolean;
  isResource?: boolean;
  isError?: boolean;
  user?: { uid?: string; p?: string };
  traceIdHeaderName?: string;
  isTraceId?: boolean;
  customsThrottleMs?: number;
  /**
   * Record request bodies and URL query strings in the report `options`
   * field. Off by default: request payloads and query strings routinely carry
   * passwords, session tokens and reset links. Turning this on restores the
   * legacy behaviour; pair it with {@link redact}.
   */
  captureBody?: boolean;
  /** Scrub sensitive substrings from captured URLs, bodies and responses. */
  redact?: RedactFn;
  /**
   * Max characters of a failed response body kept in the error message.
   * Defaults to 1024 so a large error page cannot bloat the report.
   */
  maxResponseTextLength?: number;
  errcodeReport?: (responseData: Record<string, unknown>) => {
    isReport: boolean;
    errMsg: string;
    code: number | string;
  };
}

export enum ReportType {
  PagePerf = "PagePerf",
  AjaxPerf = "AjaxPerf",
  Error = "Error",
  Custom = "Custom",
  Unload = "Unload",
  SdkError = "SdkError",
}
