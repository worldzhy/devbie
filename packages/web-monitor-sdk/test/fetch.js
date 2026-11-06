import "./mock/web.env";
import { mockPerformanceResource, mockBaseFetchApi } from "./mock/mock";
import { overrideFetch, httpServer, waitFor } from "./mock/utils";
import webMonitorSdk from "../src/index";
const _monitor = webMonitorSdk({
  api: "http://localhost/report",
  token: "token_test",
  // This suite asserts the legacy opt-in behaviour: bodies/queries are only
  // recorded when captureBody is explicitly enabled.
  captureBody: true,
});

// Start a server to receive requests
httpServer(mockBaseFetchApi);

// Override the fetch patched by monitor; verify auto-reporting after a request completes
// Intercept and store reported payloads for assertions in test()
let reportTypePage, reportTypeAjax;
// R15-08: every report call must carry a timeout signal, otherwise a hung
// connection stalls the SDK's backoff timer forever.
const reportSignals = [];
overrideFetch(function () {
  reportSignals.push(arguments[1].signal);
  const body = JSON.parse(arguments[1].body);
  // page report
  if (body.type === "PagePerf") {
    reportTypePage = body;
  }
  // ajax report
  if (body.type === "AjaxPerf") {
    reportTypeAjax = body;
  }
});

// Two phases, matching the SDK's deferred-init behavior in an already-loaded
// document: the initial page report fires first with an empty resourceList;
// ajax traffic after it produces a separate AjaxPerf report.
test("web api: fetch", async () => {
  // Phase 1: page-load report
  await waitFor(() => reportTypePage, 8000);
  expect(reportTypePage.performance.andt).toEqual(
    Math.round(
      window.performance.getEntriesByType("navigation")[0].domComplete -
        window.performance.getEntriesByType("navigation")[0].domInteractive,
    ),
  );
  expect(reportTypePage.isFirstIn).toEqual(true);
  expect(reportTypePage.markUser.length).toBeGreaterThan(0);
  expect(reportTypePage.markUv.length).toBeGreaterThan(0);
  expect(reportTypePage.resourceList.length).toEqual(0);

  // Phase 2: ajax-completion report
  const requestAddress = mockPerformanceResource.fetch.name;
  fetch(requestAddress, {
    method: "GET",
  });
  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetch);
  await waitFor(() => reportTypeAjax, 8000);
  expect(reportTypeAjax.resourceList[0].name).toEqual(requestAddress);
  expect(reportTypeAjax.resourceList[0].options).toEqual(requestAddress.split("?")[1]);
  expect(reportTypeAjax.markUser.length).toBeGreaterThan(0);
  expect(reportTypeAjax.markUv.length).toBeGreaterThan(0);

  // R15-08: the report fetch is bounded in time, like the other SDKs.
  expect(reportSignals.length).toBeGreaterThan(0);
  reportSignals.forEach((signal) => expect(signal).toBeInstanceOf(AbortSignal));
}, 20000);
