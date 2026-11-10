import { ReportType } from "./types";
import { randomString } from "./utils";

export function markUser(type: ReportType): { markUser: string; isFirstIn: boolean } {
  let markUser = sessionStorage.getItem("ps_markUser") || "";
  const isFirstIn = sessionStorage.getItem("ps_isFirstIn") || "";
  const result = { markUser, isFirstIn: false };
  if (!markUser) {
    markUser = randomString();
    sessionStorage.setItem("ps_markUser", markUser);
    result.markUser = markUser;
  }
  if (!isFirstIn && type !== ReportType.Custom) {
    result.isFirstIn = true;
    sessionStorage.setItem("ps_isFirstIn", "1");
  }
  return result;
}

export function markDevice(): string {
  let mkDevice = localStorage.getItem("ps_markDevice") || "";
  if (!mkDevice) {
    mkDevice = randomString(11);
    localStorage.setItem("ps_markDevice", mkDevice);
  }
  return mkDevice;
}

export function markUv(): string {
  const date = new Date();
  let markUv = localStorage.getItem("ps_markUv") || "";
  const datatime = localStorage.getItem("ps_markUvTime") || "";
  const today = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} 23:59:59`;
  if ((!markUv && !datatime) || date.getTime() > Number(datatime)) {
    markUv = randomString();
    localStorage.setItem("ps_markUv", markUv);
    localStorage.setItem("ps_markUvTime", new Date(today).getTime().toString());
  }
  return markUv;
}
