/** Simple test cases live directly in this file; larger ones can be split into separate files */
import "./mock/web.env";
import { mockOnerrorInfo } from "./mock/mock";
import { overrideFetch, waitFor } from "./mock/utils";
import { ERRORTYPES, ERROR_APIS } from "../src/common/utils";
import init from "../src/index";
const _monitor = init({
  api: "http://localhost/report",
  token: "token_test",
  captureConsoleError: true,
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
    expect(reportTypeError[0].errorList.length).toEqual(1);
    expect(reportTypeError[0].errorList[0].msg).toEqual(errMsg);
    expect(reportTypeError[0].errorList[0].type).toEqual(ERRORTYPES.log);
    expect(reportTypeError[0].errorList[0].api).toEqual(ERROR_APIS.consoleError);
    expect(reportTypeError[0].errorList[0].data.resourceUrl).toBeDefined();
    done();
  }, 3500);
}, 6000);
test("web api: onerror", (done) => {
  window.onerror.apply(window, mockOnerrorInfo);
  setTimeout(() => {
    // page error report payload
    expect(reportTypeError[1].errorList.length).toEqual(1);
    expect(reportTypeError[1].errorList[0].msg.indexOf("xx is not defined")).not.toEqual(-1);
    expect(reportTypeError[1].errorList[0].type).toEqual(ERRORTYPES.script);
    expect(reportTypeError[1].errorList[0].api).toEqual(ERROR_APIS.onerror);
    expect(reportTypeError[1].errorList[0].data.resourceUrl).toBeDefined();
    done();
  }, 3500);
}, 6000);

/**
 * ADR-050: a stack-bearing console call is console output, not a runtime crash.
 * It must be reported as `log` so the first-seen signal (which only accepts
 * runtime sources) does not page on library diagnostics, while the stack and
 * position stay in the payload for diagnosis.
 */
test("web api: console.error(Error) stays log", async () => {
  const before = reportTypeError.length;
  // `mockOnerrorInfo[4]` is a real Error carrying a parseable V8 stack.
  const error = mockOnerrorInfo[4];
  console.error(error);
  await waitFor(() => reportTypeError.length > before);
  const item = reportTypeError[before].errorList[0];
  expect(item.type).toEqual(ERRORTYPES.log);
  expect(item.api).toEqual(ERROR_APIS.consoleError);
  expect(item.data.line).toBeDefined();
}, 6000);

/**
 * ADR-050: resource load failures carry their own source (`resource-error`) so
 * they no longer masquerade as `onerror` runtime crashes. The collector buffers
 * the row until the next report flush, so the assertion reads the buffer.
 */
test("web api: resource load error", () => {
  const img = document.createElement("img");
  img.src = "http://localhost/missing.png";
  document.body.appendChild(img);
  img.dispatchEvent(new Event("error"));
  const buffered = _monitor._conf.errorList.filter((item) => item.type === ERRORTYPES.resource);
  expect(buffered.length).toEqual(1);
  expect(buffered[0].api).toEqual(ERROR_APIS.resourceError);
  expect(buffered[0].data.resourceUrl).toEqual("http://localhost/missing.png");
}, 6000);
