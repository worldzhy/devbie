import { reportUrl } from "./utils";

/**
 * SDK error reporting slot. Injected by core during init via
 * setSdkErrorReporter; performance must not import core (circular import).
 * Defaults to a no-op so pre-init calls stay safe.
 */
let sdkErrorReporter: (error: any) => void = () => {};

export function setSdkErrorReporter(reporter: (error: any) => void): void {
  sdkErrorReporter = reporter;
}

const getNavigationEntryFromPerformanceTiming = (): any => {
  const timing: any = performance.timing as any;
  const navigationEntry: any = { entryType: "navigation", startTime: 0 };
  for (const key in timing) {
    if (key !== "navigationStart" && key !== "toJSON") {
      navigationEntry[key] = Math.max(timing[key] - timing.navigationStart, 0);
    }
  }
  return navigationEntry;
};

export const getNavigationEntry = (): any => {
  try {
    if (
      performance.getEntriesByType &&
      performance.getEntriesByType("navigation") &&
      performance.getEntriesByType("navigation")[0]
    ) {
      return performance.getEntriesByType("navigation")[0];
    }
    return getNavigationEntryFromPerformanceTiming();
  } catch (error) {
    sdkErrorReporter(error);
    return false;
  }
};

export const getFCP = (): number | false => {
  try {
    if (performance.getEntriesByType && performance.getEntriesByType("paint")) {
      const firstPaint = performance
        .getEntriesByType("paint")
        .filter((item: any) => item.name === "first-contentful-paint");
      if (firstPaint[0]) return firstPaint[0].startTime;
    }
    const timing: any = getNavigationEntry();
    return (timing.domInteractive || timing.domLoading) - timing.fetchStart;
  } catch (error) {
    sdkErrorReporter(error);
    return false;
  }
};

let _performanceResourceList: any = [];

function getPerformanceResourceList(): any {
  return [].concat(_performanceResourceList);
}

export function clearPerformanceResourceList(): void {
  _performanceResourceList = [];
}

export function initPerformanceObserver(conf: any): void {
  if ((window as any).PerformanceObserver) {
    _performanceResourceList = [].concat(performance.getEntriesByType("resource") as any);
    const observer = new (window as any).PerformanceObserver((list: any) => {
      const entries = list.getEntriesByType("resource");
      entries.forEach((item: any) => {
        if (item.initiatorType === "xmlhttprequest" || item.initiatorType === "fetch") {
          for (let i = 0; i < conf.ajaxCompleteTemp.length; i++) {
            if (conf.ajaxCompleteTemp[i].name === item.name) {
              item._id = conf.ajaxCompleteTemp[i]._id;
              conf.ajaxCompleteTemp.splice(i, 1);
              break;
            }
          }
        }
      });
      _performanceResourceList = _performanceResourceList.concat(entries);
    });
    observer.observe({ entryTypes: ["resource"] });
  }
}

export function perforPage(conf: any): void {
  if (!window.performance) return;
  const fcp = getFCP();
  const navigationEntry: any = getNavigationEntry();
  if (!navigationEntry || !fcp) return;
  conf.performance = {
    dnst: Math.round(navigationEntry.domainLookupEnd - navigationEntry.domainLookupStart) || 0,
    tcpt: Math.round(navigationEntry.connectEnd - navigationEntry.connectStart) || 0,
    wit: Math.round(fcp),
    lodt: Math.round(navigationEntry.duration),
    reqt: Math.round(navigationEntry.responseStart),
    andt: Math.round(navigationEntry.domComplete - navigationEntry.domInteractive) || 0,
  };
}

export function perforResource({ conf, opt }: { conf: any; opt: any }): boolean | void {
  if (!window.performance || !window.performance.getEntries) return false;
  const resource = getPerformanceResourceList();
  const resourceList: any[] = [];
  if (!resource && !resource.length) return;
  resource.forEach((item: any) => {
    if (!opt.isAjax && (item.initiatorType === "xmlhttprequest" || item.initiatorType === "fetch")) return;
    if (!opt.isResource && item.initiatorType !== "xmlhttprequest" && item.initiatorType !== "fetch") return;
    const json: any = {
      // Performance entries carry the full URL, including query strings that
      // routinely hold tokens. Strip them unless capture was explicitly enabled.
      name: reportUrl(item.name, !!opt.captureBody, opt.redact),
      method: "GET",
      type: item.initiatorType,
      duration: Number(item.duration.toFixed(2)) || 0,
      requestTime: Number((performance.timeOrigin + item.startTime).toFixed(0)) || 0,
      bodySize: item.encodedBodySize || 0,
      nextHopProtocol: item.nextHopProtocol,
    };
    const ajaxMsg = conf.ajaxMsg[item._id] || "";
    if (ajaxMsg) {
      if (ajaxMsg.traceId) json.traceId = ajaxMsg.traceId;
      json.method = ajaxMsg.method || "GET";
      json.type = ajaxMsg.type || json.type;
      json.bodySize = json.bodySize || ajaxMsg.bodySize || 0;
      json.options = ajaxMsg.options || "";
    }
    resourceList.push(json);
  });
  conf.resourceList = resourceList;
}

export function filterResource({ conf, opt }: { conf: any; opt: any }): void {
  const reslist = conf.resourceList;
  const filterUrls = opt.filterUrls;
  const newlist: any[] = [];
  if (reslist && reslist.length && filterUrls && filterUrls.length) {
    for (let i = 0; i < reslist.length; i++) {
      let begin = false;
      for (let j = 0; j < filterUrls.length; j++) {
        if (reslist[i]["name"].indexOf(filterUrls[j]) > -1) {
          begin = true;
          break;
        }
      }
      if (!begin) newlist.push(reslist[i]);
    }
  }
  conf.resourceList = newlist;
}
