import "./mock/web.env";
import { mockPerformanceResource, mockBaseFetchApi } from "./mock/mock";
import { overrideFetch, httpServer } from "./mock/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
});

// Start a server to receive requests
httpServer(mockBaseFetchApi);

// Override the fetch patched by monitor; verify auto-reporting after a request completes
// Intercept and store reported payloads for assertions in test()
let reportTypePage, reportTypeAjax;
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

// Test: one page-load report and one fetch-completion report, 2 reports total
test("web api: fetch", (done) => {
  //GET
  const requestAddress = mockPerformanceResource.fetch.name;

  fetch(requestAddress, {
    method: "GET",
  });

  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetch);

  setTimeout(() => {
    // page performance report payload
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

    // ajax report
    expect(reportTypeAjax.resourceList[0].name).toEqual(requestAddress);
    expect(reportTypeAjax.resourceList[0].options).toEqual(requestAddress.split("?")[1]);
    expect(reportTypeAjax.markUser.length).toBeGreaterThan(0);
    expect(reportTypeAjax.markUv.length).toBeGreaterThan(0);
    done();
  }, 6500);
}, 10000);
