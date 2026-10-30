/** Unit coverage for the default-off capture / redact / truncation helpers. */
import "./mock/web.env";
import { reportUrl, sanitizeText, truncateText } from "../src/utils";

test("reportUrl strips query and fragment unless capture is enabled", () => {
  const url = "https://api.test/users?token=secret&page=1#frag";
  expect(reportUrl(url, false)).toEqual("https://api.test/users");
  expect(reportUrl(url, true)).toEqual(url);
});

test("reportUrl still runs the redact hook on kept URLs", () => {
  const redact = (value) => value.replace(/secret/g, "***");
  expect(reportUrl("https://api.test/users?token=secret", true, redact)).toEqual("https://api.test/users?token=***");
});

test("sanitizeText redacts then truncates captured text", () => {
  const redact = (value, kind) => `${kind}:${value.replace(/password=\w+/g, "password=***")}`;
  const out = sanitizeText(`password=hunter2 ${"y".repeat(2000)}`, "body", 100, redact);
  expect(out.startsWith("body:password=***")).toEqual(true);
  expect(out.indexOf("hunter2")).toEqual(-1);
  expect(out.endsWith("…(truncated)")).toEqual(true);
});

test("truncateText keeps short text untouched", () => {
  expect(truncateText("short", 10)).toEqual("short");
  expect(truncateText("0123456789abc", 10)).toEqual("0123456789…(truncated)");
});
