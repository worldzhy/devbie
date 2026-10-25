import "./mock/web.env";
import { mockPerformanceResource, mockHttpStatusError } from "./mock/mock";
import { overrideFetch, httpServer } from "./mock/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
});
// Start a server to receive requests
httpServer(mockHttpStatusError);

// Override the fetch patched by monitor; verify auto-reporting after a request completes
// Intercept and store reported payloads for assertions in test()
let reportData;
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  // ajax report
  if (body.type === "AjaxPerf") {
    reportData = body;
  }
});

// Test: one page-load report and one fetch-completion report, 2 reports total
test("web api: fetch http error 404", (done) => {
  //GET
  const requestAddress = mockPerformanceResource.fetchHttpErr.name;

  fetch(requestAddress, {
    method: "GET",
  }).then((_res) => {});

  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetchHttpErr);
  fetch(requestAddress, {
    method: "GET",
  }).then((_res) => {});

  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetchHttpErr);

  setTimeout(() => {
    expect(reportData.resourceList.length).toEqual(2);
    expect(reportData.errorList.length).toEqual(2);
    expect(reportData.errorList[0].data.status).toEqual(mockHttpStatusError.statuscode);
    done();
  }, 6500);
}, 10000);
