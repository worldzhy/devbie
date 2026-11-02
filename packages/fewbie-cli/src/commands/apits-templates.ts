// File contents scaffolded by `fewbie apits`. They live as TypeScript
// modules (rather than copied asset files) so they are compiled into dist
// and need no runtime asset resolution.

/**
 * The apits generator is consumed as a project dev dependency (not bundled
 * with the CLI) so users own the tool version and can rerun it manually.
 * The canonical artifact is `@devbie/apits` (merged into this monorepo by
 * ADR-015, bin also named `apits`); the legacy unscoped `apits-gen` line and
 * `open-api-typescript-request-generator` are no longer scaffolded.
 */
export const GENERATOR_PACKAGE_NAME = "@devbie/apits";
export const GENERATOR_PACKAGE_SPEC = "@devbie/apits@^1.2.1";

export const CONFIG_PROJECT_PATH = "apits.config.ts";
export const API_CLIENT_PROJECT_PATH = "src/lib/api-client.ts";
export const ADAPTER_PROJECT_PATH = "src/api/request.ts";
export const DEFAULT_OUTPUT_DIR = "src/api/_gen";
export const DEFAULT_GENERATED_NAME = "api";
export const PUBLIC_BASE_URL_ENV = "NEXT_PUBLIC_BASE_URL";

/** Escape a value for embedding inside a single-quoted TS string literal. */
function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** apits.config.ts written on the first `fewbie apits <input>` run. */
export function renderApitsConfig(input: string): string {
  const safeInput = escapeSingleQuoted(input);
  return `import { defineConfig } from '${GENERATOR_PACKAGE_NAME}';

// Scaffolded by \`fewbie apits\`. The generator owns this file afterwards:
// add more OpenAPI sources here and select one with \`fewbie apits -n <name>\`.
export default defineConfig([
  {
    // OpenAPI document source: an http(s) URL or a local JSON/YAML file.
    // API_JSON lets you point at a local snapshot for one-off generation.
    input: process.env.API_JSON || '${safeInput}',
    output: '${DEFAULT_OUTPUT_DIR}',
    name: '${DEFAULT_GENERATED_NAME}',
    // Emit baseURL as runtime code reading the public env var (browser code
    // can only read NEXT_PUBLIC_* variables).
    baseURL: '[code]:process.env.${PUBLIC_BASE_URL_ENV}',
    // Generate against the fewbie api-client adapter; providing this import
    // also suppresses the generator's own request.ts scaffold.
    clientImportTemplate: () => "import { request } from '../request'",
  },
]);
`;
}

/**
 * src/api/request.ts adapter. Generated code calls
 *   request.get<RequestType, ResponseType>(url, { params | data, ...extra })
 * while the fewbie apiClient takes the body type only, takes POST/PUT/PATCH
 * payloads as a positional argument and resolves to the response body.
 */
export const ADAPTER_CONTENT = `/**
 * Adapter between generated API code and the fewbie api client.
 *
 * Scaffolded by \`fewbie apits\` and never overwritten afterwards — edit it
 * freely (for example to unwrap a { code, data } response envelope).
 */
import type { AxiosRequestConfig } from "axios";

import { apiClient } from "@/lib/api-client";

type GeneratedMethod = <Req, Res>(
  url: string,
  config?: AxiosRequestConfig,
) => Promise<Res>;

// The generator puts POST/PUT/PATCH payloads on config.data; the fewbie
// apiClient takes the body as a separate positional argument.
function withBodyData(
  call: (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => Promise<unknown>,
): GeneratedMethod {
  return (url, config) => {
    const { data, ...rest } = config ?? {};
    return call(url, data, rest) as Promise<never>;
  };
}

// HEAD/OPTIONS carry no response body; return the full AxiosResponse so
// status and headers remain observable.
function responseOnly(
  call: (url: string, config?: AxiosRequestConfig) => Promise<unknown>,
): GeneratedMethod {
  return (url, config) => call(url, config) as Promise<never>;
}

export interface GeneratedRequest {
  get: GeneratedMethod;
  post: GeneratedMethod;
  put: GeneratedMethod;
  patch: GeneratedMethod;
  delete: GeneratedMethod;
  head: GeneratedMethod;
  options: GeneratedMethod;
}

export const request: GeneratedRequest = {
  get: (url, config) => apiClient.get(url, config) as Promise<never>,
  delete: (url, config) => apiClient.delete(url, config) as Promise<never>,
  head: responseOnly((url, config) => apiClient.head(url, config)),
  options: responseOnly((url, config) => apiClient.options(url, config)),
  post: withBodyData((url, data, config) => apiClient.post(url, data, config)),
  put: withBodyData((url, data, config) => apiClient.put(url, data, config)),
  patch: withBodyData((url, data, config) =>
    apiClient.patch(url, data, config),
  ),
};
`;
