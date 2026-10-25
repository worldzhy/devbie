/** Simple test cases live directly in this file; larger ones can be split into separate files */
import "./mock/web.env";
import { encryptP } from "../src/common/utils";
import { overrideFetch } from "./mock/utils";
import webMonitorSdk from "../src/index";
const appId = "appid_test";
const monitor = webMonitorSdk({
  appId,
  api: "http://localhost/report",
  token: "token_test",
});

// Override the fetch patched by monitor; verify auto-reporting after a request completes
// Intercept and store reported payloads for assertions in test()
let reportTypePage;
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  // page report
  if (body.type === "PagePerf") {
    reportTypePage = body;
  }
});

const test_uid = "10007",
  test_p = 15198765432;
monitor.setConfig({
  uid: test_uid,
  p: test_p,
});
test("web setConfig", (done) => {
  setTimeout(() => {
    expect(reportTypePage.uid).toEqual(test_uid);
    expect(reportTypePage.p).toEqual(encryptP(test_p));
    done();
  }, 3000);
});

test("web call function: addCustom", () => {});
test("web call function: addError", () => {});
