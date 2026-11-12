import "./mock/web.env";
import { ERROR_APIS, ERRORTYPES } from "../src/common/utils";
import init from "../src/index";

const monitor = init({ api: "http://localhost/report", token: "token_test" });

function rejectWith(reason) {
  const before = monitor._conf.errorList.length;
  const event = new Event("unhandledrejection");
  event.reason = reason;
  window.dispatchEvent(event);
  expect(monitor._conf.errorList.length).toEqual(before + 1);
  return monitor._conf.errorList[monitor._conf.errorList.length - 1];
}

/**
 * A reason without a stack is arbitrary host data. Only whitelisted scalars may
 * reach the payload — the credentials an app happens to put next to its business
 * code must never be stored.
 */
test("web api: rejection reason is summarized, credentials are dropped", () => {
  const item = rejectWith({
    code: 401,
    message: "登录已过期",
    token: "SECRET_TOKEN_VALUE",
    password: "SECRET_PASSWORD_VALUE",
    data: { accessKey: "SECRET_ACCESS_KEY" },
  });

  expect(item.type).toEqual(ERRORTYPES.promiseRejection);
  expect(item.api).toEqual(ERROR_APIS.unhandledRejection);
  expect(item.msg).toContain("code: 401");
  expect(item.msg).toContain("message: 登录已过期");
  expect(item.msg).not.toContain("SECRET_TOKEN_VALUE");
  expect(item.msg).not.toContain("SECRET_PASSWORD_VALUE");
  expect(item.msg).not.toContain("SECRET_ACCESS_KEY");
});

test("web api: rejection reason keeps no payload subtree", () => {
  const item = rejectWith({ code: 500, payload: { cookie: "SECRET_COOKIE" } });
  expect(item.msg).toEqual("code: 500");
});

test("web api: circular rejection reason does not throw", () => {
  const circular = { name: "CircularError" };
  circular.self = circular;
  const item = rejectWith(circular);
  expect(item.msg).toEqual("name: CircularError");
});

test("web api: symbol rejection reason does not throw", () => {
  const item = rejectWith(Symbol("boom"));
  expect(item.msg).toBe("Symbol(boom)");
});

test("web api: array rejection reason is not serialized", () => {
  const item = rejectWith([{ token: "SECRET" }, { token: "SECRET" }]);
  expect(item.msg).toEqual("[array:2]");
});
