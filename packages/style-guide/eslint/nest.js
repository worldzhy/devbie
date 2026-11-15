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
    // ADR-048 §2.2 INV-8: a wire DTO enum is a project-owned JSON value, so its
    // spelling is kebab-case. A lowercase snake_case member (the old
    // `InstallationStatus.NOT_ENABLED = "not_enabled"`) makes one DTO spell
    // siblings two different ways and leaks the persistence casing onto the
    // wire. SCREAMING_SNAKE values are left alone: they are a legacy constant
    // style, not the snake/kebab mix this gate is about.
    //
    // Scoped to `src/application`: that is where host wire DTOs live. The
    // registry modules carry external identifiers (CloudWatch metric names,
    // ClickHouse tables) and persistence keys, which ADR-048 §2.2 explicitly
    // keeps in snake_case, so they must not be matched here.
    //
    // The audit selector is repeated because `no-restricted-syntax` merges by
    // replacement: this block is the last one matching an application file.
    files: ["**/src/application/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='detail'] > ObjectExpression > Property[key.name='reason'] > Literal[value=/-/]",
          message:
            "Audit detail.reason is a persisted snake_case value; a dash here forks the audit vocabulary (ADR-048 §2.2).",
        },
        {
          selector: "TSEnumMember > Literal[value=/_/]:not([value=/^[A-Z_0-9]+$/])",
          message:
            "Wire enum values are kebab-case; a lowercase snake_case value forks the wire vocabulary (ADR-048 §2.2).",
        },
      ],
    },
  },
  {
    // ADR-048 §6.4: a passport strategy that throws a bare Nest exception
    // produces an uncoded 401/403, which a client cannot tell apart from any
    // other failure. Authentication strategies must go through the coded
    // NewbieException contract instead.
    // Scoped to every module strategy (not just account): the security
    // strategies join the gate once §7 supplies a code for a missing
    // credential (Session_Missing / 1105, newbie 1.18.1).
    files: ["**/src/modules/**/*.strategy.ts"],
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
