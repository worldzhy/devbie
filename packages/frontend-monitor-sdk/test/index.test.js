/** Simple test cases live directly in this file; larger ones can be split into separate files */
import "./mock/web.env";
import { overrideFetch } from "./mock/utils";
import init from "../src/index";
const monitor = init({
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

const test_uid = "10007";
monitor.setConfig({
  uid: test_uid,
});
test("web setConfig", (done) => {
  setTimeout(() => {
    expect(reportTypePage.uid).toEqual(test_uid);
    // ADR-044: phone numbers are never collected, so the payload has no `p`.
    expect(reportTypePage).not.toHaveProperty("p");
    // The collector derives the storage partition from the token, so appId must
    // never be part of the report contract again.
    expect(reportTypePage.token).toEqual("token_test");
    expect(reportTypePage).not.toHaveProperty("appId");
    done();
  }, 3000);
});

test("web call function: addCustom", () => {});
test("web call function: addError", () => {});
