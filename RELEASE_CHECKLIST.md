# Release Checklist

Run through every step below before publishing any package in this repo (packages/newbie, packages/newbie-cli, packages/cli-kit, packages/modules-state, packages/heartbeat-sdk, packages/health-sdk, packages/frontend-monitor-sdk, packages/backend-monitor-sdk, packages/aws-secrets-cli, packages/module-hub-cli, packages/fewbie-cli, packages/apits, packages/worklog, packages/style-guide). Do not skip steps for "trivial" patches.

1. `git status` — working tree is clean, all intended changes are committed.
2. Clean build: remove `dist/` and `*.tsbuildinfo` for the package(s) being released, then rebuild. Never publish from a stale `dist/`.
3. Run the full test suite for the package(s) being released; all tests pass.
4. Run `npm audit --omit=dev --workspaces` from the repo root; production dependencies must be free of known vulnerabilities. Any finding must be fixed or explicitly waived (with the reason recorded) before publishing.
5. Confirm the version bump in `package.json` follows semver relative to the actual change set (feat -> minor, fix -> patch). Breaking changes ship as **minor** while the packages are pre-launch and stay on the 1.x line; the 2.0 line is opened only by an explicit decision to declare the API stable. A breaking change never ships as a patch.
6. Publish with `npm publish --tag latest --access public` (the `--access public` flag is mandatory for all `@devbie/*` scoped packages — npm defaults scoped packages to restricted access, which triggers a staging approval flow that blocks subsequent publishes). Never use a `stage` dist-tag or the `npm stage` workflow. (OTP is not required; decided 2026-09-29.) Keep the full publish output — never pipe it through `tail`, the server response decides the next step.

   **Rotation Lambda artifact (`@devbie/aws-secrets-cli` only):** release is incomplete until the matching artifact is published, because the web UI deploys it through CloudFormation (ADR-046). After the version bump, run
   `ROTATION_ARTIFACT_BUCKET=<bucket> npm run release:rotation -w @devbie/aws-secrets-cli`
   and confirm the script's HEAD verification of both objects passes. Record the printed template URL; it is the value for the consumer's `NEXT_PUBLIC_AWS_SECRETS_ROTATION_LAMBDA_CLOUDFORMATION_TEMPLATE_URL`. Re-run without a version bump when only the artifact needs replacing — never point the URL at a mutable key.

   **Failure handling (never blind-bump the version):**
   - If exit code is 0 → proceed to step 7.
   - If `E409 Cannot publish over previously staged version <X>` → the prior publish reached the registry. Skip bumping; run step 7 to verify the staged version is actually available.
   - If `403 Granular access tokens may not perform this action` → some operation (unpublish) requires a classic token. Report to the user; do not retry with the same token.
   - If any other non-zero exit → `curl https://registry.npmjs.org/@devbie%2F<package-name>` to inspect the live state before deciding whether to retry, bump, or report.

7. **Do NOT use `npm view` for verification** — it has a local cache (TTL 1-3 min) that silently serves stale values. Instead:
   ```bash
   sleep 60  # npm global eventual consistency takes 30-60s
   curl -s "https://registry.npmjs.org/@devbie%2F<package-name>" | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   latest = d['dist-tags']['latest']
   tarball = d['versions'][latest].get('dist', {}).get('tarball', '')
   assert latest == '<version>', f'latest tag mismatch: expected <version>, got {latest}'
   assert tarball.endswith(f'-{latest}.tgz'), f'tarball missing or wrong name: {tarball}'
   print(f'OK: {latest} published, tarball exists')
   "
   ```
   Only after both assertions pass is the release confirmed. If `latest` still points to the old version after 60s, wait another 30s and re-check — never re-publish or bump.
8. If packages in this repo depend on each other, publish the dependencies first and the dependents last.
9. Update consuming projects' dependency version and record the change in project memory.
10. If any `@devbie/*` package was published in this release, update the starter template lockfile in the newbie-starter repo (commit to dev), then run `npm run check:template-deps -w @devbie/newbie-cli` from the repo root to confirm no drift remains. The script clones the template's default branch — the same source `newbie create` uses — so it only turns green once the dev changes have been merged into main. For `@devbie/fewbie-cli` releases the same applies to the fewbie-starter repo, verified with `npm run check:template-deps -w @devbie/fewbie-cli` (the `--check-deps` flag belongs to no script — `check:template-drift` only compares file drift and ignores it).

11. **Reconcile the whole registry state, not just `latest`.** A release is complete only when four things agree: the package's source `version`, `dist-tags.latest`, the `deprecated` field of every published version, and the consumers' `package.json` plus lockfile. Print all of them in one pass before deciding anything:

    ```bash
    curl -s "https://registry.npmjs.org/@devbie%2F<package-name>" | python3 -c "
    import sys, json
    d = json.load(sys.stdin)
    print('dist-tags:', d['dist-tags'])
    for v in sorted(d['versions']):
        print(f\"  {v:14} | {d['versions'][v].get('deprecated') or '(live)'}\")
    "
    ```

    Reading only `dist-tags` and the version list hides stale deprecation messages, which then surface one round later as a wrong migration instruction.

## Post-release registry hygiene

- A version whose `dist` is byte-identical to another published version is a release accident, not a release. Bump only when the artifact changes; verify with `diff -r` against the reference tarball before treating a duplicate as legitimate.
- Withdraw accidents within the 72-hour window (`npm unpublish <pkg>@<version>`). npm's unpublish policy allows this while the version is younger than 72 hours and no package in the public registry depends on it.
- A granular access token that bypasses 2FA cannot unpublish — the registry answers `403 ... Granular access tokens that bypass two-factor authentication may not perform this action`. Unpublishing needs a classic token or an interactive login with OTP. `npm unpublish --dry-run` only validates the command line and never sends a request, so it proves nothing about authorization.
- When unpublishing is unavailable, deprecate the version with a message that names the version users must move to. A deprecation pointing at a version that lacks the fix is worse than no deprecation at all — read the existing message before leaving it in place.
- `dist-tags` only affect an unversioned install. Range resolution (`^1.8.0`) picks the highest published version regardless of tags, so moving `latest` does not move consumers; only withdrawing the version or pinning an exact version does.
- A renamed package keeps its old name as a deprecated stub rather than being unpublished, because consumers on other branches may still lock the old version and would break on `npm ci`.

## Version identities

Three version numbers coexist in this repo, and none is derived from another
(R5-P2-18):

| Identity | Source                         | Meaning                                                               |
| -------- | ------------------------------ | --------------------------------------------------------------------- |
| `3.2.0`  | root `package.json`            | Private workspace/tooling version. Not published to npm.              |
| `4.1.1`  | git tags (`v4.x`)              | Workspace release milestone. A tag is not a package version.          |
| `1.x`    | each `packages/*/package.json` | Published `@devbie/*` version; the only number npm consumers resolve. |

When releasing, bump only the package being published. Never infer a package
version from the latest tag, and never bump the root version to match a tag;
move the tag separately when the milestone ships.

## Host deployment gates (nightwatch-backend)

Package releases do not deploy the host. When the change set ships a data
backfill that the new runtime code depends on, the backfill runs against the
**new image before** the backend container is recreated (R34-04):

1. `npm run seal:totp-secrets` inside a container of the new image — seals TOTP
   shared secrets written by the old code, because the new code refuses to read
   an unsealed column as a secret. Idempotent: already-sealed rows are skipped.
2. Only after the backfill reports success, recreate the backend service
   (`deploy/scripts/deploy.sh backend`).

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

- `@devbie/frontend-monitor-sdk` — 3 findings, all **indirect**:
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

- Lint toolchain — 10 moderate findings reported by
  `npm audit --omit=dev --workspaces`: `glob` (GHSA AbortSignal cancellation
  bypass), `minimatch` (globparts DoS), `@typescript-eslint/typescript-estree`,
  `@typescript-eslint/parser`, `@typescript-eslint/utils`,
  `@typescript-eslint/type-utils`, `@typescript-eslint/eslint-plugin`,
  `typescript-eslint`, `eslint-config-next` and
  `@darraghor/eslint-plugin-nestjs-typed`. Every chain is lint-time only: the
  ESLint toolchain that `@devbie/style-guide` and the backend lint layer depend
  on. No published package ships them (`files = dist`, runtime dependencies = 0) and nothing resolves attacker-controlled globs at runtime. npm's only
  remediation is a semver-major bump/downgrade of `eslint-config-next` or
  `typescript-eslint`, which the dependency-major policy defers to a dedicated
  upgrade milestone. Recorded 2026-11-06 while releasing
  `@devbie/frontend-monitor-sdk@1.5.1`; revisit when upstream ships a non-major fix.
