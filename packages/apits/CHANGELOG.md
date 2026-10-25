# Change Log

All notable changes to this project will be documented in this file.

---

## [1.2.0] - 2026-10-26

> Naming and structure cleanup: coherent pipeline file names, camelCase interface fields, dead YApi-era remnants removed. Public consumer API (`defineConfig`, `Config`, `FileData`, `Generator`, CLI) and generated output are unchanged.

### Breaking Changes

- **`Interface` → `ApiInterface`** (`ExtendedInterface` → `ExtendedApiInterface`), with all snake_case fields renamed to camelCase: `req_params`/`req_query` → `pathParams`/`queryParams`, `req_body_type`/`req_body_form`/`req_body_multipart`/`req_body_other` → `requestBodyType`/`requestBodyForm`/`requestBodyMultipart`/`requestBodySchema`, `res_body_type`/`res_body` → `responseBodyType`/`responseBody`. The `[key: string]: any` index signature is removed.
- **Dead fields removed**: `catname` (plus the tags-classification loop), write-only `req_body_is_json_schema`/`res_body_is_json_schema`/`req_body_additional`; unused `Category` type; `OutputFileList.projectId`/`categoryId`.
- **`SyntheticalConfig` → `ResolvedConfig`**; `topNotesContent` → `generatedFileBanner` (now in `utils/format.ts`); `asyncFnArrayOrderRun` → `runSequentially` (iterative); `spinnerInstance` → `spinner` (the pass-through `Spin` wrapper class is gone).

### Architecture

- `core/` flattened into `src/`; pipeline files named by stage: `openApiToInterfaces.ts` → `jsonSchemaToTsCode.ts` → `generator.ts` → `writeRequestClient.ts`.
- `utils/utils.ts` split by responsibility: schema/TS pipeline stays in `jsonSchemaToTsCode.ts`, prettier/banner helpers moved to `utils/format.ts`.
- `vtilsLite.ts` split into `utils/collections.ts` + `utils/dedent.ts`; `console.ts` → `utils/logger.ts` (no more shadowing of the Node global); `getOutputPath.ts` → `utils/outputPath.ts`.

---

## [1.0.1] - 2026-10-12

> Type-safety fix: the per-request `extra` argument no longer degrades to `Record<string, any>`.

### Features

- **Typed `extra` argument**: every generated request function now types its second argument as `AxiosRequestConfig` by default (with a matching `import type { AxiosRequestConfig } from 'axios'` in the generated file), instead of `Record<string, any>`.
- **`clientConfigType` config option**: projects using a custom client via `clientImportTemplate` can declare their own config type, e.g. `clientConfigType: 'RequestConfig'`; the type must be imported by the custom `clientImportTemplate`, and no axios import is emitted in that case.

---

## [0.0.8] - 2026-09-22

> Architecture cleanup: eliminated the Swagger 2.0 / YApi intermediate layers, removed dead code and dependencies, unified logging, improved type safety.

### Breaking Changes

- **`swaggerJsonToYApiData` → `openApiToInterfaces`**: the conversion function is renamed and its file moved from `swaggerJsonToYApiData.ts` to `openApiToInterfaces.ts`. Importers must update the path and function name.
- **`Interface` type slimmed**: 12 YApi-era fields removed (`_id`, `_category`, `_project`, `status`, `markdown`, `project_id`, `catid`, `tag`, `req_headers`, `req_body_additional`, `add_time`, `up_time`). Code reading these fields will get `undefined`; the `[key: string]: any` index signature remains for transitional access.
- **Dead types removed**: `Project`, `BaseInterfaceInfo`, `InterfaceList`, `CategoryList`. `Category` reduced to `{ name, desc }`.
- **`consola` dependency removed**: `console.ts` now wraps native `console` + `chalk` instead of `consola`. Consumers importing `conso.*` are unaffected (function signatures unchanged).

### Architecture

- **Eliminated `openapi3Format` intermediate layer**: OAS3 `requestBody.content` and `responses.content` are now read directly — no more OAS3 → Swagger 2.0 → YApi triple conversion. New `handleRequestBody` reads OAS3 content types natively; `handleResponse` reads `res.content` media types directly instead of relying on pre-flattened `res.schema`.
- **Module-level mutable state removed**: `let SwaggerData` / `let isOAS3` (which caused cross-spec pollution under parallel use) replaced with parameter passing.
- **OAS3 `$ref` resolution**: `resolveRef` handles `#/components/parameters/Foo` (OAS3 format) instead of the old Swagger 2.0 `#/parameters/Foo` path.
- **Type safety**: function signatures in `openApiToInterfaces.ts` now use `OpenAPIV3.OperationObject`, `OpenAPIV3.RequestBodyObject`, `OpenAPIV3.ResponsesObject`, `OpenAPIV3.Document` instead of `any`.

### Features

- **Watch mode robustness**: `fs.watch` now handles `rename` events (macOS atomic saves) and re-establishes the watcher after the file is recreated, preventing missed changes.
- **`--client` bidirectional override**: `--client` forces `true`, `--no-client` forces `false`; both override the config file value (previously only `--no-client` worked).
- **`writeRequestClient` type fix**: response interceptor returns `res.data` (matching the declared `RP` return type); `post`/`put`/`patch` accept `undefined` data; removed hardcoded `process.env.BASE_URL`.
- **Response type detection**: `handleResponse` uses schema presence (not `try JSON.parse`) to determine `res_body_type`, preventing false positives from JSON-like text descriptions.

### Bug Fixes

- **`Generator.write` multi-file bug**: `outputContent` was accumulated across files but only written for the last one; each file now builds and writes independently.
- **Removed `eval` for `form-data`**: direct `require('form-data')` replaces `eval('require("form-data")')`.

### Tests

- Added P-1 (defineConfig client inference), P-2 (schema-based response type detection), P-3 (writeRequestClient scaffold content) regression tests.

### Dependency Cleanup

- Removed `consola` (replaced by native `console` + `chalk`).
- Removed `dayjs` (only used for dead `add_time`/`up_time` fields).
- Removed `@babel/runtime` (not referenced in source; father 4 uses it internally during build only).
- Removed `execa`, `get-port`, `signal-exit` (unused).
- Removed 20 unused devDependencies: `@commitlint/*`, `@types/react`, `@types/signal-exit`, `@types/swagger-schema-official`, `babel-eslint`, `babel-plugin-component`, `codecov`, `debug`, `dumi`, `gh-pages`, `husky`, `jest`, `lint-staged`, `notify-dingtalk`, `semver`, `shx`, `tempy`, `typedoc`, `typescript-snapshots-plugin`.
- Moved `chalk` from devDependencies to dependencies (used at runtime by `console.ts`).
- Moved `openapi-types` from devDependencies to dependencies (type declarations consumed by downstream projects).

### Code Cleanup

- Deleted `scripts/publish/` (broken: hardcoded wrong package name, missing `inquirer`/`simple-git` deps; project already had `npm run release`).
- Deleted `src/utils/constants.ts` (entire file dead: YApi constants, `DefaultServerUrl`, `ResponseErrorCode`).
- Deleted `projects.json` (used old config field names, no references).
- Deleted 4 dead test files (`requestTest.ts`, `json-schema-to-typescript.ts`, `to-json-schema.ts`, `gen.ts`).
- Removed `Generator.disposes` / `destroy()` (declared but never populated — `destroy()` was a no-op).
- Removed unused `vtilsLite` exports: `isFunction`, `LiteralUnion`, `OmitStrict`.
- Fixed `substr` → `slice` (deprecated API).
- Unified all log output to `conso.*` (replaced raw `console.error`/`console.warn`); all source comments and CLI strings converted to English.
- `tsconfig.json`: `target` `ES5` → `ES2020`; removed `typescript-snapshots-plugin`.
- `.eslintrc.js`: removed stale `babel-eslint` parser reference, `.js/.jsx` extensions.
- `package.json`: `lint-staged` glob `src/*.{js,json,vue}` → `src/**/*.ts`.
- Removed `browserslist` (Node CLI tool, not a browser target).
- CLI class: removed unused `argvs` property and `yargs-parser` dependency.

---

## [0.0.7] - 2026-09-22

> End-to-end multipart/form-data support: OAS3 form bodies now produce correct types **and** a runtime FormData builder in the generated request function.

### Bug Fixes

- **Multipart form-data was silently broken end-to-end** (G-4). The 0.0.6 partial fix expanded the multipart schema into `formData` parameters but the pipeline dropped the body type at three points:
  1. **`consumes` not synthesized for OAS3 operations** — `openapi3Format` now sets `api.consumes = ['multipart/form-data' | 'application/x-www-form-urlencoded']` so `handleSwagger` classifies the body as `req_body_type = 'form'` (was stuck at `'raw'`, making the form branch in `utils.ts` unreachable).
  2. **`application/x-www-form-urlencoded` content key never matched** — the lookup used the short form `content['x-www-form-urlencoded']` but the standard MIME type is `application/x-www-form-urlencoded`; url-encoded bodies were silently ignored.
  3. **Multi-file arrays not recognized** — `type: 'array', items: { format: 'binary' }` (e.g. `files: File[]`) is now detected and marked with `isArray`, and the marker is propagated through `getRequestDataJsonSchema` → `propDefinitionsToJsonSchema` so the type renders as `File[]` instead of `File`.
  4. **Generated function sent JSON for all POSTs** — `defaultRequestFunctionTemplate` now builds a `FormData` (multipart) or `URLSearchParams` (url-encoded) at runtime from the request data, so the underlying client (axios / fetch) auto-sets the correct `Content-Type` with boundary. Without this, form bodies were JSON-stringified and the backend never received the files.

### Features

- **Native `File` type in generated form types**: file fields now emit the DOM `File` type (or `File[]` for arrays) instead of the generator-internal `FileData` class, which was never imported by generated code and produced a dangling reference. The `FileData` import has been removed from `utils.ts`.
- **Enum form fields render as literal unions**: form fields with an `enum` constraint (e.g. `kind: 'admin' | 'user'`) now preserve the enum through the type pipeline instead of collapsing to `string`.
- **`req_body_form` makes `data` required**: generated form request functions now require the `data` argument (previously optional when the endpoint had no path/query params, which would cause a runtime error in the FormData builder).

### Tests

- **G-4 regression tests** added (`test/index.ts`): covers `swaggerJsonToYApiData` interface metadata (multipart + url-encoded), `getRequestDataJsonSchema` tsType (`File` / `File[]`), compiled type assertions, enum literal unions, and `Generator.generate()` output containing `new FormData()` / `new URLSearchParams()` / `data: form`.

---

## [0.0.6] - 2026-09-21

> Zero-config CLI, optional config file, `src/` restructure, and dependency-tree cleanup. Contains breaking config renames — see below.

### Breaking Changes

- **CLI binary renamed**: `apits-gener` → `apits` (aligned with `apits.config.ts` and the package.json `apits` field).
- **`ApiConfig.serverUrl` → `input`**: now accepts an http(s) URL **or a local file path** (`.json` / `.json5` / `.yaml` / `.yml`).
- **Config field renames**: `outputFilePath` → `output` (it is a directory), `defaultRequestLib` → `client` (via the short-lived `useDefaultRequestClient`), `topImportTemplate` → `importTemplate`.
- **Config file is no longer required**: `gen` works from a positional input; `apits.config.*` became an optional escape hatch (auto-discovered). Existing config files keep working after renaming `serverUrl` → `input`.
- **`ApiConfig.name` is now optional**: derived from the input host / file name (e.g. `http://localhost:3041/api-json` → `localhost.ts`, `./user.openapi.yaml` → `userOpenapi.ts`); duplicated derived names get an index suffix.
- Removed internal `ApiConfig.configIndex`.
- **`dist/` layout follows the `src/` restructure** (e.g. `dist/cjs/core/cli.js`); the `bin/apits` entry was updated in step. Only affects consumers importing internal paths.

### Features

- **Zero-config CLI**: `apits gen <input>` or just `apits <input>`; new flags `-o/--output`, `-n/--name`, `--base-url` (supports the `[code]:` prefix), `--no-client`, `-w/--watch` (watches a local document and regenerates on change, with debounce; remote inputs are ignored with a hint).
- **Local spec file support**: JSON, JSON5 and YAML documents can be generated from directly (`js-yaml` added).
- **Config file auto-discovery**: `apits.config.local.ts` → `apits.config.ts` → `apits.config.local.json` → `apits.config.json` → the `apits` field in `package.json`. CLI flags override config-file values; in config-file mode `-n/--name` selects which source(s) to run.
- **`init` demoted to optional scaffolding**: `apits init [input]` pre-fills the document address; running without any input now prints copy-pasteable hints instead of demanding a config file.
- **Name collision safety**: multi-source configs derive unique names so generated files never overwrite each other.

### Bug Fixes

- **CLI no longer hangs under background / redirected stdio** (CI, npm scripts): `swagger-client` synchronously blocked at `require()` time in that environment. It was only referenced by unreachable dead code and has been removed entirely.

### Dependency Cleanup

- `dependencies` tree now contains **zero deprecated packages**:
  - Removed unused `rimraf`, `download-git-repo` (and `@types/rimraf`).
  - `swagger-client` `3.35.6` → `3.38.2`, then **removed entirely** (see Bug Fixes above).
  - Replaced `vtils` and `to-json-schema` (pulled deprecated `lodash.isequal`) with local implementations `utils/vtilsLite.ts` and `utils/toJsonSchema.ts` (removed `@types/to-json-schema`).
  - Added `js-yaml` (+ `@types/js-yaml`) for YAML spec parsing.

### Code Refactor & Cleanup

- **`src/` restructured** into `core/` (`cli.ts`, `generator.ts`, `writeRequestClient.ts`) and `utils/` (9 utility/converter files); package entry `index.ts` and `types.ts` stay at the root so `main`/`module`/`types` are unchanged. All files are camelCase; `Generator.ts` → `generator.ts`, `genRequest.ts` → `writeRequestClient.ts` (paired with the `client` rename).
- **Dead code removed**: `modules/genIndex.ts`, `modules/dependenciesHandler.ts`, `modules/responseDataJsonSchemaHandler.ts` (runtime response-validation chain whose consumers no longer exist), `server/mock.ts`; JSDoc link / update-time / tag rendering that depended on fake YApi placeholder data.
- Unused imports and internal-only exports trimmed (verified via `tsc --noUnusedLocals/--noUnusedParameters`).
- Removed dead exported types `SharedConfig` (incl. the never-read `requestFunctionFilePath` and three never-invoked `getRequestFunctionName` / `getRequestDataTypeName` / `getResponseDataTypeName` hooks), `CommentConfig`, and `ChangeCase` — all had zero internal references and are superseded by the hardcoded naming in `Generator`.
- Type aliases now follow PascalCase: `importTemplateType` → `ImportTemplate`; the unused alias `requestFunctionTemplateType` was removed.

### Docs

- README rewritten: zero-config quick start, CLI option table, generated-output description, optional config file section.

---

## [0.0.5] - 2026-09-21

> Build toolchain upgrade, OpenAPI nullable support, path-param type fix, and code quality cleanup.

### Build & Toolchain

- **Output layout**: `lib/` + `es/` → `dist/cjs/` + `dist/esm/`; `main`/`module`/`types` and `files` updated accordingly.
- **Dependency upgrades**:
  - `prettier`: `^2.2.1` → `^3` — `prettier.format` is now async; `formatContent` returns `Promise<string>` and all call sites are `await`ed.
  - `typescript`: `^4.2.3` → `^5`
  - `father`: `^2.30.5` → `^4`
  - `@babel/runtime`: `^7.13.10` → `^7.29.7`
  - `change-case`: `^3.0.2` → `^3.1.0`
- **tsconfig.json**: `rootDir` set to `./src`; removed `allowJs`, `suppressImplicitAnyIndexErrors`; explicit `include: ["src"]`.
- **Config loader**: replaced `ts-node/register` (with manual `compilerOptions`) with `tsx/cjs/api`'s `register()`. Added `types/tsx-api.d.ts` ambient declaration so `moduleResolution: "node"` can resolve the `exports`-only subpath.

### Dependencies

- **Removed implicit `lodash` usage**: `lodash` was never declared in `dependencies` (relied on hoisting) and the hoisted `@types/lodash` was incomplete, breaking `.d.ts` generation under TS 5. Replaced `upperFirst` with a local implementation and dropped all `lodash` imports.

### Bug Fixes

- **`nullable` types now emit `T | null`**: `json-schema-to-typescript` silently ignores OpenAPI's `nullable` keyword. Added `nullable: true` → `type: [..., 'null']` normalization in both `processJsonSchema` and `preprocessSchema` (component schemas flow through the latter).
- **Path-param field types no longer render as string literals**: merging path/query params onto a `$ref` body used `JSON.stringify`, producing `{ userId: "string" }`. A new `jsonSchemaTypeToTs` helper builds the inline type string correctly, yielding `{ userId: string }`.
- **Degenerate body schema normalization**: when Nest fails to reflect a DTO (inline type / Prisma type / missing `@ApiBody({type})`), the body resolved to a bare primitive like `{ type: 'string' }`, producing `{ id: number } & string`. Non-object root types are now stripped so params attach cleanly.
- **`components.schemas` optional-chaining guard**: a valid OpenAPI document may omit `components` entirely; `Object.keys(components.schemas)` previously threw and aborted generation. Now uses `components?.schemas ?? {}`.
- **form-data request body support**: `openapi3Format` previously only read `application/json`, silently dropping form-encoded bodies. Now expands `multipart/form-data` and `x-www-form-urlencoded` schemas into individual `formData` parameters, marking `format: binary` fields as `file`.
- **`handleBodyPamras` simplified**: removed the no-op `isJson()` check (it re-parsed a value that had just been `JSON.stringify`'d from an object, so it could never fail); body is now always marked as JSON schema.

### Features

- **Request-type degradation warning**: added `isDegradedRequestType` to detect when a generated request type has collapsed to a primitive / empty object / index-signature-only / `& string` shape. A `console.warn` points the author to fix the backend `@Body()` / `@ApiBody` decorator.

### Code Cleanup

- Removed debug `console.log` blocks in `Generator.ts` (two `path.includes('/path')` guards) and four hardcoded `if (typeName === '...')` debug guards in `utils.ts` that leaked upstream business type names.
- Removed the dead `tsc()` method and its `os` / `child_process` imports.
- All source comments translated to English; stale commented-out code and internal defect IDs removed.

### Misc

- Lockfile switched from `yarn.lock` to `package-lock.json`.
- `test` script simplified to `tsx test/index.ts`.

---

## [0.0.4] - 2026-03-09

- Internal refactor and localization pass (source comments / messages).

## [0.0.2] - 2026-01-08

- Added `--name` option for `gen` and CLI `init`; version bump.

## [0.0.1] - 2025-10-13

- Initial 0.0.x release after the 2.x → 0.0.x version reset.
