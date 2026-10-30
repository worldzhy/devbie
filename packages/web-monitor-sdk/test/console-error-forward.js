/* eslint-disable @typescript-eslint/no-require-imports -- jest loads the SDK via CJS require after stubbing console.error */
/**
 * The SDK wraps console.error to collect reports, but it must still forward the
 * call to the host console — swallowing one-argument Error calls hid the
 * developer's own diagnostics.
 */
import "./mock/web.env";

const hostError = jest.fn();
console.error = hostError;
// Required after the stub so the SDK captures it as the previous implementation.
const { default: init } = require("../src/index");

init({ appId: "appid_test", api: "http://localhost/report", token: "token_test" });

test("web api: console.error forwards a single Error to the host console", () => {
  const error = new Error("must reach the host console");
  console.error(error);
  expect(hostError).toHaveBeenCalledTimes(1);
  expect(hostError.mock.calls[0][0]).toBe(error);
});
