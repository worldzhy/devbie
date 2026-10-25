/**
 * Framework integrations (React/Next) mount the SDK after hydration, so the
 * window `load` event may already have fired before init() runs. The SDK must
 * still emit the first page report in that case.
 */
import "./mock/web.env";
import { overrideFetch, waitFor } from "./mock/utils";

function initAfterWindowLoad(options, reports) {
  overrideFetch(function () {
    reports.push(JSON.parse(arguments[1].body));
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after readyState is forced
  const init = require("../src/index").default;
  init({ appId: "appid_test", api: "http://localhost/report", token: "token_test", ...options });
}

test("reports PagePerf when initialized after the window load event", async () => {
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  const reports = [];
  initAfterWindowLoad({}, reports);
  await waitFor(() => reports.some((report) => report.type === "PagePerf"));
});
