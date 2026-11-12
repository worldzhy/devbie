/* eslint-disable @typescript-eslint/no-require-imports -- jest loads the SDK via CJS require after stubbing console.error */
/**
 * Console capture is opt-in (ADR-042): with default options the SDK must not
 * collect console.error arguments, while still leaving the host console intact.
 */
import "./mock/web.env";
import { ERRORTYPES } from "../src/common/utils";

const hostError = jest.fn();
console.error = hostError;
// Required after the stub so the SDK sees the stub as the previous implementation.
const { default: init } = require("../src/index");

const monitor = init({ api: "http://localhost/report", token: "token_test" });

test("web api: console.error is not collected by default", async () => {
  console.error({ token: "secret-token", password: "secret-password" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(hostError).toHaveBeenCalledTimes(1);
  expect(monitor._conf.errorList.filter((item) => item.type === ERRORTYPES.log).length).toEqual(0);
});
