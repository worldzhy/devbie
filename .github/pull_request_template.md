## Summary

## Design review

- [ ] This change introduces no new cross-host contract, renamed concept, or architecture decision, OR an ADR is linked below and was accepted before this PR was opened.
  - ADR:

## Module coupling

- [ ] New or changed module dependencies are declared explicitly in `newbie.module.json` (`moduleDependencies`) and `newbie modules lint` passes.

## Security review

- [ ] No raw credentials (tokens, passwords, full request/response bodies) are written to logs, audit records, or error messages by this change.

## Audit coverage

- [ ] If this PR adds or changes an auth/session/login code path, every new success and failure branch calls the audit log service, and the relevant contract test is updated and passing.

## Tech debt

- [ ] This PR does not leave new `any` types or TODOs in code paths it enables/assembles. Debt in a module is paid in the same PR that turns the module on.

## Release impact

- [ ] No package version bump is needed, OR the bump follows `RELEASE_CHECKLIST.md` (latest dist-tag only, no stage workflow).

## Coordination

- [ ] Checked `git log`/`git status` and `PENDING_PUSH.md` for other in-flight work on the same module before starting this change.
- [ ] Pushed to `origin` right after committing (`git push origin dev`); only left unpushed with a `PENDING_PUSH.md` entry if the push was deliberately deferred.
