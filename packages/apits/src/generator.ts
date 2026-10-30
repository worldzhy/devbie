import * as changeCase from "change-case";
import fs from "fs-extra";
import path from "path";
import yaml from "js-yaml";
import JSON5 from "json5";
import * as logger from "./utils/logger";
import got from "got";
import { OpenAPIV3 } from "openapi-types";
import { openApiToInterfaces } from "./openApiToInterfaces";
import { dedent } from "./utils/dedent";
import {
  Config,
  ExtendedApiInterface,
  ApiInterface,
  ApiConfig,
  ResolvedConfig,
  RequestBodyType,
  RequestFunctionTemplateProps,
} from "./types";
import { getRequestDataJsonSchema, getResponseDataJsonSchema, jsonSchemaToTsCode } from "./jsonSchemaToTsCode";
import { formatContent, generatedFileBanner } from "./utils/format";
import { getOutputFilePath } from "./utils/outputPath";
import writeRequestClient from "./writeRequestClient";

interface OutputFileList {
  [outputFilePath: string]: {
    config: ResolvedConfig;
    content: string[];
  };
}

// Default client import snippet placed at the top of generated files.
function defaultClientImportTemplate(_config?: Config) {
  return `import request from './request'`;
}

const getDataKeySetStr = (method: string) => {
  if (["head", "option", "get"].includes(method.toLowerCase())) {
    return "params: data";
  }
  return "data";
};

// Replace `{param}` placeholders in the path with `${data.param}` so the
// request function can substitute path params from the incoming data object.
function handlePathParam(path: string) {
  if (path.match(/\{(\w+)\}/)) {
    return `\`${path.replace(/\{(\w+)\}/g, "${data.$1}")}\``;
  }

  return JSON.stringify(path);
}

/**
 * Detect whether a generated request type has degraded to a primitive or
 * empty shape. A well-formed request DTO is an object literal or interface
 * reference; these signatures mean the backend did not expose a usable
 * request body schema (missing `@ApiBody({type})`, inline `@Body()` type,
 * or a Prisma type bound to `@Body()`), so the generator fell back to a
 * primitive/empty type. Used to emit a warning so the author can fix the
 * decorator rather than silently shipping `string`/`{}` to the frontend.
 */
function isDegradedRequestType(typeCode: string): boolean {
  // Collapse whitespace so shape-matching regexes are stable regardless of
  // prettier's spacing choices.
  const code = typeCode.replace(/\s+/g, " ").trim();
  // Pull the right-hand side of `export type Name = <body>;`.
  const match = code.match(/^export type \w+ = (.*?);?$/);
  if (!match) return false;
  const body = match[1].trim();
  // Bare primitive / unknown (no body schema inferred at all).
  if (/^(string|unknown|number|boolean|null)$/.test(body)) return true;
  // Empty object literal (schema stripped to nothing).
  if (/^\{\s*\}$/.test(body)) return true;
  // Index signature only — no named fields, just `[k: string]: unknown`.
  if (/^\{\s*\[\s*\w+\s*:\s*string\s*\]\s*:\s*unknown\s*\}$/.test(body)) return true;
  // Path-param merge with a primitive fallback (`{ id: string } & string`).
  if (/&\s*(string|unknown)\b/.test(body)) return true;
  return false;
}
// Default type of the per-request `extra` argument; matches the config
// accepted by the scaffolded axios client.
const DEFAULT_CLIENT_CONFIG_TYPE = "AxiosRequestConfig";

// Default request function body template.
function defaultRequestFunctionTemplate(props: RequestFunctionTemplateProps, config?: ResolvedConfig): string {
  const { baseURL, requestFunctionName, requestDataTypeName, responseDataTypeName, extendedInterfaceInfo } = props;
  const clientConfigType = config?.clientConfigType || DEFAULT_CLIENT_CONFIG_TYPE;
  const { pathParams, queryParams, requestBodyType, requestBodyMultipart, requestBodyForm } = extendedInterfaceInfo;
  const hasData = pathParams.length || queryParams.length || (Array.isArray(requestBodyForm) && requestBodyForm.length);
  const method = extendedInterfaceInfo.method.toLowerCase();
  let finalBaseUrl = "";
  if (baseURL?.match(/^\[code\]:/)) {
    // A `[code]:` prefix means the string should be executed as a code
    // snippet; otherwise it is treated as a literal string.
    finalBaseUrl = baseURL.replace(/^\[code\]:/, "");
  } else {
    finalBaseUrl = `"${baseURL}"`;
  }

  // Form endpoints (multipart or url-encoded) must build a FormData /
  // URLSearchParams at runtime so the underlying client (axios / fetch)
  // auto-sets the correct Content-Type with boundary. Without this, POST
  // form bodies are sent as JSON and the backend never receives the files.
  const isForm = requestBodyType === RequestBodyType.form;
  const isMultipart = isForm && requestBodyMultipart === true;
  const formBuilder = isForm
    ? `const form = new ${isMultipart ? "FormData" : "URLSearchParams"}();
    Object.entries(data).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach(i => form.append(k, ${isMultipart ? "i" : "String(i)"}));
      else form.append(k, ${isMultipart ? "v" : "String(v)"});
    });`
    : "";
  const dataExpr = isForm ? "data: form" : getDataKeySetStr(method);

  return `export const ${requestFunctionName} = (data${
    hasData ? "" : "?"
  }: ${requestDataTypeName}${`,extra?:${clientConfigType}`}) => {
    ${formBuilder}
    return request.${method}<${requestDataTypeName},${responseDataTypeName}>(${handlePathParam(
      extendedInterfaceInfo.path,
    )}, {
      ${dataExpr},
      ${baseURL ? `baseURL: ${finalBaseUrl},` : ""}
      ${`...extra`}
    })
  }`;
}

export class Generator {
  /** Generator configuration. */
  private config: ApiConfig;

  constructor(config: Config) {
    // `config` may be an object or an array; store it as-is.
    this.config = config;
  }

  /** Whether an input points to a remote http(s) resource. */
  private static isHttpInput(input: string): boolean {
    return /^https?:\/\//i.test(input);
  }

  /**
   * Derive a file base name from the input: hostname for URLs, file name
   * without extension for local paths. Falls back to `api`.
   */
  static deriveName(input: string): string {
    let raw = "";
    if (Generator.isHttpInput(input)) {
      try {
        raw = new URL(input).hostname.replace(/^www\./, "");
      } catch {
        raw = "";
      }
    } else {
      raw = path.basename(input).replace(/\.(json5?|ya?ml)$/i, "");
    }
    return changeCase.camelCase(raw) || "api";
  }

  /** Parse a raw JSON / JSON5 / YAML document string. */
  private parseSpecDocument(raw: string): OpenAPIV3.Document {
    const head = raw.trimStart();
    if (head.startsWith("{") || head.startsWith("[")) {
      return JSON5.parse(raw);
    }
    return yaml.load(raw) as OpenAPIV3.Document;
  }

  /**
   * Load the OpenAPI document from a remote URL or a local file.
   * Both JSON (.json/.json5) and YAML (.yaml/.yml) are supported.
   */
  async loadSpec(input: string): Promise<OpenAPIV3.Document> {
    if (Generator.isHttpInput(input)) {
      const res = await got.get(input, { responseType: "text" });
      return this.parseSpecDocument(res.body);
    }
    const filePath = path.resolve(input);
    const raw = await fs.readFile(filePath, "utf-8");
    return this.parseSpecDocument(raw);
  }

  /**
   * Generate all code from the OpenAPI document.
   * @returns map of output file path to file contents
   */
  async generate(): Promise<OutputFileList> {
    const outputFileList: OutputFileList = Object.create(null);

    const { input, name } = this.config;
    const typesName = name || Generator.deriveName(input);
    const openApiV3Json = await this.loadSpec(input);

    // Generate TypeScript interfaces for every schema declared under
    // `components.schemas`. Use optional chaining: a valid OpenAPI document
    // may omit `components` entirely (e.g. APIs with only path parameters
    // and no schemas); without this guard generation would throw and abort.
    const componentsSchemas = openApiV3Json.components?.schemas ?? {};
    const componentsCode: string[] = [];
    await Promise.all(
      Object.keys(componentsSchemas).map(async (key) => {
        const code = await jsonSchemaToTsCode({ ...componentsSchemas[key], components: openApiV3Json.components }, key);
        componentsCode.push(code);
      }),
    );

    // Convert the OpenAPI document into the internal interface list.
    const allApi = await openApiToInterfaces(openApiV3Json);

    const interfaceList = allApi.interfaces;

    const categoryCode: string[] = [...componentsCode];

    for (const interfaceInfo of interfaceList) {
      const code = await this.generateInterfaceCode(
        {
          ...this.config,
          components: openApiV3Json.components,
        },
        interfaceInfo,
      );
      categoryCode.push(code);
    }

    const catOutputFilePath = getOutputFilePath(this.config, `/${typesName}.ts`);

    if (categoryCode.length > 0) {
      outputFileList[catOutputFilePath] = {
        config: this.config,
        content: categoryCode,
      };
    }

    return outputFileList;
  }

  /**
   * Write all generated files to disk.
   * @param outputFileList generated files
   */
  async write(outputFileList: OutputFileList) {
    const config = this.config || ({} as Config);

    // Scaffold the shared request client (request.ts) when enabled.
    await writeRequestClient(config);

    // Each output file is built and written independently. Previously a
    // single `outputContent` string accumulated across all files and was
    // only flushed on the last iteration — correct for the single-file case
    // but would concatenate every file's content into the last output when
    // multiple files are generated.
    return Promise.all(
      Object.keys(outputFileList).map(async (outputFilePath) => {
        const { content } = outputFileList[outputFilePath];

        // Rewrite `.jsx?` extensions to `.tsx?`.
        const resolvedPath = outputFilePath.replace(/\.js(x)?$/, ".ts$1");

        const clientImportTemplate = config.clientImportTemplate || defaultClientImportTemplate;
        const clientConfigType = config.clientConfigType || DEFAULT_CLIENT_CONFIG_TYPE;
        // With the default config type the generated functions reference
        // AxiosRequestConfig, so its type-only import must accompany the
        // client import. Custom config types must be imported by the
        // project's own clientImportTemplate.
        const clientConfigImport =
          clientConfigType === DEFAULT_CLIENT_CONFIG_TYPE ? "import type { AxiosRequestConfig } from 'axios';" : "";

        const rawOutputContent = dedent`
          ${generatedFileBanner()}
          ${clientImportTemplate(config)}
          ${clientConfigImport}

          ${content.join("\n\n").trim()}
        `;

        const outputContent = await formatContent(dedent`${rawOutputContent}`, resolvedPath);
        await fs.outputFile(resolvedPath, outputContent);
      }),
    );
  }

  /** Generate a request function name from the extended interface info. */
  requestFunctionNameGen(extendedInterfaceInfo: ExtendedApiInterface): string {
    const path = extendedInterfaceInfo.parsedPath.dir;
    // The same path may be used with different HTTP methods.
    const method = extendedInterfaceInfo.method;
    const words = [method, ...path.split("/"), extendedInterfaceInfo.parsedPath.name].join("_");
    return changeCase.camelCase(words);
  }

  /** Generate TypeScript code (types + request function) for a single API. */
  async generateInterfaceCode(resolvedConfig: ResolvedConfig, interfaceInfo: ApiInterface) {
    const extendedInterfaceInfo: ExtendedApiInterface = {
      ...interfaceInfo,
      parsedPath: path.parse(interfaceInfo.path),
    };
    const requestFunctionName = this.requestFunctionNameGen(extendedInterfaceInfo);
    const requestDataTypeName = changeCase.pascalCase(`${requestFunctionName}Request`);
    const responseDataTypeName = changeCase.pascalCase(`${requestFunctionName}Response`);
    const requestDataJsonSchema = getRequestDataJsonSchema(extendedInterfaceInfo);
    // Request parameters type.

    const requestDataType = await jsonSchemaToTsCode(
      { ...requestDataJsonSchema, components: resolvedConfig.components },
      requestDataTypeName,
    );
    // Surface request-body type degradation instead of silently shipping a
    // primitive/empty type to the frontend. Common root causes: missing
    // `@ApiBody({type: XxxDto})`, inline `@Body() body: {...}` literal, or a
    // Prisma type bound to `@Body()`.
    if (isDegradedRequestType(requestDataType)) {
      logger.warn(
        `[apits] Request type degraded for ` +
          `${extendedInterfaceInfo.method.toUpperCase()} ${extendedInterfaceInfo.path} — ` +
          `check backend @Body()/@ApiBody decorator. Generated:\n${requestDataType}`,
      );
    }
    const responseDataJsonSchema = getResponseDataJsonSchema(extendedInterfaceInfo);
    const responseDataType = await jsonSchemaToTsCode(
      { ...responseDataJsonSchema, components: resolvedConfig.components },
      responseDataTypeName,
    );

    // Build the JSDoc title comment for the generated types/function.
    const genComment = (genTitle: (title: string) => string) => {
      // Escape slashes in the title.
      const escapedTitle = String(extendedInterfaceInfo.title).replace(/\//g, "\\/");
      return dedent`
        /**
         * ${genTitle(escapedTitle)}
         */
      `;
    };
    const requestFunctionTemplate = defaultRequestFunctionTemplate;
    const baseURL = resolvedConfig.baseURL;
    let baseUrl;
    try {
      baseUrl =
        typeof baseURL === "string"
          ? baseURL
          : typeof baseURL === "function"
            ? baseURL(extendedInterfaceInfo.path)
            : "";
    } catch (e) {
      logger.error(e);
    }

    const code = dedent`
      ${genComment((title) => `${title} request parameters`)}
      ${requestDataType.trim()}

      ${genComment((title) => `${title} response data`)}
      ${responseDataType.trim()}

      ${dedent`
          ${genComment((title) => `${title}`)}
          ${requestFunctionTemplate(
            {
              baseURL: baseUrl,
              requestFunctionName,
              requestDataTypeName,
              responseDataTypeName,
              extendedInterfaceInfo,
            },
            resolvedConfig,
          )}
        `}
    `;

    return code;
  }
}
