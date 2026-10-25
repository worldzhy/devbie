/**
 * Page reporting must stay enabled when error collection is disabled: the
 * page lifecycle listeners are registered independently of isError.
 */
import "./mock/web.env";
import { overrideFetch, waitFor } from "./mock/utils";

test("reports PagePerf with isError disabled", async () => {
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  const reports = [];
  overrideFetch(function () {
    reports.push(JSON.parse(arguments[1].body));
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after readyState is forced
  const init = require("../src/index").default;
  init({ appId: "appid_test", api: "http://localhost/report", token: "token_test", isError: false });
  await waitFor(() => reports.some((report) => report.type === "PagePerf"));
});
