export * from "json-schema";
import { JSONSchema4 } from "json-schema";
import { OpenAPIV3 } from "openapi-types";
import { ParsedPath } from "path";

/** Returns the client import snippet placed at the top of each generated file. */
export type ClientImportTemplate = () => string;

/** A single API operation parsed from the OpenAPI document. */
export interface ApiInterface {
  /** Interface name */
  title: string;
  /** Request path */
  path: string;
  /** Request method, HEAD and OPTIONS are handled like GET, others like POST */
  method: Method;
  /** Path parameters */
  pathParams: Array<{
    /** Name */
    name: string;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Type (YApi-X) */
    type?: RequestParamType;
  }>;
  /** GET only: query string */
  queryParams: Array<{
    /** Name */
    name: string;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Required */
    required: Required;
    /** Type (YApi-X) */
    type?: RequestQueryType;
  }>;
  /** POST only: request content type. No special handling needed for text, file, raw. */
  requestBodyType: RequestBodyType;
  /** Request content when `requestBodyType = form` */
  requestBodyForm: Array<{
    /** Name */
    name: string;
    /** Type */
    type: RequestFormItemType;
    /** Description */
    desc: string;
    /** Example */
    example: string;
    /** Required */
    required: Required;
    /**
     * Whether the field accepts multiple files (a binary array in the
     * OpenAPI schema, e.g. `files: {type: 'array', items: {format: 'binary'}}`).
     * Only meaningful when `type` is `file`.
     */
    isArray?: boolean;
    /** Allowed literal values when the form field is an enum */
    enum?: Array<string | number>;
  }>;
  /**
   * Whether the form body is `multipart/form-data` (true) or
   * `application/x-www-form-urlencoded` (false). Only set when
   * `requestBodyType = form`.
   */
  requestBodyMultipart?: boolean;
  /** JSON-stringified request body schema when `requestBodyType = json` */
  requestBodySchema: string;
  /** Response data type */
  responseBodyType: ResponseBodyType;
  /** Response data (JSON-stringified schema, or the raw description when no schema exists) */
  responseBody: string;
}

/** Request method */
export enum Method {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
  PATCH = "PATCH",
}

/** Required */
export enum Required {
  /** Not required */
  false = "0",
  /** Required */
  true = "1",
}

/** Request body type */
export enum RequestBodyType {
  /** Query string */
  query = "query",
  /** Form */
  form = "form",
  /** JSON */
  json = "json",
  /** Plain text */
  text = "text",
  /** File */
  file = "file",
  /** Raw data */
  raw = "raw",
  /** No request data */
  none = "none",
}

/** Request path parameter type */
export enum RequestParamType {
  /** String */
  string = "string",
  /** Number */
  number = "number",
}

/** Request query parameter type */
export enum RequestQueryType {
  /** String */
  string = "string",
  /** Number */
  number = "number",
}

/** Request form item type */
export enum RequestFormItemType {
  /** Plain text */
  text = "text",
  /** File */
  file = "file",
}

/** Response body type */
export enum ResponseBodyType {
  /** JSON */
  json = "json",
  /** Plain text */
  text = "text",
  /** XML */
  xml = "xml",
  /** Raw data */
  raw = "raw",
}

/** ApiInterface enriched with the parsed request path. */
export interface ExtendedApiInterface extends ApiInterface {
  parsedPath: ParsedPath;
}

/**
 * Generator configuration for one OpenAPI source.
 */
export interface ApiConfig {
  /**
   * The OpenAPI document to generate code from. Required.
   *
   * Accepts an http(s) URL or a local file path. Local files may be
   * JSON (.json / .json5) or YAML (.yaml / .yml).
   *
   * @example 'http://localhost:3041/api-json'
   * @example './openapi.json'
   * @example './docs/openapi.yaml'
   */
  input: string;
  /**
   * Output directory for generated files (relative or absolute path).
   *
   * Two files are written into it: `<name>.ts` (type declarations and
   * request functions) and `request.ts` (the axios client, unless
   * `client` is false or the file already exists).
   *
   * @default 'src/api'
   */
  output?: string;
  /**
   * Base name of the generated types file: code is written to
   * `<output>/<name>.ts`. Also serves as the source identifier for
   * `apits gen -n <name>` filtering.
   *
   * Defaults to a name derived from `input`: the URL hostname
   * (`http://localhost:3041/api-json` -> `localhost`) or the local file
   * name without extension (`./user.openapi.yaml` -> `userOpenapi`).
   * Duplicated derived names get an index suffix.
   */
  name?: string;
  /**
   * Runtime `baseURL` baked into every generated request function.
   *
   * Prefix with `[code]:` to emit the value as code instead of a string
   * literal, e.g. to read from an env var at runtime:
   *
   * - `baseURL: '[code]:process.env.BASE_URL'` -> `baseURL: process.env.BASE_URL`
   * - `baseURL: 'http://localhost:3000'`       -> `baseURL: "http://localhost:3000"`
   *
   * May also be a function receiving each API path and returning the
   * baseURL to use for that path (or undefined to omit).
   */
  baseURL?: ((path: string) => string | undefined) | string;
  /**
   * Returns the import snippet placed at the top of every generated file —
   * use it to point at a custom request client instead of the scaffolded
   * `request.ts`.
   *
   * Providing this option also flips the default of `client` to `false`,
   * so no unused `request.ts` is scaffolded; set `client: true` explicitly
   * to keep both.
   *
   * @default () => "import request from './request'"
   */
  clientImportTemplate?: ClientImportTemplate;
  /**
   * Type used for the `extra` argument of every generated request
   * function — the object spread into the underlying client call as
   * per-request overrides (headers, signal, `responseType`, ...).
   *
   * Defaults to `AxiosRequestConfig`, in which case each generated file
   * also imports that type from `axios`. When using a custom client via
   * `clientImportTemplate`, set this to that client's config type and
   * make sure `clientImportTemplate` imports it, e.g.:
   *
   * ```ts
   * clientImportTemplate: () => "import {request, type RequestConfig} from '../fetch'",
   * clientConfigType: 'RequestConfig',
   * ```
   *
   * @default 'AxiosRequestConfig'
   */
  clientConfigType?: string;
  /**
   * Whether to scaffold the default axios request client into
   * `<output>/request.ts` (skipped when that file already exists).
   *
   * Defaults to `true`, and to `false` when `clientImportTemplate` is
   * provided without an explicit `client` value.
   *
   * @default true
   */
  client?: boolean;
}

/** Generator config resolved with the document's `components` for `$ref` lookups. */
export type ResolvedConfig = Partial<
  ApiConfig & {
    components: OpenAPIV3.Document["components"];
  }
>;

/** Configuration. */
export type Config = ApiConfig;

/**
 * Request configuration.
 */
export interface RequestConfig<
  Path extends string = string,
  ParamName extends string = string,
  QueryName extends string = string,
  RequestDataOptional extends boolean = boolean,
> {
  /** Interface path, starting with `/` */
  path: Path;
  /** Request method */
  method: Method;
  /** Request headers, all headers except Content-Type */
  requestHeaders: Record<string, string>;
  /** Request body type */
  requestBodyType: RequestBodyType;
  /** Response body type */
  responseBodyType: ResponseBodyType;
  /** List of path parameter names */
  paramNames: ParamName[];
  /** List of query parameter names */
  queryNames: QueryName[];
  /** Whether request data is optional */
  requestDataOptional: RequestDataOptional;
  /** JSON Schema for request data (only effective when JSON Schema generation is enabled) */
  requestDataJsonSchema: JSONSchema4;
  /** JSON Schema for response data (only effective when JSON Schema generation is enabled) */
  responseDataJsonSchema: JSONSchema4;
  /** Request function name */
  requestFunctionName: string;
}

/**
 * Request parameters.
 */
export interface RequestFunctionParams extends RequestConfig {
  /** Raw data */
  rawData: Record<string, any>;
  /** Request data, excluding file data */
  data: Record<string, any>;
  /** Whether there is file data */
  hasFileData: boolean;
  /** Request file data */
  fileData: Record<string, any>;
  /** All request data, including data and fileData */
  allData: Record<string, any>;
  /** Get FormData instance for all request data (including files) */
  getFormData: () => FormData;
}

/** Additional parameters of the request function */
export type RequestFunctionRestArgs<T extends (...args: any[]) => any> = T extends (
  payload: any,
  ...args: infer R
) => any
  ? R
  : never;

/** Property definition */
export interface PropDefinition {
  /** Property name */
  name: string;
  /** Required */
  required: boolean;
  /** Type */
  type: JSONSchema4["type"];
  /** Comment */
  comment: string;
  /** Whether the property is an array (used for multi-file upload fields) */
  isArray?: boolean;
  /** Allowed literal values for enum properties */
  enum?: Array<string | number>;
}

/** Property definition list */
export type PropDefinitions = PropDefinition[];

/** Request function body generation template function */
export interface RequestFunctionTemplateProps {
  baseURL?: string;
  requestFunctionName: string;
  requestDataTypeName: string;
  extendedInterfaceInfo: ExtendedApiInterface;
  responseDataTypeName: string;
}
