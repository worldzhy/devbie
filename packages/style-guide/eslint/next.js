import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import unicorn from "eslint-plugin-unicorn";

/**
 * Next.js layer for the devbie ecosystem.
 *
 * This is a layer, not a standalone standard: compose it after `base`
 * (`export default [...base, ...next]`), so every repo shares the same
 * language-level rules while Next.js applications add only the canonical
 * framework rule set.
 *
 * `eslint-config-next` already bundles the React / react-hooks / jsx-a11y
 * layers, so nothing else is layered on top: spreading another React layer
 * would redefine the same plugin and flat config rejects that.
 *
 * This entry can only be loaded where the `next` package is installed; Node
 * repos without a Next runtime compose `base` with `nest` or nothing at all.
 *
 * `prettierConfig` is repeated here so that composing `[...base, ...next]`
 * still ends on the formatting-rule shutdown.
 *
 * Repo-wide conventions that every devbie Next.js application shares live here
 * rather than in each consumer's config (ADR-035): kebab-case file names and a
 * non-blocking `any` warning. Formatting rules stay out — prettier owns them,
 * with `singleQuote: false` / `jsxSingleQuote: false` in `prettier.js` already
 * pinning double quotes.
 */
export default [
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { unicorn },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // Convention: every source file name is kebab-case
      // (.trae/documents/naming-conventions-research.md). Identifiers stay
      // PascalCase.
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  {
    // ADR-048 §2.1 / §6.4: `message` and `description` are display copy and may
    // be reworded at any time; behaviour must branch on the numeric error
    // `code` (or the derived SessionFailureKind). Comparing or matching those
    // strings is the exact mechanism that made a coded 403 look like a network
    // failure, so it is a build error in the two directories that decide
    // transport and session behaviour.
    files: ["**/src/lib/**/*.{ts,tsx}", "**/src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[operator=/^(===|!==|==|!=)$/] > MemberExpression[property.name=/^(message|description)$/]",
          message:
            "Do not compare display copy (message/description). Branch on the numeric error code or SessionFailureKind instead (ADR-048 §2.1).",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(includes|startsWith|endsWith|match|indexOf|search)$/][callee.object.property.name=/^(message|description)$/]",
          message:
            "Do not match display copy (message/description). Branch on the numeric error code or SessionFailureKind instead (ADR-048 §2.1).",
        },
      ],
    },
  },
  {
    files: ["**/eslint.config.*"],
    rules: {
      // eslint-config-next bundles eslint-plugin-import, whose
      // no-anonymous-default-export warns on `export default [...]` — the
      // canonical flat-config idiom. Switch it off for config files so
      // consumers need no `const config = [...]; export default config;` shim.
      "import/no-anonymous-default-export": "off",
    },
  },
  prettierConfig,
  // Framework-generated artifacts; consumers append their own ignores.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/api/_gen/**"]),
];
