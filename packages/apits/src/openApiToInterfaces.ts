import { OpenAPIV3 } from "openapi-types";
import { ApiInterface, RequestBodyType, RequestFormItemType, Required, ResponseBodyType } from "./types";
import { each } from "./utils/collections";
import * as logger from "./utils/logger";

function handlePath(p: string) {
  if (p === "/") return p;
  if (p.charAt(0) !== "/") p = `/${p}`;
  if (p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
  return p;
}

/** Resolve a JSON `$ref` pointer (e.g. `#/components/parameters/Foo`) from the root spec. */
function resolveRef(ref: string, root: OpenAPIV3.Document): any {
  if (!ref || typeof ref !== "string" || !ref.startsWith("#/") || ref.length <= 2) return null;
  const parts = ref.slice(2).split("/").filter(Boolean);
  let node: any = root;
  for (const part of parts) {
    if (node == null) return null;
    node = node[part];
  }
  return node ?? null;
}

/** Check whether a value is a `$ref` object (vs a concrete schema). */
function isRef(obj: any): obj is OpenAPIV3.ReferenceObject {
  return obj != null && typeof obj === "object" && "$ref" in obj;
}

/**
 * Process the OAS3 request body directly — no intermediate Swagger 2.0
 * `parameters[]` with `in:'body'`/`in:'formData'`.
 *
 * - `application/json` → `requestBodySchema` (JSON-stringified schema) + `requestBodyType='json'`
 * - `multipart/form-data` / `application/x-www-form-urlencoded` → expand schema
 *   properties into `requestBodyForm` + `requestBodyType='form'`
 */
function handleRequestBody(requestBody: OpenAPIV3.RequestBodyObject | undefined, api: ApiInterface): void {
  if (!requestBody || typeof requestBody !== "object") return;
  const content = requestBody.content || {};
  const jsonContent = content["application/json"];

  if (jsonContent && jsonContent.schema) {
    api.requestBodySchema = JSON.stringify(jsonContent.schema, null, 2);
    api.requestBodyType = RequestBodyType.json;
    return;
  }

  // Form-encoded bodies: expand the schema into individual form fields so
  // binary fields render as `file` and the request body type becomes `form`.
  const multipartContent = content["multipart/form-data"];
  const formContent = multipartContent || content["application/x-www-form-urlencoded"];
  if (formContent && formContent.schema) {
    const schema = formContent.schema as any;
    // Skip $ref schemas (not resolvable in this context).
    if (isRef(schema)) return;
    const required: string[] = schema.required || [];
    const props: Record<string, any> = schema.properties || {};
    for (const name of Object.keys(props)) {
      const prop = props[name] || {};
      // Binary arrays (`type:'array', items:{format:'binary'}`) describe
      // multi-file upload fields such as `files: File[]`. Swagger 2.0
      // formData has no array-of-file concept, so the field is emitted
      // as `type:'file'` with an `isArray` marker.
      const arrayItems = Array.isArray(prop.items) ? prop.items[0] : prop.items;
      const isFileArray = prop.type === "array" && arrayItems && arrayItems.format === "binary";
      const isFile = prop.format === "binary" || isFileArray;
      api.requestBodyForm.push({
        name,
        type: isFile ? RequestFormItemType.file : RequestFormItemType.text,
        desc: prop.description || "",
        example: "",
        required: required.indexOf(name) > -1 ? Required.true : Required.false,
        ...(isFileArray ? { isArray: true } : {}),
        ...(Array.isArray(prop.enum) && prop.enum.length ? { enum: prop.enum } : {}),
      });
    }
    api.requestBodyType = RequestBodyType.form;
    api.requestBodyMultipart = !!multipartContent;
  }
}

/**
 * Process the OAS3 responses object directly — no intermediate Swagger 2.0
 * pre-flattening of `res.content['application/json']` to `res.schema`.
 *
 * Reads `res.content` media types to determine whether a JSON schema exists.
 */
function handleResponse(responses: OpenAPIV3.ResponsesObject | undefined): { body: string; hasSchema: boolean } {
  if (!responses || typeof responses !== "object") return { body: "", hasSchema: false };

  const codes = Object.keys(responses);
  if (codes.length === 0) return { body: "", hasSchema: false };

  const curCode = codes.indexOf("200") > -1 ? "200" : codes[0];
  const res = (responses as Record<string, OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject>)[curCode];
  if (!res || typeof res !== "object") {
    return { body: "", hasSchema: false };
  }

  // Skip $ref responses (not resolvable in this context).
  if (isRef(res)) return { body: "", hasSchema: false };

  const content = res.content;
  if (content && typeof content === "object") {
    // Prefer application/json, then hal+json, then */*.
    const mediaType = content["application/json"] || content["application/hal+json"] || content["*/*"];
    if (mediaType && mediaType.schema) {
      return {
        body: JSON.stringify(mediaType.schema, null, 2),
        hasSchema: true,
      };
    }
  }

  // No schema found — fall back to description.
  if (res.description) return { body: res.description, hasSchema: false };
  return { body: "", hasSchema: false };
}

/** Convert a single OAS3 path-item operation into an `ApiInterface`. */
function handleOpenApiOperation(
  operation: OpenAPIV3.OperationObject,
  path: string,
  method: string,
  root: OpenAPIV3.Document,
): ApiInterface {
  const api: ApiInterface = {
    title: operation.summary || path,
    path: handlePath(path),
    method: method.toUpperCase() as ApiInterface["method"],
    pathParams: [],
    requestBodyForm: [],
    queryParams: [],
    requestBodyType: RequestBodyType.raw,
    requestBodySchema: "",
    responseBodyType: ResponseBodyType.raw,
    responseBody: "",
  };

  // Process OAS3 path/query/header parameters (native — no Swagger 2.0
  // `in:'body'`/`in:'formData'` intermediates).
  if (Array.isArray(operation.parameters)) {
    for (let param of operation.parameters) {
      if (isRef(param)) {
        param = resolveRef(param.$ref, root);
      }
      if (!param || typeof param !== "object") continue;
      const p = param as OpenAPIV3.ParameterObject;

      const paramObj: any = {
        name: p.name,
        desc: p.description || "",
        type: p.schema ? (p.schema as any).type : (p as any).type,
        required: p.required ? Required.true : Required.false,
        example: "",
      };

      switch (p.in) {
        case "path":
          api.pathParams.push(paramObj);
          break;
        case "query":
          api.queryParams.push(paramObj);
          break;
        case "header":
          // Headers are not consumed downstream; skip silently.
          break;
        default:
          break;
      }
    }
  }

  // Process the OAS3 request body directly.
  const reqBody = operation.requestBody;
  handleRequestBody(isRef(reqBody) ? undefined : reqBody, api);

  // Process the OAS3 responses directly.
  const { body: resBody, hasSchema } = handleResponse(operation.responses);
  api.responseBody = resBody;
  if (hasSchema) {
    api.responseBodyType = ResponseBodyType.json;
  } else if (resBody) {
    api.responseBodyType = ResponseBodyType.raw;
  }

  return api;
}

/**
 * Convert an OpenAPI 3.x document into the internal `ApiInterface[]` format.
 *
 * Reads OAS3 directly — no intermediate Swagger 2.0 `openapi3Format` step,
 * no YApi platform fields (`_id`/`project_id`/`catid`/`add_time`/`up_time`),
 * no module-level mutable state.
 *
 * @param data OpenAPI 3.x document (object or JSON string)
 */
export async function openApiToInterfaces(data: OpenAPIV3.Document | string): Promise<{
  interfaces: ApiInterface[];
}> {
  if (typeof data === "string" && data) {
    try {
      data = JSON.parse(data);
    } catch (e: any) {
      logger.error(`Failed to parse JSON: ${e.message}`);
    }
  }

  const doc = data as OpenAPIV3.Document;

  const interfaces: ApiInterface[] = [];

  each(doc.paths || {}, (pathItem: OpenAPIV3.PathItemObject, path: string) => {
    // `parameters` at the path-item level are common parameters, not an operation.
    delete pathItem.parameters;
    each(pathItem, (operation: OpenAPIV3.OperationObject, method: string) => {
      if (!operation || typeof operation !== "object") return;
      try {
        const iface = handleOpenApiOperation(operation, path, method, doc);
        interfaces.push(iface);
      } catch {
        // Skip malformed operations silently.
      }
    });
  });

  return { interfaces };
}
