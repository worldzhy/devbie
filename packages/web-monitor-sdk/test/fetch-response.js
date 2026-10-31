/**
 * Fetch interception must not read response bodies for JSON-less responses:
 * business errcodes are only parsed for JSON content types, response size
 * comes from PerformanceResourceTiming, and every 2xx completion still settles
 * the fetch timing so an ajax report is emitted.
 */
import "./mock/web.env";
import { overrideFetch, httpServer, waitFor } from "./mock/utils";
import webMonitorSdk from "../src/index";

const appId = "appid_test";
const createdApi = {
  api: "http://localhost:8993/created",
  port: 8993,
  path: "/created",
  statusCode: 201,
  body: JSON.stringify({ errcode: 7, errmsg: "created-but-errored" }),
};
const plainTextApi = {
  api: "http://localhost:8992/plain-text",
  port: 8992,
  path: "/plain-text",
  contentType: "text/plain",
  body: JSON.stringify({ errcode: 8, errmsg: "must-not-be-inspected" }),
};

const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
  errcodeReport(res) {
    if (res && res.errcode !== 0) {
      return { isReport: true, errMsg: res.errmsg, code: res.errcode };
    }
    return { isReport: false };
  },
});

httpServer(createdApi);
httpServer(plainTextApi);

let pageReportArrived = false;
let ajaxReport;
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  if (body.type === "PagePerf") pageReportArrived = true;
  if (body.type === "AjaxPerf") ajaxReport = body;
});

function asPerformanceEntry(api) {
  return {
    name: api,
    entryType: "resource",
    startTime: 0,
    duration: 100,
    initiatorType: "fetch",
    nextHopProtocol: "h2",
    transferSize: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    serverTiming: [],
    workerTiming: [],
  };
}

test("web api: fetch inspects JSON errcodes only and leaves the body to the caller", async () => {
  await waitFor(() => pageReportArrived, 8000);

  const [createdRes] = await Promise.all([
    fetch(createdApi.api, { method: "GET" }),
    fetch(plainTextApi.api, { method: "GET" }),
  ]);
  window.mockPerformanceEntriesAdd(asPerformanceEntry(createdApi.api));
  window.mockPerformanceEntriesAdd(asPerformanceEntry(plainTextApi.api));

  // The caller still owns the body: the SDK handed back the original response
  // instead of consuming it.
  const payload = await createdRes.json();
  expect(payload.errcode).toEqual(7);

  await waitFor(() => ajaxReport && ajaxReport.resourceList.length === 2, 8000);

  // 201 is a valid 2xx, so the fetch timing still settles and the two requests
  // land in a single ajax report.
  expect(ajaxReport.resourceList.map((item) => item.name).sort()).toEqual([createdApi.api, plainTextApi.api].sort());
  // Only the JSON response is inspected for business errcodes.
  expect(ajaxReport.errorList.length).toEqual(1);
  expect(ajaxReport.errorList[0].msg).toEqual("created-but-errored");
  expect(ajaxReport.errorList[0].data.status).toEqual(7);
}, 20000);
