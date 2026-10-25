# Release Checklist

Run through every step below before publishing any package in this repo (packages/newbie, packages/newbie-cli, packages/cli-kit, packages/modules-state, packages/heartbeat-sdk, packages/health-sdk, packages/web-monitor-sdk, packages/backend-monitor-sdk, packages/aws-secrets-cli, packages/module-hub-cli, packages/fewbie-cli, packages/apits, packages/worklog, packages/style-guide). Do not skip steps for "trivial" patches.

1. `git status` — working tree is clean, all intended changes are committed.
2. Clean build: remove `dist/` and `*.tsbuildinfo` for the package(s) being released, then rebuild. Never publish from a stale `dist/`.
3. Run the full test suite for the package(s) being released; all tests pass.
4. Run `npm audit --omit=dev --workspaces` from the repo root; production dependencies must be free of known vulnerabilities. Any finding must be fixed or explicitly waived (with the reason recorded) before publishing.
5. Confirm the version bump in `package.json` follows semver relative to the actual change set (feat -> minor, fix -> patch, breaking -> major).
6. Publish with `npm publish --tag latest`. Never use a `stage` dist-tag or the `npm stage` workflow. (OTP is not required; decided 2026-09-29.)
7. After publishing, run `npm view <package> dist-tags` to confirm `latest` points to the new version. Registry propagation can take 1-2 minutes — wait and re-check instead of re-publishing.
8. If packages in this repo depend on each other, publish the dependencies first and the dependents last.
9. Update consuming projects' dependency version and record the change in project memory.
10. If any `@devbie/*` package was published in this release, update the starter template lockfile in the newbie-starter repo (commit to dev), then run `npm run check:template-deps -w @devbie/newbie-cli` from the repo root to confirm no drift remains. The script clones the template's default branch — the same source `newbie create` uses — so it only turns green once the dev changes have been merged into main. For `@devbie/fewbie-cli` releases the same applies to the fewbie-starter repo, verified with `npm run check:template-drift -w @devbie/fewbie-cli -- --check-deps`.

## Waived audit findings (re-verify on every release)

- `@devbie/style-guide` — 5 high findings in the `eslint-config-next` tree
  (`eslint-config-next`/`@next/eslint-plugin-next`/`fast-glob`/`micromatch`
  /`braces`), reached via the eslint flat-next layer. Advisories:
  GHSA-vfj7-8cjw-p6xm (braces glob stack-exhaustion DoS, range `*`),
  plus four downstream warnings all tracing to the same root and declaring
  ranges `*` or `>=14.3.0-canary.0`. npm's suggested fix is **downgrade**
  `eslint-config-next` to 14.2.35 (major), which would break the Next.js 16
  consumers this layer was explicitly introduced for (ADR-011 hard
  constraint). Exposure is lint-time only — nothing runs these libraries
  against attacker-controlled globs. Waived since 1.4.0; revisit when
  upstream ships fixes or the dependency-union milestone reshapes the next
  layer.

- `@nestjs/platform-express` — 2 high findings (multer
  GHSA-q7qp-rjg7-q26m, plus the parent edge) against the workspace-installed
  `@nestjs/platform-express@11.2.7`, which pins `multer` exactly `2.4.0`;
  even the latest upstream release (`12.2.0`) still pins it, so no version
  bump can resolve the finding, and a root `overrides` entry is not honored
  by npm 11 while the tree carries an invalid optional-peer edge (attempted
  2026-10-25, reverted). It is a **peerDependency range** of
  `@devbie/newbie` (`^11.0.0 || ^12.0.0`), not a runtime dependency of any
  published package, and no devbie code exercises multer's fileFilter path;
  the host (nightwatch-backend) pins its own NestJS version. Waived
  (2026-10-24, re-verified 2026-10-25); revisit when NestJS ships a release
  with a patched multer pin.

- `@devbie/web-monitor-sdk` — 3 findings, all **indirect**:
  - `braces` high (GHSA-vfj7-8cjw-p6xm, range `*`) and `micromatch` high
    (range `>=0.2.0`) — two chains from Jest 26 devTools:
    `jest-config`/`jest-haste-map`/`jest-util` → micromatch 4.0.8 → braces
    3.0.3, and `sane` → micromatch 3.1.10 → braces 2.3.2.
  - `sprintf-js` moderate (GHSA-hp3w-g68c-fv3c, range `*`) — hoisted into
    the workspace via js-yaml 3 → argparse → sprintf-js; Jest 26 itself
    pulls js-yaml 3 transitively.
    Neither chain ever ships with the package (`publishConfig.files = dist`,
    runtime dependencies = 0), and `micromatch@4.0.8` / `sprintf-js@1.1.3` are
    both upstream latests (advisories range `*`), so no upgrade path exists.
    Waived since 1.1.2; re-check when Jest 30 lands a new micromatch pin or
    upstream patches brace parsing.
