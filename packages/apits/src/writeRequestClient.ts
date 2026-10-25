import fs from "fs-extra";
import { Config } from "./types";
import { dedent } from "./utils/dedent";
import { getOutputFilePath } from "./utils/outputPath";
import { formatContent, generatedFileBanner } from "./utils/format";

export default async function writeRequestClient(config: Config) {
  const { client } = config;
  if (client === false) return;
  const rawRequestFunctionFilePath = getOutputFilePath(config, "request.ts");
  if (await fs.pathExists(rawRequestFunctionFilePath)) {
    return;
  }

  const content = `
  ${generatedFileBanner()}

  import axios, { AxiosRequestConfig } from 'axios';

  const instance = axios.create({
    withCredentials: true,
  });

  // Custom request interceptor.
  instance.interceptors.request.use((config) => {
    return { ...config };
  });

  // Custom response interceptor — return res.data so the generated request
  // functions receive the response payload directly, matching the RP type.
  instance.interceptors.response.use((res) => {
    const { status } = res;
    if (status >= 200 && status < 300) {
      return res.data;
    }
    return Promise.reject(res);
  });

  export default {
    get: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.get<RP>(url, config) as Promise<RP>;
    },
    post: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.post<RP>(url, undefined, config) as Promise<RP>;
    },
    head: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.head<RP>(url, config) as Promise<RP>;
    },
    put: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.put<RP>(url, undefined, config) as Promise<RP>;
    },
    patch: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.patch<RP>(url, undefined, config) as Promise<RP>;
    },
    delete: <RQ, RP>(url: string, config?: AxiosRequestConfig) => {
      return instance.delete<RP>(url, config) as Promise<RP>;
    },
  };
`;

  await fs.outputFile(rawRequestFunctionFilePath, await formatContent(dedent`${content}`, rawRequestFunctionFilePath));
}
