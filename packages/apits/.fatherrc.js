// father 4 configuration.
//
// Migration notes from father 2 (defect G-7):
// - Top-level `entry` and per-format `type: 'babel'` / `minify` do not exist
//   in father 4's bundless (transform) schema. The valid keys are verified
//   against the installed package:
//     node_modules/father/dist/features/configPlugins/schema.js
//     node_modules/father/dist/types.d.ts            (IFatherBundlessConfig)
//     node_modules/father/dist/builder/config.js     (defaults: input 'src',
//                                                     output 'dist/<format>')
// - bundless compiles EVERY file under the input dir (`src/**`), so both
//   `src/index.ts` (library entry) and `src/cli.ts` (bin entry consumed by
//   `bin/apits`) are emitted automatically — no entry list needed.
// - Defaults: input `src`, output `dist/esm` + `dist/cjs`; esm uses the babel
//   transformer (browser platform), cjs uses esbuild (node platform).
// - `autoExtension: true` makes outputs unambiguous without relying on nested
//   package.json `type` markers (this father version does not write them):
//     dist/cjs/*.js + *.d.ts    (CommonJS)
//     dist/esm/*.mjs + *.d.mts  (ESM, relative imports rewritten with ext)
//   package.json main/module/types and bin are aligned to these paths.
// - `dts: {}` enables declaration emission (tsc); without it father 4 emits
//   JS only and package.json `types` points at a nonexistent file.
export default {
  esm: { autoExtension: true, dts: {} },
  cjs: { autoExtension: true, dts: {} },
};
