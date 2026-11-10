import { computeStackTrace } from "../src/common/tracekit";

// V8 stack: the first line is the message header, frames follow with `at `.
const V8_FRAME = "at FacilityChip (http://localhost:3010/_next/static/chunks/app.js:10:5)";
const V8_FRAME_NO_FUNC = "at http://localhost:3010/_next/static/chunks/main.js:20:3";

function v8Error(message) {
  const error = new Error(message);
  error.stack = [`Error: ${message}`, V8_FRAME, V8_FRAME_NO_FUNC].join("\n");
  return error;
}

describe("tracekit gecko parsing", () => {
  // The header line must never be parsed as a frame. When the message itself
  // carries a link, the old optional `@` let the URL end of the header become
  // `stack[0]`, so the SDK reported the link as `resourceUrl` with no line.
  test("skips the V8 header when the message ends with a URL", () => {
    const stack = computeStackTrace(
      v8Error('Time zone "Asia/Shanghai" not found, see https://next-intl.dev/docs/usage/dates-times'),
    );
    expect(stack.stack[0].url).toBe("http://localhost:3010/_next/static/chunks/app.js");
    expect(stack.stack[0].line).toBe(10);
    expect(stack.stack[0].column).toBe(5);
  });

  test("skips the V8 header when the message contains a URL in the middle", () => {
    const stack = computeStackTrace(v8Error("Failed to load chunk https://example.com/static/chunk.js, retrying"));
    expect(stack.stack[0].url).toBe("http://localhost:3010/_next/static/chunks/app.js");
    expect(stack.stack[0].line).toBe(10);
  });

  test("skips the V8 header when the message carries an email and a URL", () => {
    const stack = computeStackTrace(
      v8Error("Cannot reach ops@example.com, see https://next-intl.dev/docs/usage/dates-times"),
    );
    expect(stack.stack[0].url).toBe("http://localhost:3010/_next/static/chunks/app.js");
    expect(stack.stack[0].line).toBe(10);
  });

  test("keeps the message intact for reporting", () => {
    const message = "Missing time zone, see https://next-intl.dev/docs/usage/dates-times";
    const stack = computeStackTrace(v8Error(message));
    expect(stack.message).toBe(message);
    expect(stack.name).toBe("Error");
  });

  // Real gecko/Safari/React Native frames must keep parsing after tightening
  // the separator: `func@url`, `@url`, a bare `url:line:col`, and `[native code]`.
  test("still parses genuine gecko frames", () => {
    const error = new Error("boom");
    error.stack = [
      "foo@http://localhost:3010/app.js:10:5",
      "@http://localhost:3010/app.js:11:6",
      "http://localhost:3010/app.js:12:7",
      "bar@42.js:13:8",
      "baz@[native code]",
    ].join("\n");
    const stack = computeStackTrace(error);
    expect(stack.stack.map((frame) => [frame.func, frame.url, frame.line, frame.column])).toEqual([
      ["foo", "http://localhost:3010/app.js", 10, 5],
      ["?", "http://localhost:3010/app.js", 11, 6],
      ["?", "http://localhost:3010/app.js", 12, 7],
      ["bar", "42.js", 13, 8],
      ["baz", "[native code]", null, null],
    ]);
  });
});
