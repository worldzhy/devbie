import "./mock/web.env";
import { mockPerformanceResource, mockHttpStatusError } from "./mock/mock";
import { overrideFetch, httpServer, waitFor } from "./mock/utils";
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
let pageReportArrived = false;
let reportData;
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  // page report
  if (body.type === "PagePerf") {
    pageReportArrived = true;
  }
  // ajax report
  if (body.type === "AjaxPerf") {
    reportData = body;
  }
});

// Two phases: in an already-loaded document the initial page report fires
// first; only ajax traffic after it is collected into an AjaxPerf report.
test("web api: fetch http error 404", async () => {
  await waitFor(() => pageReportArrived, 8000);

  const requestAddress = mockPerformanceResource.fetchHttpErr.name;

  // Two failing requests -> two errorList entries in one ajax report
  fetch(requestAddress, {
    method: "GET",
  }).then((_res) => {});
  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetchHttpErr);
  fetch(requestAddress, {
    method: "GET",
  }).then((_res) => {});
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetchHttpErr);

  await waitFor(() => reportData, 8000);
  expect(reportData.resourceList.length).toEqual(2);
  expect(reportData.errorList.length).toEqual(2);
  expect(reportData.errorList[0].data.status).toEqual(mockHttpStatusError.statuscode);
}, 20000);
