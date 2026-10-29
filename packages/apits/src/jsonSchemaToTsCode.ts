import { castArray, forOwn, isArray, isEmpty, isObject } from "./utils/collections";
import { compile } from "json-schema-to-typescript";
import type { Defined } from "./utils/collections";
import {
  ApiInterface,
  PropDefinition,
  PropDefinitions,
  RequestBodyType,
  RequestFormItemType,
  Required,
  ResponseBodyType,
} from "./types";
import { JSONSchema4, JSONSchema4TypeName } from "json-schema";

/**
 * Uppercase the first character of a string, leaving the rest untouched.
 * Local replacement for lodash's `upperFirst`: lodash is not declared in
 * package.json dependencies (it was only available via dependency
 * hoisting), and the hoisted @types/lodash is incomplete, which broke
 * declaration generation on the TypeScript 5 toolchain.
 *
 * @param value input string
 * @returns string with its first character uppercased
 */
function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Process a JSON Schema in place.
 *
 * @param jsonSchema JSON Schema to process
 * @returns the processed JSON Schema
 */
export function processJsonSchema<T extends JSONSchema4>(jsonSchema: T): T {
  if (!isObject(jsonSchema)) return jsonSchema;

  // Remove `title` and `id` so json-schema-to-typescript does not extract them as interface names.
  delete jsonSchema.title;
  delete jsonSchema.id;

  // Ignore array length limits.
  delete jsonSchema.minItems;
  delete jsonSchema.maxItems;

  // Strip `default` so json-schema-to-typescript cannot infer a type from it.
  delete jsonSchema.default;

  // Normalize OpenAPI 3.x `nullable: true` into JSON Schema `type: [..., 'null']`.
  // json-schema-to-typescript only understands the JSON Schema union-null form
  // (a `type` array containing 'null'); OpenAPI's `nullable` keyword is silently
  // ignored, which drops `| null` from generated types. This walker bridges
  // that gap so nullable fields render as `T | null`.
  if (jsonSchema.nullable === true) {
    if (jsonSchema.type) {
      // Merge 'null' into the existing type(s) without duplicates.
      const types = castArray(jsonSchema.type).filter((t) => t !== "null") as JSONSchema4TypeName[];
      if (!types.includes("null")) types.push("null");
      jsonSchema.type = types.length === 1 ? types[0] : types;
    } else if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
      // For enum schemas without a type, append a null literal so the
      // generated union includes `null`.
      if (!jsonSchema.enum.includes(null)) {
        jsonSchema.enum = [...jsonSchema.enum, null] as any;
      }
    }
    // Note: `$ref`/`allOf`/`oneOf`/`anyOf` + nullable combinations are not
    // normalized here because they would require restructuring the schema
    // (e.g. wrapping in anyOf). Nullable scalars cover the common case.
    delete jsonSchema.nullable;
  }

  // Normalize type names to standard JSON Schema type names.
  if (jsonSchema.type) {
    const isMultiple = Array.isArray(jsonSchema.type);
    const types = castArray(jsonSchema.type).map((type) => {
      // Lowercase all types, e.g. String -> string.
      type = type.toLowerCase() as any;
      // Map to standard JSON Schema types.
      type =
        (
          {
            int: "integer",
          } as Record<string, JSONSchema4TypeName>
        )[type] || type;
      return type;
    });
    jsonSchema.type = isMultiple ? types : types[0];
  }

  // Mock.toJSONSchema produces `properties` as an array of named schemas, but
  // JSONSchema4 expects an object keyed by name. The generic `T` cannot prove
  // the object shape is assignable to `T["properties"]`, so the write goes
  // through a non-generic view; the value itself is fully typed.
  if (isArray(jsonSchema.properties)) {
    const named = jsonSchema.properties as Array<JSONSchema4 & { name: string }>;
    const properties: Defined<JSONSchema4["properties"]> = {};
    for (const js of named) {
      properties[js.name] = js;
    }
    (jsonSchema as JSONSchema4).properties = properties;
  }

  // Trim whitespace from field names.
  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, (_, prop) => {
      const propDef = jsonSchema.properties![prop];
      delete jsonSchema.properties![prop];
      jsonSchema.properties![(prop as string).trim()] = propDef;
    });
    jsonSchema.required = jsonSchema.required && (jsonSchema.required as string[]).map((prop) => prop.trim());
  }

  // Recurse into child properties.
  if (jsonSchema.properties) {
    forOwn(jsonSchema.properties, processJsonSchema);
  }

  // Recurse into array items.
  if (jsonSchema.items) {
    castArray(jsonSchema.items).forEach(processJsonSchema);
  }

  if (jsonSchema.oneOf) {
    jsonSchema.oneOf.forEach(processJsonSchema);
  }

  if (jsonSchema.anyOf) {
    jsonSchema.anyOf.forEach(processJsonSchema);
  }

  if (jsonSchema.allOf) {
    jsonSchema.allOf.forEach(processJsonSchema);
  }

  return jsonSchema;
}

/**
 * Parse a JSON Schema string into a JSON Schema object.
 *
 * @param str JSON Schema string
 * @returns parsed JSON Schema object
 */
function jsonSchemaStringToJsonSchema(str: string): JSONSchema4 {
  return processJsonSchema(JSON.parse(str));
}

/**
 * Derive a JSON Schema object from a list of property definitions.
 *
 * @param propDefinitions list of property definitions
 * @returns JSON Schema object
 */
function propDefinitionsToJsonSchema(propDefinitions: PropDefinitions): JSONSchema4 {
  return processJsonSchema({
    type: "object",
    required: propDefinitions.reduce<string[]>((res, prop) => {
      if (prop.required) {
        res.push(prop.name);
      }
      return res;
    }, []),
    properties: propDefinitions.reduce<Exclude<JSONSchema4["properties"], undefined>>((res, prop) => {
      res[prop.name] = {
        type: prop.type,
        description: prop.comment,
        // File fields emit the native DOM `File` type (or `File[]` for
        // multi-file arrays) so generated code has no dangling reference
        // to the generator-internal `FileData` class. Non-file fields with
        // an enum constraint emit a literal union.
        ...(prop.type === ("file" as any)
          ? { tsType: prop.isArray ? "File[]" : "File" }
          : Array.isArray(prop.enum) && prop.enum.length
            ? { enum: prop.enum }
            : {}),
      };
      return res;
    }, {}),
  });
}

/**
 * Pre-process a schema before compiling it to TypeScript.
 *
 * Handles edge cases such as empty enums and normalizes OpenAPI 3.x
 * `nullable: true` into the JSON Schema union-null form
 * (`type: [T, 'null']`) so json-schema-to-typescript emits `T | null`.
 * Component schemas reach the compiler through this preprocessor instead of
 * `processJsonSchema`, and jstt silently ignores the OpenAPI `nullable`
 * keyword. Every node here is a fresh copy, so the source document is never
 * mutated.
 *
 * @param schema input JSON Schema
 * @returns normalized JSON Schema (fresh copy, source is not mutated)
 */
export function preprocessSchema(schema: JSONSchema4): JSONSchema4 {
  if (!isObject(schema)) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(preprocessSchema);
  }

  const processed = { ...schema };

  // Drop empty enum arrays (a type with no values produces invalid output).
  if (processed.enum && Array.isArray(processed.enum) && processed.enum.length === 0) {
    delete processed.enum;
  }

  // Normalize OpenAPI 3.x `nullable: true` into the JSON Schema union-null
  // form (`type: [T, 'null']`) so json-schema-to-typescript emits `T | null`.
  if (processed.nullable === true) {
    if (processed.type) {
      // Merge 'null' into the existing type(s) without duplicates.
      const typeList: string[] = castArray(processed.type).filter((typeName) => typeName !== "null");
      typeList.push("null");
      processed.type = (typeList.length === 1 ? typeList[0] : typeList) as any;
    } else if (Array.isArray(processed.enum)) {
      // For enum schemas without a type, append a null literal.
      if (!processed.enum.includes(null)) processed.enum = [...processed.enum, null];
    }
    delete processed.nullable;
  }

  // Recurse into every child value.
  for (const key in processed) {
    if (processed.hasOwnProperty(key)) {
      processed[key] = preprocessSchema(processed[key]);
    }
  }

  return processed;
}

/**
 * Map a JSON Schema property descriptor to a TypeScript type expression.
 * Used when constructing inline object types for merged path/query params
 * (see `rewriteRefs`), where `JSON.stringify` would incorrectly serialize
 * type names as string literals.
 */
function jsonSchemaTypeToTs(propSchema: any): string {
  if (!propSchema || typeof propSchema !== "object") {
    return "unknown";
  }
  // Prefer an explicit tsType marker (set for $ref resolutions) over the
  // raw JSON Schema type name.
  if (propSchema.tsType) {
    return propSchema.tsType;
  }
  // Enum schemas render as a union of string-literal types.
  if (propSchema.enum && Array.isArray(propSchema.enum) && propSchema.enum.length) {
    return propSchema.enum.map((v: any) => (v === null ? "null" : `'${String(v).replace(/'/g, "\\'")}'`)).join(" | ");
  }
  switch (propSchema.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "null":
      return "null";
    case "array": {
      // Best-effort: derive the element type from items, fall back to any.
      const itemSchema = Array.isArray(propSchema.items) ? propSchema.items[0] : propSchema.items;
      const itemTs = itemSchema && (itemSchema.tsType || jsonSchemaTypeToTs(itemSchema));
      return itemTs ? `${itemTs}[]` : "any[]";
    }
    case "object":
    case undefined:
    default:
      return "unknown";
  }
}

/**
 * Generate a TypeScript type definition from a JSON Schema object.
 *
 * @param jsonSchema JSON Schema object
 * @param typeName type name
 * @returns TypeScript type definition
 */
export async function jsonSchemaToTsCode(jsonSchema: JSONSchema4, typeName: string): Promise<string> {
  jsonSchema = preprocessSchema(jsonSchema);
  // Capitalize the type name to avoid naming inconsistencies from the compiler.
  typeName = upperFirst(typeName);
  if (isEmpty(jsonSchema)) {
    return `export interface ${typeName} {}`;
  }
  if (jsonSchema.__is_any__) {
    delete jsonSchema.__is_any__;
    return `export type ${typeName} = any`;
  }

  function rewriteRefs(obj: any) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === "$ref" && typeof obj[key] === "string") {
          let refValue = obj[key];
          // '#/components' is the standard path, but some non-standard sources use '#components'.
          if (refValue.startsWith("#components")) {
            refValue = refValue.replace("#components", "#/components");
          }
          // Resolve references pointing to components.schemas.
          if (refValue.startsWith("#/components/schemas/")) {
            const interfaceName = refValue.replace("#/components/schemas/", "");
            // Files under /components/schemas are generated as ts interfaces named
            // after the file. The `tsType` marker tells the compiler to emit a
            // reference to that interface. The compiler uppercases the first
            // letter of tsType, so we uppercase the name here to keep references
            // aligned with the generated interface names.
            obj["tsType"] = upperFirst(interfaceName);
            // When the object has extra properties alongside `$ref`, build an
            // inline object type from those properties. The common case is a
            // path param merged onto a body DTO.
            if (obj.properties) {
              // Build the inline object type string manually instead of
              // JSON.stringify, which would serialize type names as string
              // literals (e.g. `{userId: "string"}` instead of `{userId: string}`).
              // Guard `obj.required` because it may be undefined for schemas
              // without a required array.
              const requiredArr: string[] = Array.isArray(obj.required) ? obj.required : [];
              const propParts: string[] = [];
              Object.keys(obj.properties).forEach((key) => {
                const propSchema = obj.properties[key];
                const tsType = propSchema.tsType || jsonSchemaTypeToTs(propSchema);
                const optional = requiredArr.includes(key) ? "" : "?";
                propParts.push(`${key}${optional}: ${tsType}`);
              });
              obj["tsType"] += ` & { ${propParts.join("; ")} }`;
            }
            delete obj["$ref"];
          }
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          // Recurse into child objects.
          rewriteRefs(obj[key]);
        }
      }
    }
  }

  rewriteRefs(jsonSchema);

  // Pass an all-caps fake type name to json-schema-to-typescript and replace
  // it back afterwards. This avoids the compiler's generateName logic appending
  // a numeric suffix when the same name appears in nested references.
  const fakeTypeName = "THISISAFAKETYPENAME";

  const code = await compile(jsonSchema, fakeTypeName, {
    bannerComment: "",
    additionalProperties: false,
    declareExternallyReferenced: false,
  });

  delete jsonSchema.id;
  return code.replace(fakeTypeName, typeName).trim();
}

export function getRequestDataJsonSchema(interfaceInfo: ApiInterface): JSONSchema4 {
  let jsonSchema!: JSONSchema4;

  switch (interfaceInfo.requestBodyType) {
    case RequestBodyType.form:
      jsonSchema = propDefinitionsToJsonSchema(
        interfaceInfo.requestBodyForm.map<PropDefinition>((item) => ({
          name: item.name,
          required: item.required === Required.true,
          type: (item.type === RequestFormItemType.file ? "file" : "string") as any,
          comment: item.desc,
          // Carry multi-file and enum markers from the OAS3 multipart schema
          // expansion so propDefinitionsToJsonSchema can emit `File[]` and
          // literal unions instead of collapsing every field to `string`.
          ...(item.isArray ? { isArray: true } : {}),
          ...(Array.isArray(item.enum) && item.enum.length ? { enum: item.enum } : {}),
        })),
      );
      break;
    case RequestBodyType.json:
      if (interfaceInfo.requestBodySchema) {
        jsonSchema = jsonSchemaStringToJsonSchema(interfaceInfo.requestBodySchema);
      }
      break;
    default:
      /* istanbul ignore next */
      break;
  }

  // Normalize a degenerate body schema (G-3): when Nest fails to reflect a
  // proper DTO schema (inline type / Prisma type / missing @ApiBody type),
  // the request body may resolve to a bare primitive such as `{type:'string'}`
  // or a non-object schema. Merging path/query params onto such a root
  // produces `{id: number} & string`. Coerce it to an object-less schema so
  // params attach cleanly; the upstream cause is surfaced as a warning (G-5).
  if (
    jsonSchema &&
    jsonSchema.type &&
    jsonSchema.type !== "object" &&
    !jsonSchema.properties &&
    !jsonSchema.$ref &&
    !jsonSchema.oneOf &&
    !jsonSchema.anyOf &&
    !jsonSchema.allOf
  ) {
    delete jsonSchema.type;
    delete (jsonSchema as any).tsType;
  }

  if (isArray(interfaceInfo.queryParams) && interfaceInfo.queryParams.length) {
    const queryJsonSchema = propDefinitionsToJsonSchema(
      interfaceInfo.queryParams.map<PropDefinition>((item) => ({
        name: item.name,
        required: item.required === Required.true,
        type: item.type || "any", // `object` resolves to `{}`, which causes declaration issues, so strip it for now
        comment: item.desc,
      })),
    );
    /* istanbul ignore else */
    if (jsonSchema) {
      jsonSchema.properties = {
        ...jsonSchema.properties,
        ...queryJsonSchema.properties,
      };
      jsonSchema.required = [
        ...((jsonSchema.required as string[]) || []),
        ...((queryJsonSchema.required as string[]) || []),
      ];
    } else {
      jsonSchema = queryJsonSchema;
    }
  }

  if (isArray(interfaceInfo.pathParams) && interfaceInfo.pathParams.length) {
    const paramsJsonSchema = propDefinitionsToJsonSchema(
      interfaceInfo.pathParams.map<PropDefinition>((item) => ({
        name: item.name,
        required: true,
        type: item.type || "string",
        comment: item.desc,
      })),
    );
    /* istanbul ignore else */
    if (jsonSchema) {
      jsonSchema.properties = {
        ...jsonSchema.properties,
        ...paramsJsonSchema.properties,
      };
      jsonSchema.required = [
        ...((jsonSchema.required as string[]) || []),
        ...((paramsJsonSchema.required as string[]) || []),
      ];
    } else {
      jsonSchema = paramsJsonSchema;
    }
  }

  return jsonSchema;
}

export function getResponseDataJsonSchema(interfaceInfo: ApiInterface): JSONSchema4 {
  let jsonSchema: JSONSchema4 = {};

  switch (interfaceInfo.responseBodyType) {
    case ResponseBodyType.json:
      if (interfaceInfo.responseBody) {
        jsonSchema = jsonSchemaStringToJsonSchema(interfaceInfo.responseBody);
      }
      break;
    default:
      jsonSchema = { __is_any__: true };
      break;
  }

  return jsonSchema;
}
