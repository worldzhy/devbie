/** Simple test cases live directly in this file; larger ones can be split into separate files */
import "./mock/web.env";
import { mockErrcodeReportApi, mockPerformanceResource } from "./mock/mock";
import { overrideFetch, httpServer } from "./mock/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
// Start a server to receive requests
httpServer(mockErrcodeReportApi);
/** default env domain; also used as the test instance for errcodeReport and filterUrls */
const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
  errcodeReport(res) {
    if (
      Object.prototype.toString.call(res) === "[object Object]" &&
      res.hasOwnProperty("errcode") &&
      res.errcode !== 0
    ) {
      return { isReport: true, errMsg: res.errmsg, code: res.errcode };
    }
    return { isReport: false };
  },
});
/**
 * errcodeReport
 */
let errcodeReportData;
// Override to avoid actually sending report data
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  // ajax and errcodeReport fire together
  if (body.type === "AjaxPerf") {
    errcodeReportData = body;
  }
});

/** options.errcodeReport custom business API error reporting */
test("web options: errcodeReport", (done) => {
  fetch(mockErrcodeReportApi.api, {
    method: "GET",
  }).then((_res) => {});
  // After sending requests, simulate the browser performance data observer
  window.mockPerformanceEntriesAdd(mockPerformanceResource.fetchErrcode);
  setTimeout(() => {
    expect(errcodeReportData.resourceList.length).toEqual(1);
    expect(errcodeReportData.errorList.length).toEqual(1);
    expect(errcodeReportData.errorList[0].msg).toEqual(mockErrcodeReportApi.res.errmsg);
    expect(errcodeReportData.errorList[0].data.status).toEqual(mockErrcodeReportApi.res.errcode);

    done();
  }, 3000);
});
