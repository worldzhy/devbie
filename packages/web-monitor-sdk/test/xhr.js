import "./mock/web.env";
import { mockPerformanceResource, XMLConstructorEnum, mockBaseXhrApi } from "./mock/mock";
import { overrideFetch, httpServer, waitFor } from "./mock/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
});
// Start a server to receive requests
httpServer(mockBaseXhrApi);

// Intercept and store reported payloads for assertions in test()
let reportTypePage, reportTypeAjax;
// Override the fetch patched by monitor; verify auto-reporting after a request completes
overrideFetch(function () {
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
test("web api: XMLHttpRequest", async () => {
  // Verify enumerable XMLHttpRequest properties are not lost after patching
  for (const attr in XMLHttpRequest) {
    expect(XMLHttpRequest[attr]).toEqual(XMLConstructorEnum[attr]);
  }

  // Phase 1: page-load report
  await waitFor(() => reportTypePage, 8000);
  expect(reportTypePage.appId).toEqual(appId);
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
  const requestAddress = mockPerformanceResource.xhr.name;
  // Send a request; ensure it is sent successfully, the patched collection logic runs and captures the data, and the SDK produces the corresponding record
  const xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = state_Change;
  xmlhttp.open("GET", requestAddress, true);
  xmlhttp.send(null);
  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.xhr);

  function state_Change() {
    // 4 = "loaded"
    if (xmlhttp.readyState === 4) {
      if (xmlhttp.status === 200) {
        expect(xmlhttp.status).toEqual(200);
      }
    }
  }
  await waitFor(() => reportTypeAjax, 8000);
  expect(reportTypeAjax.resourceList[0].name).toEqual(requestAddress);
  expect(reportTypeAjax.markUser.length).toBeGreaterThan(0);
  expect(reportTypeAjax.markUv.length).toBeGreaterThan(0);
}, 20000);
