import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { processJsonSchema, jsonSchemaToTsCode, getRequestDataJsonSchema } from "../src/utils/utils";
import { openApiToInterfaces } from "../src/utils/openApiToInterfaces";
import { Generator } from "../src/core/generator";
import { defineConfig } from "../src/utils/helpers";
import { RequestBodyType, Required } from "../src/types";

// Shared by the G-4 multipart tests and the P-3/P-4 scaffold tests.
const multipartSpec = {
  openapi: "3.0.0",
  info: { title: "G-4 Test", version: "1.0.0" },
  paths: {
    "/upload": {
      post: {
        summary: "Upload files",
        tags: ["upload"],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary", description: "single file" },
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                    description: "multi-file array",
                  },
                  name: { type: "string", description: "label" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
    "/profile": {
      post: {
        summary: "Update profile",
        tags: ["profile"],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  nickname: { type: "string" },
                  kind: { type: "string", enum: ["admin", "user"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

describe("G-1: nullable normalization", () => {
  it("scalar nullable becomes a type array including null", () => {
    const nullableString = processJsonSchema({ type: "string", nullable: true } as any);
    assert.ok(Array.isArray(nullableString.type), "type should become an array");
    assert.deepStrictEqual(nullableString.type, ["string", "null"]);
    assert.strictEqual(nullableString.nullable, undefined, "nullable flag must be removed");
  });

  it("nested nullable properties are normalized by the recursive walker", () => {
    const nested = processJsonSchema({
      type: "object",
      properties: { middleName: { type: "string", nullable: true } },
    } as any);
    assert.deepStrictEqual(nested.properties!.middleName.type, ["string", "null"]);
  });

  it("enum schemas gain a null literal", () => {
    const enumNullable = processJsonSchema({ enum: ["active", "archived"], nullable: true } as any);
    assert.ok(enumNullable.enum.includes(null), "enum should include null");
    assert.strictEqual(enumNullable.nullable, undefined);
  });
});

describe("G-3: degenerate request body coercion", () => {
  const interfaceInfo = {
    req_body_type: RequestBodyType.json,
    req_body_other: JSON.stringify({ type: "string" }),
    req_body_is_json_schema: true,
    req_query: [],
    req_params: [{ name: "id", type: "integer", required: Required.true, desc: "path id" }],
  } as any;

  it("strips the bare primitive body so path params merge cleanly", () => {
    const requestSchema = getRequestDataJsonSchema(interfaceInfo);
    assert.strictEqual(requestSchema.type, undefined, "degenerate body type should be stripped before merge");
    assert.ok(
      requestSchema.properties && requestSchema.properties.id,
      "path param should attach to the coerced schema",
    );
  });
});

describe("G-2: path params merged onto a $ref body", () => {
  it("emits Ref & { id: number } without string-literal type names", async () => {
    const refSchema = {
      $ref: "#/components/schemas/UpdateUserDto",
      properties: { id: { type: "integer" } },
      required: ["id"],
    };
    const refCode = await jsonSchemaToTsCode(refSchema as any, "PatchUserRequest");
    assert.ok(refCode.includes("UpdateUserDto"), `should reference UpdateUserDto. Got: ${refCode}`);
    assert.ok(/id:\s*number/.test(refCode), `should map integer path param to number. Got: ${refCode}`);
    assert.ok(
      !/["']string["']/.test(refCode) && !/["']integer["']/.test(refCode),
      `must not serialize type names as string literals. Got: ${refCode}`,
    );
    assert.ok(!/&\s*string/.test(refCode), `must not contain '& string'. Got: ${refCode}`);
  });

  it("compiles a degenerate-body schema without '& string'", async () => {
    const requestSchema = getRequestDataJsonSchema({
      req_body_type: RequestBodyType.json,
      req_body_other: JSON.stringify({ type: "string" }),
      req_body_is_json_schema: true,
      req_query: [],
      req_params: [{ name: "id", type: "integer", required: Required.true, desc: "path id" }],
    } as any);
    const degenerateCode = await jsonSchemaToTsCode(requestSchema, "PatchXxxRequest");
    assert.ok(!/&\s*string/.test(degenerateCode), `no '& string' in compiled type. Got: ${degenerateCode}`);
  });
});

describe("G-4: multipart/form-data end-to-end", () => {
  it("openApiToInterfaces marks multipart form fields with file types and required flags", async () => {
    const { interfaces } = await openApiToInterfaces(multipartSpec);
    const uploadIface = interfaces.find((i) => i.path === "/upload")!;
    assert.ok(uploadIface, "upload interface should exist");
    assert.strictEqual(uploadIface.req_body_type, "form");
    assert.strictEqual(uploadIface.req_body_multipart, true);

    const fileField = uploadIface.req_body_form.find((f) => f.name === "file");
    assert.ok(fileField, "file field should exist");
    assert.strictEqual(fileField.type, "file");
    assert.strictEqual(fileField.isArray, undefined, "single file should not have isArray");

    const filesField = uploadIface.req_body_form.find((f) => f.name === "files");
    assert.ok(filesField, "files field should exist");
    assert.strictEqual(filesField.type, "file");
    assert.strictEqual(filesField.isArray, true, "multi-file array should have isArray=true");

    const nameField = uploadIface.req_body_form.find((f) => f.name === "name");
    assert.ok(nameField, "name field should exist");
    assert.strictEqual(nameField.type, "text");

    // Only fields in schema.required are "1"; a truthy "0" string would
    // wrongly mark optional form fields as required in generated types.
    assert.strictEqual(fileField.required, "1");
    assert.strictEqual(filesField.required, "0");
    assert.strictEqual(nameField.required, "0");
  });

  it("url-encoded endpoints are form bodies but not multipart", async () => {
    const { interfaces } = await openApiToInterfaces(multipartSpec);
    const profileIface = interfaces.find((i) => i.path === "/profile")!;
    assert.strictEqual(profileIface.req_body_type, "form");
    assert.strictEqual(profileIface.req_body_multipart, false);
  });

  it("request schema maps binary fields to File / File[] tsTypes", async () => {
    const { interfaces } = await openApiToInterfaces(multipartSpec);
    const uploadIface = interfaces.find((i) => i.path === "/upload")!;
    const uploadSchema = getRequestDataJsonSchema(uploadIface);
    assert.ok(uploadSchema.properties, "schema should have properties");
    assert.strictEqual(uploadSchema.properties!.file.tsType, "File");
    assert.strictEqual(uploadSchema.properties!.files.tsType, "File[]");
  });

  it("compiled type renders file: File and files?: File[]", async () => {
    const { interfaces } = await openApiToInterfaces(multipartSpec);
    const uploadIface = interfaces.find((i) => i.path === "/upload")!;
    const uploadTypeCode = await jsonSchemaToTsCode(getRequestDataJsonSchema(uploadIface), "UploadRequest");
    assert.match(uploadTypeCode, /file:\s*File/, `Got: ${uploadTypeCode}`);
    assert.match(uploadTypeCode, /files\?:\s*File\[\]/, `Got: ${uploadTypeCode}`);
    assert.match(uploadTypeCode, /name\?:\s*string/, `Got: ${uploadTypeCode}`);
    assert.doesNotMatch(
      uploadTypeCode,
      /(?<!\?)name:\s*string/,
      `optional name must stay optional. Got: ${uploadTypeCode}`,
    );
  });

  it("enum form fields render as literal unions", async () => {
    const { interfaces } = await openApiToInterfaces(multipartSpec);
    const profileIface = interfaces.find((i) => i.path === "/profile")!;
    const profileTypeCode = await jsonSchemaToTsCode(getRequestDataJsonSchema(profileIface), "UpdateProfileRequest");
    assert.match(profileTypeCode, /["']admin["']\s*\|\s*["']user["']/, `Got: ${profileTypeCode}`);
  });

  it("generated function bodies build FormData / URLSearchParams exactly where needed", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "apits-g4-"));
    try {
      const specPath = path.join(tmpDir, "spec.json");
      await fs.writeFile(specPath, JSON.stringify(multipartSpec));

      const generator = new Generator({
        input: specPath,
        output: path.join(tmpDir, "out"),
        name: "g4test",
        client: false,
      });
      const output = await generator.generate();
      const allContent = Object.values(output)
        .map((f) => f.content.join("\n"))
        .join("\n");

      assert.match(allContent, /new FormData\(\)/, "multipart endpoint should build FormData");
      assert.match(allContent, /data:\s*form/, "multipart endpoint should pass form as data");
      assert.match(allContent, /new URLSearchParams\(\)/, "urlencoded endpoint should build URLSearchParams");
      assert.strictEqual(
        (allContent.match(/new FormData\(\)/g) || []).length,
        1,
        "exactly one FormData constructor for one multipart endpoint",
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("P-1: defineConfig client inference", () => {
  it("defaults client to true when no template is given", () => {
    const config = defineConfig({ input: "http://localhost/api-json" })[0];
    assert.strictEqual(config.client, true);
  });

  it("defaults client to false when a template is given", () => {
    const config = defineConfig({
      input: "http://localhost/api-json",
      clientImportTemplate: () => "import {request} from '../fetch'",
    })[0];
    assert.strictEqual(config.client, false);
  });

  it("explicit client=true wins over the template default", () => {
    const config = defineConfig({
      input: "http://localhost/api-json",
      clientImportTemplate: () => "import {request} from '../fetch'",
      client: true,
    })[0];
    assert.strictEqual(config.client, true);
  });

  it("explicit client=false wins", () => {
    const config = defineConfig({ input: "http://localhost/api-json", client: false })[0];
    assert.strictEqual(config.client, false);
  });
});

describe("P-2: schema-based response type detection", () => {
  const spec = {
    openapi: "3.0.0",
    info: { title: "P-2 Test", version: "1.0.0" },
    paths: {
      "/text": {
        get: {
          summary: "Text endpoint",
          tags: ["test"],
          responses: { "200": { description: '"hello world"' } },
        },
      },
      "/json": {
        get: {
          summary: "JSON endpoint",
          tags: ["test"],
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { name: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    },
  };

  it("a description-only response is raw, never probed as JSON", async () => {
    const { interfaces } = await openApiToInterfaces(spec);
    const textIface = interfaces.find((i) => i.path === "/text")!;
    assert.ok(textIface, "text interface should exist");
    assert.strictEqual(textIface.res_body_type, "raw");
  });

  it("a response with a schema is classified as json schema", async () => {
    const { interfaces } = await openApiToInterfaces(spec);
    const jsonIface = interfaces.find((i) => i.path === "/json")!;
    assert.ok(jsonIface, "json interface should exist");
    assert.strictEqual(jsonIface.res_body_type, "json");
    assert.strictEqual(jsonIface.res_body_is_json_schema, true);
  });
});

describe("P-3: writeRequestClient scaffold", () => {
  it("returns res.data and passes data correctly without hardcoded env", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "apits-p3-"));
    try {
      const specPath = path.join(tmpDir, "spec.json");
      await fs.writeFile(specPath, JSON.stringify(multipartSpec));
      const outDir = path.join(tmpDir, "out");
      const generator = new Generator({ input: specPath, output: outDir, name: "p3test", client: true });
      await generator.generate().then((output) => generator.write(output));

      const requestContent = await fs.readFile(path.join(outDir, "request.ts"), "utf-8");
      assert.match(requestContent, /return res\.data/, "interceptor should return res.data");
      assert.match(
        requestContent,
        /instance\.post<RP>\(url, undefined, config\)/,
        "post should pass undefined as data",
      );
      assert.doesNotMatch(requestContent, /process\.env\.BASE_URL/, "should not hardcode process.env.BASE_URL");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("P-4: per-request extra argument typing", () => {
  it("default client types extra as AxiosRequestConfig with a type-only import", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "apits-p4a-"));
    try {
      const specPath = path.join(tmpDir, "spec.json");
      await fs.writeFile(specPath, JSON.stringify(multipartSpec));
      const outDir = path.join(tmpDir, "out");
      const generator = new Generator({ input: specPath, output: outDir, name: "p4test", client: false });
      await generator.write(await generator.generate());

      const api = await fs.readFile(path.join(outDir, "p4test.ts"), "utf-8");
      assert.match(api, /import type \{\s*AxiosRequestConfig\s*\} from ['"]axios['"]/);
      assert.match(api, /extra\?: AxiosRequestConfig/);
      assert.doesNotMatch(api, /Record<string,\s*any>/, "must not emit Record<string, any>");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("custom clientConfigType applies to extra without adding axios imports", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "apits-p4b-"));
    try {
      const specPath = path.join(tmpDir, "spec.json");
      await fs.writeFile(specPath, JSON.stringify(multipartSpec));
      const outDir = path.join(tmpDir, "out");
      const generator = new Generator({
        input: specPath,
        output: outDir,
        name: "p4custom",
        client: false,
        clientImportTemplate: () => "import {request, type RequestConfig} from '../fetch'",
        clientConfigType: "RequestConfig",
      });
      await generator.write(await generator.generate());

      const api = await fs.readFile(path.join(outDir, "p4custom.ts"), "utf-8");
      assert.match(api, /import \{\s*request, type RequestConfig\s*\} from ['"]\.\.\/fetch['"]/);
      assert.match(api, /extra\?: RequestConfig/);
      assert.doesNotMatch(api, /AxiosRequestConfig/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
