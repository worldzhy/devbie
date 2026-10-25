/** Simple test cases live directly in this file; larger ones can be split into separate files */
import "./mock/web.env";
import { mockOnerrorInfo } from "./mock/mock";
import { overrideFetch } from "./mock/utils";
import { ERRORTYPES, ERRORAPIS } from "../src/common/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
const _monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
});
// Intercept and store reported payloads for assertions in test()
const reportTypeError = [];
// Override the fetch patched by monitor; verify auto-reporting after a request completes
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  // page report
  if (body.type === "Error") {
    //console.log(body);
    reportTypeError.push(body);
  }
});

test("web api: console.error", (done) => {
  const errMsg = "error test, dont care! ignore this!!!";
  console.error(errMsg);
  setTimeout(() => {
    // page error report payload
    expect(reportTypeError[0].appId).toEqual(appId);
    expect(reportTypeError[0].errorList.length).toEqual(1);
    expect(reportTypeError[0].errorList[0].msg).toEqual(errMsg);
    expect(reportTypeError[0].errorList[0].type).toEqual(ERRORTYPES.log);
    expect(reportTypeError[0].errorList[0].api).toEqual(ERRORAPIS.consoleError);
    expect(reportTypeError[0].errorList[0].data.resourceUrl).toBeDefined();
    done();
  }, 3500);
}, 6000);
test("web api: onerror", (done) => {
  window.onerror.apply(window, mockOnerrorInfo);
  setTimeout(() => {
    // page error report payload
    expect(reportTypeError[1].appId).toEqual(appId);
    expect(reportTypeError[1].errorList.length).toEqual(1);
    expect(reportTypeError[1].errorList[0].msg.indexOf("xx is not defined")).not.toEqual(-1);
    expect(reportTypeError[1].errorList[0].type).toEqual(ERRORTYPES.script);
    expect(reportTypeError[1].errorList[0].api).toEqual(ERRORAPIS.onerror);
    expect(reportTypeError[1].errorList[0].data.resourceUrl).toBeDefined();
    done();
  }, 3500);
}, 6000);
