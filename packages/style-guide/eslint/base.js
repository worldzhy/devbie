import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

/**
 * Baseline standard for the devbie ecosystem.
 *
 * Consumers: every repo composes this and optionally adds a framework layer —
 * `[...base, ...nest]` for Nest applications, `[...base, ...next]` for Next.js
 * applications. Plain Node packages (CLIs, code generators, SDKs) use `base`
 * alone: every rule here is syntactic, so it runs without installing module
 * dependencies.
 *
 * Formatting rules (quotes, eol-last, trailing spaces, ...) are deliberately
 * absent: prettier owns formatting. `prettierConfig` is appended last so that
 * composing a layer on top still ends on the formatting-rule shutdown.
 *
 * Repo-specific rules and ignores belong in the consumer's own
 * eslint.config.mjs, spread after this entry. Only universal generated
 * artifacts are ignored here: minified bundles are machine output, not
 * authored code, so no repository can meaningfully lint them. This mirrors
 * the `*.min.js` entry the starters carry in `.prettierignore`.
 */
export default [
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // Code-quality rules carried over from the legacy gts-derived config.
      "block-scoped-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "prefer-arrow-callback": "error",
      "no-restricted-properties": [
        "error",
        { object: "describe", property: "only" },
        { object: "it", property: "only" },
      ],
    },
  },
  prettierConfig,
  globalIgnores(["**/*.min.js"]),
];
