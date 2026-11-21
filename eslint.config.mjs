import base from "@devbie/style-guide/eslint/base";
import nest from "@devbie/style-guide/eslint/nest";

// Only packages/newbie is Nest framework code; the CLIs, the generator and the
// SDKs are plain Node and must not be evaluated against a framework standard.
// Flat config has no cascading, so the scope has to live here.
const nestForNewbie = nest.map((config) => ({
  ...config,
  files: ["packages/newbie/src/**/*.ts"],
}));

export default [
  ...base,
  ...nestForNewbie,
  {
    files: ["packages/newbie/src/**/*.ts"],
    rules: {
      // The rule's default `src` is relative to the lint CWD (the monorepo
      // root), so it would never see packages/newbie's modules.
      "@darraghor/nestjs-typed/injectable-should-be-provided": [
        "error",
        {
          src: ["packages/newbie/src/**/*.ts"],
          filterFromPaths: ["node_modules", ".test.", ".spec."],
        },
      ],
    },
  },
  {
    // registry/ is a generated snapshot of fewbie-modules (ADR-058): installable
    // source whose lint contract belongs to the hosts, not to this monorepo.
    ignores: ["**/dist/**", "**/coverage/**", "packages/fewbie-cli/registry/**"],
  },
];
