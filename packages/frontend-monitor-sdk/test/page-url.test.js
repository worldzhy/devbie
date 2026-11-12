/** Page-level reports must not leak query strings or fragments (R36-02). */
import "./mock/web.env";
import init from "../src/index";
import { overrideFetch, waitFor } from "./mock/utils";

let pageBody;
overrideFetch(function () {
  const body = JSON.parse(arguments[1].body);
  if (body.type === "PagePerf") pageBody = body;
});

test("page report strips the query string and fragment from location.href", async () => {
  window.history.replaceState({}, "", "/projects/1?token=secret#frag");
  init({ api: "http://localhost/report", token: "token_test" });
  await waitFor(() => pageBody);
  expect(pageBody.url).toEqual("http://localhost/projects/1");
});
