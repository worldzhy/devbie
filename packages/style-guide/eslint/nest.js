import nestjsTyped from "@darraghor/eslint-plugin-nestjs-typed";
import prettierConfig from "eslint-config-prettier";

/**
 * Nest layer for the devbie ecosystem.
 *
 * This is a layer, not a standalone standard: compose it after `base`
 * (`export default [...base, ...nest]`). Keeping it separable lets a
 * monorepo scope the Nest rules to the packages that actually contain Nest
 * code, instead of applying a framework standard to its plain Node packages.
 *
 * The rule set is the plugin's recommended flat config. Four of those rules
 * are type-aware, so every file covered by this layer must belong to a
 * TypeScript project (projectService resolves the nearest tsconfig.json). The
 * plugin's own peer declarations bring what its rules expect (`class-validator`
 * is referenced by name only — the rules never import it at lint runtime), and
 * npm/pnpm auto-install those peers, so no extra install step is required.
 *
 * `prettierConfig` is repeated here so that composing `[...base, ...nest]`
 * still ends on the formatting-rule shutdown.
 */
export default [
  ...nestjsTyped.configs.flatRecommended,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },
  {
    // ADR-048 §2.2: persisted audit reasons are snake_case history. A dash in
    // `detail.reason` means the wire/kind spelling leaked into an audit column,
    // which silently forks the value space. Strategy files are excluded here
    // because the block below carries the same selector together with the
    // exception ban: `no-restricted-syntax` merges by replacement, so a file
    // matched by two blocks only keeps the last one's selectors.
    files: ["**/src/**/*.ts", "!**/*.strategy.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='detail'] > ObjectExpression > Property[key.name='reason'] > Literal[value=/-/]",
          message:
            "Audit detail.reason is a persisted snake_case value; a dash here forks the audit vocabulary (ADR-048 §2.2).",
        },
      ],
    },
  },
  {
    // ADR-048 §6.4: a passport strategy that throws a bare Nest exception
    // produces an uncoded 401/403, which a client cannot tell apart from any
    // other failure. Authentication strategies must go through the coded
    // NewbieException contract instead.
    // Scoped to the account strategies, the surface ADR-048 migrated. The
    // security strategies still throw a bare UnauthorizedException for a
    // missing credential, which has no code in the 13-code table yet; they
    // join this gate once §7 adds that code (tracked in the backend backlog).
    files: ["**/src/modules/account/**/*.strategy.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='ForbiddenException']",
          message: "Auth strategies must throw a coded NewbieException, not a bare ForbiddenException (ADR-048 §6.4).",
        },
        {
          selector: "NewExpression[callee.name='UnauthorizedException']",
          message:
            "Auth strategies must throw a coded NewbieException, not a bare UnauthorizedException (ADR-048 §6.4).",
        },
        {
          selector: "Property[key.name='detail'] > ObjectExpression > Property[key.name='reason'] > Literal[value=/-/]",
          message:
            "Audit detail.reason is a persisted snake_case value; a dash here forks the audit vocabulary (ADR-048 §2.2).",
        },
      ],
    },
  },
  prettierConfig,
];
