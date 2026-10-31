import { StackTrace, computeStackTrace } from "./common/tracekit";
import { ERRORAPIS, ERRORTYPES, getConsoleErrorMsg, isObject } from "./common/utils";
import { filterResourceError, getHeaderMap, randomString, reportUrl, sanitizeText } from "./utils";
import { markDevice, markUser, markUv } from "./identity";
import {
  clearPerformanceResourceList,
  filterResource,
  initPerformanceObserver,
  perforPage,
  perforResource,
  setSdkErrorReporter,
} from "./performance";
import { InitOptions, PerformanceOptions, ReportType } from "./types";

// Published package version, read at runtime. Bundlers inline package.json
// when they encounter this require, so the real semver ships in the dist
// bundle instead of the old rollup placeholder.
declare const require: (id: string) => { version: string };
const sdk_version = require("../package.json").version;

// Idempotency markers: the SDK wraps global browser APIs (fetch, XHR, error
// listeners) exactly once. A second Performance() call (e.g. HMR re-eval or
// duplicate import) must not re-wrap them, otherwise every event is reported
// twice and the patched fetch nests on itself.
const INITIALIZED_KEY = Symbol.for("@devbie/web-monitor-sdk:initialized");
const FETCH_PATCHED_KEY = Symbol.for("@devbie/web-monitor-sdk:fetch-patched");
const ERROR_PATCHED_KEY = Symbol.for("@devbie/web-monitor-sdk:error-patched");

let reportData: (type?: ReportType) => void;
let reportCustomsNow: () => void;
let reportCustomsSoon: () => void;
let customsTimer: number | null;
/**
 * Blank error-report entry template. Cloned per error event, then filled in
 * with the actual message/stack/etc. before being pushed into the report list.
 */
const errorEntryTemplate: any = { createTime: "", type: "js", msg: "", data: {} };
let _conf: any;
let reportSdkError: (error: any) => void;

const reportDebounce = function () {
  if (_conf && _conf.page === location.href && !_conf.haveAjax) return true;
  return false;
};

const ErrorInstanceReport = function (error: StackTrace, api: string): void {
  const defaults = Object.assign({}, errorEntryTemplate);
  setTimeout(() => {
    defaults.msg = error.message;
    defaults.type = ERRORTYPES.script;
    defaults.name = error.name;
    defaults.api = api;
    defaults.stack = error.stack;
    let line: number | undefined, col: number | undefined, _url: string | undefined;
    if (error.stack && error.stack.length > 0) {
      col = error.stack[0].column || undefined;
      line = error.stack[0].line || undefined;
      _url = error.stack[0].url;
    }
    defaults.data = { resourceUrl: _url, line, col };
    defaults.createTime = new Date().getTime();
    if (_conf) {
      _conf.errorList.push(defaults);
    }
    if (reportDebounce()) reportData(ReportType.Error);
  }, 0);
};

function Performance(options: InitOptions): void {
  // Idempotent init: a second call is a no-op so HMR / duplicate imports do
  // not re-wrap global APIs or double-report every event.
  const globalScope = globalThis as Record<symbol, unknown>;
  if (globalScope[INITIALIZED_KEY]) return;
  globalScope[INITIALIZED_KEY] = true;

  if (!options.appId || !options.api || !options.token) throw new Error("appId, api or token is not defined");
  /**
   * URLs always excluded from AJAX/resource collection, on top of the
   * user-configured filterUrls. The collector endpoint itself fires as an
   * AJAX request — without this filter the SDK would measure and report
   * its own report calls as page performance data.
   */
  const alwaysFilteredUrls = ["/web-monitor/report"];
  const opt: PerformanceOptions = {
    outTime: 300,
    filterUrls: [],
    isPage: true,
    isAjax: true,
    isResource: true,
    isError: true,
    user: { uid: undefined, p: undefined },
    traceIdHeaderName: "x-trace-id",
    isTraceId: false,
    customsThrottleMs: 1000,
    // Request bodies and query strings routinely carry passwords and reset
    // tokens, so capture is opt-in. Without capture, `options` stays empty and
    // reported URLs are stripped of their query string and fragment.
    captureBody: false,
    maxResponseTextLength: 1024,
    ...options,
  };
  opt.filterUrls = opt.filterUrls.concat(alwaysFilteredUrls);

  const conf: any = {
    opt,
    ajaxCompleteTemp: [],
    resourceList: [],
    performance: {},
    errorList: [],
    customs: [],
    fetchNum: 0,
    loadNum: 0,
    ajaxLength: 0,
    fetLength: 0,
    ajaxMsg: {},
    haveAjax: false,
    haveFetch: false,
    preUrl: document.referrer && document.referrer !== location.href ? document.referrer : "",
    page: "",
    markPage: "",
    markPageUrl: "",
    apiDead: false,
    reportFailures: 0,
    reportBackoffUntil: 0,
  };

  const beginTime = new Date().getTime();
  // Truthiness gate for the first page report. It must be a flag rather than
  // an elapsed-time number: when the framework initializes the SDK faster than
  // one millisecond, `Date.now() - beginTime` is 0 and the page report would
  // be skipped entirely.
  let pageLoaded = false;
  let ajaxTime = 0;
  let fetchTime = 0;

  function getAjaxJson(ajax: any) {
    const { xhr = {} } = ajax;
    let responseJson: any = {};
    if (xhr.responseType === "" || xhr.responseType === "text") {
      const { responseText } = xhr;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Non-JSON response bodies (HTML/plain text) are normal; keep the
        // empty object instead of spamming the host page console.
      }
    } else if (xhr.responseType === "json" && isObject(xhr.response)) {
      responseJson = xhr.response;
    }
    return responseJson;
  }
  function getAjaxResponseSize(ajax: any) {
    const { xhr = {} } = ajax;
    let resSize = 0;
    if (xhr.responseType === "blob" && xhr.response instanceof Blob) {
      resSize = xhr.response.size;
    } else if (xhr.responseType === "" || xhr.responseType === "text") {
      resSize = xhr.responseText.length;
    } else if (xhr.responseType === "json") {
      try {
        resSize = JSON.stringify(xhr.response).length;
      } catch {
        // Unserializable response (e.g. cyclic structure); size stays 0 and
        // reporting is unaffected.
      }
    }
    return resSize;
  }
  function ajaxEnded(ajax: any) {
    const _id = ajax.args._id;
    let _traceId: string | null = null;
    if (conf.opt.isTraceId) {
      _traceId = getHeaderMap(ajax)[conf.opt.traceIdHeaderName.toLocaleLowerCase()] || null;
    }
    if (conf.ajaxMsg[_id]) {
      try {
        if (_traceId) conf.ajaxMsg[_id].traceId = _traceId;
        conf.ajaxMsg[_id]["bodySize"] = getAjaxResponseSize(ajax);
      } catch {
        // traceId/bodySize enrichment is best-effort; a failure here must not
        // break the reporting flow.
      }
    }
    if (ajax.status < 200 || ajax.status > 300) {
      ajaxErrResponse(ajax);
    } else if (ajax.status === 200) {
      const result = getAjaxJson(ajax);
      if (opt.errcodeReport) {
        const { xhr = {} } = ajax;
        const { isReport, errMsg, code } = opt.errcodeReport(result);
        if (isReport) {
          const defaults = Object.assign({}, errorEntryTemplate);
          defaults.createTime = new Date().getTime();
          defaults.type = ERRORTYPES.bussinessAjax;
          defaults.msg = errMsg || "业务接口异常";
          defaults.method = ajax.args.method;
          defaults.options = ajax.args.options || "";
          if (_traceId) defaults.traceId = _traceId;
          defaults.data = {
            resourceUrl: reportUrl(xhr.responseURL, opt.captureBody, opt.redact),
            status: code,
          };
          conf.errorList.push(defaults);
        }
      }
    }
    getAjaxTime();
  }

  reportSdkError = function (error: any): void {
    const { api } = opt;
    let _error: any;
    let result = getBaseData(ReportType.SdkError);
    const stack = computeStackTrace(error);
    if (stack.failed) {
      _error = { msg: error.toString() };
    } else {
      _error = {
        msg: stack.message,
        name: stack.name,
        stack: JSON.stringify(stack.stack || {}),
      };
    }
    result = Object.assign(result, { version: sdk_version, ..._error });
    doReport({ api, body: JSON.stringify(result), outTime: 0 });
  };
  setSdkErrorReporter(reportSdkError);

  function getLargeTime() {
    if (conf.page !== location.href) {
      if (conf.haveAjax && conf.haveFetch && pageLoaded && ajaxTime && fetchTime) {
        reportData(ReportType.PagePerf);
      } else if (conf.haveAjax && !conf.haveFetch && pageLoaded && ajaxTime) {
        reportData(ReportType.PagePerf);
      } else if (!conf.haveAjax && conf.haveFetch && pageLoaded && fetchTime) {
        reportData(ReportType.PagePerf);
      } else if (!conf.haveAjax && !conf.haveFetch && pageLoaded) {
        reportData(ReportType.PagePerf);
      }
    } else {
      if (conf.haveAjax && conf.haveFetch && ajaxTime && fetchTime) {
        reportData(ReportType.AjaxPerf);
      } else if (conf.haveAjax && !conf.haveFetch && ajaxTime) {
        reportData(ReportType.AjaxPerf);
      } else if (!conf.haveAjax && conf.haveFetch && fetchTime) {
        reportData(ReportType.AjaxPerf);
      }
    }
  }

  function _Ajax(proxy: any) {
    (window as any)._ahrealxhr = (window as any)._ahrealxhr || XMLHttpRequest;
    (window as any).XMLHttpRequest = function () {
      this.xhr = new (window as any)._ahrealxhr();
      for (const attr in this.xhr) {
        let type = "";
        try {
          type = typeof this.xhr[attr];
        } catch {
          // Some xhr properties throw on access (e.g. cross-origin getters);
          // treating them as non-functions routes them to defineProperty below.
        }
        if (type === "function") {
          this[attr] = hookfun(attr);
        } else {
          Object.defineProperty(this, attr, {
            get: getFactory(attr),
            set: setFactory(attr),
          });
        }
      }
    };
    for (const attr in (window as any)._ahrealxhr) {
      (XMLHttpRequest as any)[attr] = (window as any)._ahrealxhr[attr];
    }
    function getFactory(attr: string) {
      return function () {
        const v = this.hasOwnProperty(attr + "_") ? this[attr + "_"] : this.xhr[attr];
        const attrGetterHook = (proxy[attr] || {})["getter"];
        return (attrGetterHook && attrGetterHook(v, this)) || v;
      };
    }
    function setFactory(attr: string) {
      return function (v: any) {
        const xhr = this.xhr;
        const hook = proxy[attr];
        if (typeof hook === "function") {
          xhr[attr] = (...args: any[]) => {
            if (!proxy[attr](this)) {
              v.apply(xhr, args);
            }
          };
        } else {
          const attrSetterHook = (hook || {})["setter"];
          v = (attrSetterHook && attrSetterHook(v, this)) || v;
          try {
            xhr[attr] = v;
          } catch {
            this[attr + "_"] = v;
          }
        }
      };
    }
    function hookfun(fun: string) {
      return function (...args: any[]) {
        if (proxy[fun] && proxy[fun].call(this, args, this.xhr)) {
          return;
        }
        return this.xhr[fun](...args);
      };
    }
    return (window as any)._ahrealxhr;
  }

  function _fetch() {
    const win = window as unknown as Record<symbol, boolean> & { fetch?: typeof fetch };
    if (win[FETCH_PATCHED_KEY]) return;
    win[FETCH_PATCHED_KEY] = true;
    if (!window.fetch) return;
    const _fetch = fetch;
    (window as any).fetch = function (...args: any[]) {
      const _arg = args;
      const _id = randomString();
      const req = fetArg(_arg);
      if (req.type !== "report-data") {
        conf.ajaxCompleteTemp.push({ name: req.url, _id });
        conf.ajaxMsg[_id] = req;
        conf.fetLength = conf.fetLength + 1;
        conf.haveFetch = true;
      }
      return _fetch
        .apply(this, args)
        .then((originRes: Response) => {
          if (req.type === "report-data") return originRes;
          const url = reportUrl(originRes.url || "", opt.captureBody, opt.redact);
          let _traceId: string | null = null;
          if (conf.opt.isTraceId) {
            _traceId = originRes.headers.get(conf.opt.traceIdHeaderName) || null;
          }
          if (conf.ajaxMsg[_id] && _traceId) {
            conf.ajaxMsg[_id].traceId = _traceId;
          }
          // The response is handed back untouched. Cloning it to read the body
          // doubles memory for large payloads and never settles for streamed
          // responses (SSE), so size comes from PerformanceResourceTiming and
          // only JSON bodies are inspected for business errcodes.
          if (originRes.status < 200 || originRes.status > 300) {
            fetchErrResponse(originRes, req);
            getFetchTime();
            return originRes;
          }
          const errcodeReport = opt.errcodeReport;
          if (!errcodeReport || !isJsonResponse(originRes)) {
            getFetchTime();
            return originRes;
          }
          // errcodeReport needs the parsed body, so read it once from a single
          // clone. getFetchTime() must run exactly once per request even when
          // the inspection fails, otherwise the ajax report never balances.
          let inspection: Promise<void>;
          try {
            inspection = originRes
              .clone()
              .text()
              .then((data) => {
                let resResult: any = {};
                try {
                  resResult = JSON.parse(data);
                } catch {
                  // A JSON content-type with a non-JSON body (e.g. an empty
                  // 204-like payload) is skipped.
                  return;
                }
                const { isReport, errMsg, code } = errcodeReport(resResult);
                if (!isReport) return;
                const defaults = Object.assign({}, errorEntryTemplate);
                defaults.createTime = new Date().getTime();
                defaults.type = ERRORTYPES.bussinessFetch;
                defaults.msg = errMsg || "业务接口异常";
                defaults.method = req.method;
                defaults.options = req.options || "";
                if (_traceId) defaults.traceId = _traceId;
                defaults.data = { resourceUrl: url, status: code };
                conf.errorList.push(defaults);
              })
              .catch(() => {
                // A disturbed or opaque body cannot be inspected; skip
                // errcode detection without rejecting the caller's promise.
              });
          } catch {
            inspection = Promise.resolve();
          }
          void inspection.finally(() => getFetchTime());
          return originRes;
        })
        .catch((err: any) => {
          if (req.type === "report-data") return Promise.reject(err);
          let msg = "fetch request error";
          if (isObject(err) && (err as any).name) {
            msg = `${(err as any).name}: ${(err as any).message}`;
          } else if (err) {
            msg = err;
          }
          const defaults = Object.assign({}, errorEntryTemplate);
          defaults.createTime = new Date().getTime();
          defaults.type = ERRORTYPES.fetch;
          defaults.msg = msg;
          defaults.method = req.method;
          defaults.options = req.options || "";
          defaults.data = { resourceUrl: req.url, status: 0 };
          conf.errorList.push(defaults);
          getFetchTime();
          return Promise.reject(err);
        });
    };
  }

  /**
   * Record a request body/query string for reporting. Returns an empty string
   * unless captureBody is enabled, and always runs the redact hook + truncation
   * so sensitive payloads never reach the report verbatim.
   */
  function captureOptions(value: unknown, kind: "query" | "body"): string {
    if (!opt.captureBody || value === null || value === undefined || value === "") return "";
    return sanitizeText(value, kind, opt.maxResponseTextLength, opt.redact);
  }

  function fetArg(arg: any[]) {
    const result: any = { method: "GET", type: "fetchrequest" };
    const args = Array.prototype.slice.apply(arg);
    if (!args || !args.length) return result;
    try {
      if (args.length === 1) {
        if (typeof args[0] === "string") {
          result.url = args[0];
        } else if (typeof args[0] === "object") {
          result.url = args[0].url;
          result.method = args[0].method;
          if (args[0].body) result.options = captureOptions(args[0].body, "body");
        }
      } else {
        result.url = args[0];
        result.method = args[1].method || "GET";
        result.type = args[1].type || "fetchrequest";
        if (args[1].body) result.options = captureOptions(args[1].body, "body");
      }
      if (result.method.toLocaleUpperCase() === "GET") {
        // Only the query string is extracted as options; result.url keeps the
        // full URL (including query) so it can be matched against the browser
        // performance entry name in initPerformanceObserver. The query itself
        // is captured only when captureBody is enabled.
        const [, options] = result.url.split("?");
        result.options = captureOptions(options, "query");
      }
    } catch {
      // Malformed fetch arguments fall back to the GET default below.
    }
    return result;
  }

  function _error() {
    const win = window as unknown as Record<symbol, boolean>;
    if (win[ERROR_PATCHED_KEY]) return;
    win[ERROR_PATCHED_KEY] = true;
    window.addEventListener(
      "error",
      (e: any) => {
        const defaults = Object.assign({}, errorEntryTemplate);
        defaults.type = ERRORTYPES.resource;
        defaults.createTime = new Date().getTime();
        defaults.msg = e.target.localName + " is load error";
        defaults.method = "GET";
        defaults.api = ERRORAPIS.onerror;
        defaults.data = {
          target: e.target.localName,
          type: e.type,
          resourceUrl: e.target.href || e.target.src || e.target.currentSrc,
        };
        if (e.target !== window) conf.errorList.push(defaults);
      },
      true,
    );
    const _oldOnerror = window.onerror as any;
    window.onerror = function (...args: [any, any, any, any, any]) {
      const [msg, _url, line, col, error] = args;
      const stack = computeStackTrace(error);
      if (stack.failed) {
        const defaults = Object.assign({}, errorEntryTemplate);
        defaults.msg = msg;
        defaults.type = ERRORTYPES.log;
        defaults.api = ERRORAPIS.onerror;
        defaults.createTime = new Date().getTime();
        defaults.data = { resourceUrl: _url, line, col };
        conf.errorList.push(defaults);
        if (reportDebounce()) reportData(ReportType.Error);
      } else {
        ErrorInstanceReport(stack, ERRORAPIS.onerror);
      }
      if (_oldOnerror) {
        return _oldOnerror.apply(this, args as any);
      }
    };
    window.addEventListener("unhandledrejection", (e: any) => {
      const error = e && e.reason;
      const stack = computeStackTrace(error);
      if (stack.failed) {
        const defaults = Object.assign({}, errorEntryTemplate);
        if (isObject(error)) {
          defaults.msg = JSON.stringify(error);
        } else {
          defaults.msg = "" + error;
        }
        defaults.type = ERRORTYPES.log;
        defaults.api = ERRORAPIS.unhandleReject;
        defaults.createTime = new Date().getTime();
        defaults.data = { resourceUrl: location.href };
        conf.errorList.push(defaults);
        if (reportDebounce()) reportData(ReportType.Error);
      } else {
        ErrorInstanceReport(stack, ERRORAPIS.unhandleReject);
      }
    });
    const oldError = console.error;
    console.error = (...args: any[]) => {
      if (args.length === 1) {
        const stack = computeStackTrace(args[0]);
        if (!stack.failed) {
          ErrorInstanceReport(stack, ERRORAPIS.consoleError);
          // Still forward to the host console: swallowing the call hid the
          // developer's own diagnostics whenever the argument was an Error.
          return (oldError as any).apply(console, args);
        }
      }
      const msg = getConsoleErrorMsg(args);
      if (msg) {
        const defaults = Object.assign({}, errorEntryTemplate);
        setTimeout(() => {
          defaults.msg = msg;
          defaults.type = ERRORTYPES.log;
          defaults.api = ERRORAPIS.consoleError;
          defaults.createTime = new Date().getTime();
          defaults.data = { resourceUrl: location.href };
          conf.errorList.push(defaults);
          if (reportDebounce()) reportData(ReportType.Error);
        }, 0);
      }
      return (oldError as any).apply(console, args);
    };
  }

  function ajaxErrResponse(ajax: any) {
    if (ajax.isLock) return;
    ajax.isLock = true;
    let msg = "ajax request error";
    try {
      if (ajax.xhr && ajax.xhr.responseText) {
        msg = sanitizeText(ajax.xhr.responseText, "response", opt.maxResponseTextLength, opt.redact);
      } else if (ajax.statusText) {
        msg = ajax.statusText;
      }
    } catch {
      // responseText access can throw for opaque responses; keep the generic
      // "ajax request error" message.
    }
    const defaults = Object.assign({}, errorEntryTemplate);
    defaults.createTime = new Date().getTime();
    defaults.type = ERRORTYPES.ajax;
    defaults.msg = msg;
    defaults.method = ajax.args.method;
    defaults.options = ajax.args.options || "";
    if (conf.opt.isTraceId) {
      const _traceId = getHeaderMap(ajax)[conf.opt.traceIdHeaderName.toLocaleLowerCase()] || null;
      if (_traceId) defaults.traceId = _traceId;
    }
    defaults.data = {
      resourceUrl: reportUrl(ajax.args.url, opt.captureBody, opt.redact),
      text: msg,
      status: ajax.status,
    };
    conf.errorList.push(defaults);
  }

  function isJsonResponse(res: Response): boolean {
    try {
      const contentType = res.headers.get("content-type");
      return !!contentType && contentType.toLowerCase().includes("json");
    } catch {
      // headers.get() can throw for opaque cross-origin responses.
      return false;
    }
  }

  function fetchErrResponse(res: Response, req: any) {
    const defaults = Object.assign({}, errorEntryTemplate);
    // The body is deliberately not read: cloning an error response just to
    // build a message would double memory for large error pages.
    let msg = "fetch request error";
    if ((res as any).statusText) {
      msg = (res as any).statusText;
    }
    defaults.createTime = new Date().getTime();
    defaults.type = ERRORTYPES.fetch;
    defaults.msg = msg;
    defaults.method = req.method;
    defaults.options = req.options || "";
    try {
      const _traceId = res.headers.get(conf.opt.traceIdHeaderName) || null;
      if (_traceId) defaults.traceId = _traceId;
    } catch {
      // headers.get() can throw for opaque/cross-origin responses; traceId
      // stays null.
    }
    defaults.data = { resourceUrl: reportUrl(req.url, opt.captureBody, opt.redact), status: res.status };
    conf.errorList.push(defaults);
  }

  function getFetchTime() {
    setTimeout(() => {
      conf.fetchNum += 1;
      if (conf.fetLength === conf.fetchNum) {
        conf.fetchNum = conf.fetLength = 0;
        fetchTime = new Date().getTime() - beginTime;
        getLargeTime();
      }
    }, 600);
  }

  function getAjaxTime() {
    setTimeout(() => {
      conf.loadNum += 1;
      if (conf.loadNum >= conf.ajaxLength) {
        conf.ajaxLength = conf.loadNum = 0;
        ajaxTime = new Date().getTime() - beginTime;
        getLargeTime();
      }
    }, 600);
  }
  function clear() {
    clearPerformanceResourceList();
    conf.performance = {};
    conf.errorList = [];
    conf.preUrl = "";
    conf.resourceList = [];
    conf.page = location.href;
    conf.haveAjax = false;
    conf.haveFetch = false;
    conf.ajaxMsg = {};
    conf.ajaxCompleteTemp = [];
    ajaxTime = 0;
    fetchTime = 0;
  }

  function getBaseData(type: ReportType, time?: number) {
    const { appId, token } = opt;
    const markuser = markUser(type);
    if (conf.markPageUrl !== location.href) {
      conf.markPageUrl = location.href;
      conf.markPage = randomString();
    }
    const result = {
      appId,
      token,
      time: time || new Date().getTime(),
      markUser: markuser.markUser,
      markPage: conf.markPage,
      isFirstIn: markuser.isFirstIn,
      markUv: markUv(),
      markDevice: markDevice(),
      type: type,
      url: location.href,
      uid: undefined,
      p: undefined,
    };
    if (conf.opt.user.uid) result.uid = conf.opt.user.uid;
    if (conf.opt.user.p) result.p = conf.opt.user.p;
    return result;
  }
  function doReport({ api, body, outTime, type }: { api: string; body: string; outTime: number; type?: ReportType }) {
    if (conf.apiDead) return;
    if (type === ReportType.Unload) {
      (navigator as any).sendBeacon(api, body);
      return;
    }
    // Network failures are transient, so a failed attempt only defers the next
    // one instead of disabling reporting for the rest of the session.
    if (Date.now() < conf.reportBackoffUntil) return;
    if (typeof window.fetch === "function") {
      setTimeout(() => {
        fetch(api, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          // @ts-expect-error -- custom marker so the patched fetch skips re-reporting SDK report calls
          type: "report-data" as any,
          body,
        })
          .then((res?: Response) => {
            // A mocked or intercepted fetch may resolve without a Response;
            // treat that as delivered rather than as a failure.
            if (!res || typeof res.status !== "number") return;
            if (res.status >= 400 && res.status < 500) {
              // The endpoint rejected the payload itself (bad appId/token or a
              // malformed body); retrying cannot succeed.
              conf.apiDead = true;
            } else {
              conf.reportFailures = 0;
            }
          })
          .catch((err) => {
            conf.reportFailures += 1;
            conf.reportBackoffUntil = Date.now() + Math.min(60_000, 2 ** conf.reportFailures * 1000);
            return err;
          });
      }, outTime);
    }
  }

  try {
    _conf = conf;
    initPerformanceObserver(_conf);

    if (opt.isError) _error();
    if (opt.isAjax || opt.isError) _fetch();
    if (opt.isAjax || opt.isError) {
      _Ajax({
        onreadystatechange: function (ajax: any) {
          if (ajax.readyState === 4 && !ajax.endedCallbackName) {
            ajax.endedCallbackName = "onreadystatechange";
            ajaxEnded(ajax);
          }
        },
        onloadend: function (ajax: any) {
          if (!ajax.endedCallbackName) {
            ajax.endedCallbackName = "onloadend";
            ajaxEnded(ajax);
          }
        },
        onerror: function (ajax: any) {
          getAjaxTime();
          ajaxErrResponse(ajax);
        },
        send: function (data: any[]) {
          if (this.args && data && data.length > 0) {
            if (typeof data[0] === "string") this.args.options = captureOptions(data[0], "body");
            else {
              if (data[0] !== null && data[0] !== undefined) {
                this.args.options = captureOptions(data[0], "body");
              }
            }
          }
        },
        open: function (arg: any[]) {
          let url = arg[1];
          if (!url.startsWith("http")) url = window.location.origin + url;
          const result = {
            url,
            method: arg[0] || "GET",
            type: "xmlhttprequest",
            _id: randomString(),
          };
          this.args = result;
          conf.ajaxCompleteTemp.push({ name: url, _id: result._id });
          conf.ajaxMsg[result._id] = result;
          conf.ajaxLength = conf.ajaxLength + 1;
          conf.haveAjax = true;
        },
      });
    }

    reportData = function (type = ReportType.PagePerf): void {
      const { api, outTime } = opt;
      if (opt.isPage) perforPage(conf);
      if (opt.isResource || opt.isAjax) perforResource({ conf, opt });
      filterResource({ conf, opt });
      filterResourceError({ conf, opt });
      const { resourceList, performance, preUrl, errorList } = conf;
      let time = new Date().getTime();
      // If resource requests exist, use the first resource timestamp as the start time
      if (resourceList && resourceList.length) {
        time = resourceList[0].requestTime;
      }
      let result = getBaseData(type, time);
      if (result.isFirstIn) {
        result = Object.assign(result, {
          performance,
          preUrl,
          screenWidth: document.documentElement.clientWidth || document.body.clientWidth,
          screenHeight: document.documentElement.clientHeight || document.body.clientHeight,
        });
      }
      if (type !== ReportType.Custom) {
        result = Object.assign(result, {
          resourceList,
          errorList,
        });
      }
      const body = JSON.stringify(result);
      clear();
      if (type === ReportType.AjaxPerf && resourceList.length === 0 && errorList.length === 0) {
        return;
      }
      if (type === ReportType.Unload && resourceList.length === 0 && errorList.length === 0) {
        return;
      }
      doReport({ api, body, outTime, type });
    };

    reportCustomsNow = function (): void {
      const { api, outTime } = opt;
      const customs = conf.customs || [];
      if (!customs.length) return;
      const body = JSON.stringify({
        ...getBaseData(ReportType.Custom),
        customs,
      });
      conf.customs = [];
      customsTimer = null;
      doReport({ api, body, outTime, type: ReportType.Custom });
    };

    reportCustomsSoon = function (): void {
      if (customsTimer != null) return;
      customsTimer = window.setTimeout(() => {
        reportCustomsNow();
      }, opt.customsThrottleMs);
    };

    // Page lifecycle reporting is independent of error collection. Register
    // these here rather than inside _error(), otherwise disabling isError
    // would silently disable page views as well.
    addEventListener(
      "load",
      () => {
        pageLoaded = true;
        getLargeTime();
      },
      false,
    );
    addEventListener(
      "unload",
      () => {
        if (navigator && (navigator as any).sendBeacon) reportData(ReportType.Unload);
      },
      false,
    );
    // Framework integrations (React/Next) initialize the SDK after hydration,
    // so the window `load` event may already have fired and the listener above
    // would never run — the page would never be reported. Treat an already
    // loaded document as "loaded now" and emit the first page report once the
    // report machinery above is fully assigned.
    if (document.readyState === "complete") {
      pageLoaded = true;
      setTimeout(() => getLargeTime(), opt.outTime);
    }
  } catch (err: any) {
    reportSdkError(err);
  }
}

export { reportData, reportCustomsNow, reportCustomsSoon, _conf, ErrorInstanceReport, reportSdkError };
export default Performance;
