import { encryptP, isObject } from "./common/utils";
// _conf is a reference type; use with care
import report, { _conf, reportCustomsSoon, reportData } from "./core";
import { InitOptions, ReportType } from "./types";

export function addError(err: { msg: string; col: number; line: number; resourceUrl: string }): void {
  const item = {
    msg: err.msg,
    type: "js",
    data: { col: err.col, line: err.line, resourceUrl: err.resourceUrl },
  };
  (_conf as any).errorList.push(item);
  reportData(ReportType.Error);
}

export function addCustom({
  customName,
  customContent,
  customFilter,
}: {
  customName: string;
  customContent: string | Record<string, any>;
  customFilter?: Record<string, any>;
}): void {
  if (isObject(customContent)) {
    customContent = JSON.stringify(customContent);
  }
  if (customFilter && !isObject(customFilter)) {
    throw new Error("customFilter must be an object");
  }
  (_conf as any).customs.push({ customName, customContent, customFilter });
  reportCustomsSoon();
}

export function setConfig(config: { uid?: string | number; p?: string | number }): void {
  if (!isObject(config)) throw new Error("setConfig parameter must be an object");
  if (config.uid !== undefined) (_conf as any).opt.user.uid = config.uid;
  if (config.p !== undefined) (_conf as any).opt.user.p = encryptP(config.p);
}

export interface InitReturn {
  addError: typeof addError;
  addCustom: typeof addCustom;
  _conf: any;
  setConfig: typeof setConfig;
}

export default function init(options: InitOptions): InitReturn {
  report(options);

  return { addError, addCustom, _conf, setConfig };
}

declare global {
  interface Window {
    _frontendMonitor?: typeof init;
  }
}

if (typeof window !== "undefined") {
  (window as any)._frontendMonitor = init;
}
