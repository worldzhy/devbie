import type { AppendOptions } from "form-data";
import type { Config, RequestConfig, RequestFunctionParams } from "./types";

/**
 * Normalize user configuration into a config array and apply built-in
 * defaults.
 *
 * Defaults:
 * - `output` falls back to `src/api`.
 * - `client` falls back to `true`, except when a custom
 *   `clientImportTemplate` is provided without an explicit `client` value —
 *   in that case the scaffolded client is skipped automatically, otherwise
 *   the generated `request.ts` would be dead code (the generated file
 *   imports the custom client instead).
 *
 * @param config Configuration
 */
export function defineConfig(config: Config | Config[]): Config[] {
  const configs = config instanceof Array ? config : [config];
  const final: Config[] = configs.map((item) => {
    const client = "client" in item ? item.client : item.clientImportTemplate ? false : true;
    return {
      output: "src/api",
      client,
      ...item,
    };
  });
  return final;
}

export class FileData<T = any> {
  /**
   * Original file data.
   */
  private originalFileData: T;

  /**
   * Options.
   */
  private options: AppendOptions | undefined;

  /**
   * File data helper class, unified file upload for web, mini-program and other platforms.
   *
   * @param originalFileData Original file data
   * @param options If using internal getFormData, options will be used by it
   */
  public constructor(originalFileData: T, options?: AppendOptions) {
    this.originalFileData = originalFileData;
    this.options = options;
  }

  /**
   * Get original file data.
   *
   * @returns Original file data
   */
  public getOriginalFileData(): T {
    return this.originalFileData;
  }

  /**
   * Get options.
   */
  public getOptions(): AppendOptions | undefined {
    return this.options;
  }
}

/**
 * Parse request data, separating normal data and file data from request data.
 *
 * @param [requestData] Request data to parse
 * @returns Object containing normal data (data) and file data (fileData), when data and fileData are empty objects, it means no such data exists
 */
export function parseRequestData(requestData?: any): { data: any; fileData: any } {
  const result = {
    data: {} as any,
    fileData: {} as any,
  };
  /* istanbul ignore else */
  if (requestData != null) {
    if (typeof requestData === "object" && !Array.isArray(requestData)) {
      Object.keys(requestData).forEach((key) => {
        if (requestData[key] && requestData[key] instanceof FileData) {
          result.fileData[key] = (requestData[key] as FileData).getOriginalFileData();
        } else {
          result.data[key] = requestData[key];
        }
      });
    } else {
      result.data = requestData;
    }
  }
  return result;
}

/**
 * Prepare parameters to be passed to the request function.
 */
export function prepare(requestConfig: RequestConfig, requestData: any): RequestFunctionParams {
  let requestPath: string = requestConfig.path;
  const { data, fileData } = parseRequestData(requestData);
  const dataIsObject = data != null && typeof data === "object" && !Array.isArray(data);
  if (dataIsObject) {
    // Replace path parameters
    if (Array.isArray(requestConfig.paramNames) && requestConfig.paramNames.length > 0) {
      Object.keys(data).forEach((key) => {
        if (requestConfig.paramNames.indexOf(key) >= 0) {
          // ref: https://github.com/YMFE/yapi/blob/master/client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js#L465
          requestPath = requestPath
            .replace(new RegExp(`\\{${key}\\}`, "g"), data[key])
            .replace(new RegExp(`/:${key}(?=/|$)`, "g"), `/${data[key]}`);
          delete data[key];
        }
      });
    }

    // Append query parameters to path
    let queryString = "";
    if (Array.isArray(requestConfig.queryNames) && requestConfig.queryNames.length > 0) {
      Object.keys(data).forEach((key) => {
        if (requestConfig.queryNames.indexOf(key) >= 0) {
          if (data[key] != null) {
            queryString += `${queryString ? "&" : ""}${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`;
          }
          delete data[key];
        }
      });
    }
    if (queryString) {
      requestPath += `${requestPath.indexOf("?") > -1 ? "&" : "?"}${queryString}`;
    }
  }

  // All data
  const allData = {
    ...(dataIsObject ? data : {}),
    ...fileData,
  };

  // Get form data
  const getFormData = () => {
    const useNativeFormData = typeof FormData !== "undefined";
    const useNodeFormData =
      !useNativeFormData &&
      // https://github.com/fjc0k/vtils/blob/master/src/utils/inNodeJS.ts
      typeof global === "object" &&
      typeof global.process === "object" &&
      typeof global.process.versions === "object" &&
      global.process.versions.node != null;
    const UniFormData: typeof FormData | undefined = useNativeFormData
      ? FormData
      : useNodeFormData
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- isomorphic shim: conditional CJS require when native FormData is unavailable
          require("form-data")
        : undefined;
    if (!UniFormData) {
      throw new Error("FormData is not supported in the current environment");
    }
    const formData = new UniFormData();
    Object.keys(data).forEach((key) => {
      formData.append(key, data[key]);
    });
    Object.keys(fileData).forEach((key) => {
      const options = (requestData[key] as FileData).getOptions();
      formData.append(key, fileData[key], useNativeFormData ? options?.filename : (options as any));
    });
    return formData as any;
  };

  return {
    ...requestConfig,
    path: requestPath,
    rawData: requestData,
    data: data,
    hasFileData: fileData && Object.keys(fileData).length > 0,
    fileData: fileData,
    allData: allData,
    getFormData: getFormData,
  };
}

/**
 * Execute an async function queue sequentially.
 */
export async function runSequentially<T = any>(fns: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  for (const fn of fns) {
    results.push(await fn());
  }
  return results;
}
