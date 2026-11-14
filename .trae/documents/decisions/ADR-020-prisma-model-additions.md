# ADR-020: host-side Prisma model additions

Date: 2026-10-21
状态：已采纳
Supersedes: none

## Context

A module ships a Prisma fragment (e.g. `account` defines `User`, `Session`,
`ApiKey`, ...). The fragment is copied verbatim into the host's
`prisma/models/<key>.prisma` by `assembleSchemaFiles`
(`packages/newbie-cli/src/assemble/schema.ts`), and the file is rewritten on
every `newbie install` / `newbie update`. The header says `DO NOT EDIT`.

A module fragment is host-agnostic: it must never name a host-owned model. The
host, however, routinely needs the two sides **linked**, in both directions — a
host table pointing at a module table (`ProjectMember.user`), a module table
pointing at a host table (`TaskSpace.project`). Prisma requires **both** sides of
a relation to be declared, and the module side cannot declare the half that
names a host model. `prisma-additions/<key>.prisma` therefore carries the
**module-side half** of those links (forward relation field plus its scalar,
reverse relation arrays, and the additive extras below); the **host-side half**
is declared in the host's `prisma/schema.prisma`. Prisma reads the generated
fragment and `schema.prisma` as one schema, so the relation is complete while
each file stays owned by one party. The motivating example in nightwatch-backend:

```prisma
// prisma/schema.prisma (host-owned, application schema)
model ProjectMember {
  projectId String
  userId    String
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ...
}
```

In the example above the missing half is the reverse array: `User` lives in the
`account` module and does not know about `ProjectMember`, so the host must add
`projectMemberships ProjectMember[]` to `User`. Today the host edits the
generated `prisma/models/account.prisma` by hand; the next assembly wipes the
field and `prisma generate` fails with "The relation field ... is missing an
opposite relation field".

The runtime `$extends` mechanism in `@devbie/newbie/prisma`
(`prisma.extension.ts`) cannot solve this: it adds client methods and
middleware, not schema-level model fields or relations. The gap is purely
at the schema-assembly layer.

## Candidates

1. **Host-side addition file.** The host creates
   `prisma-additions/<key>.prisma` declaring only the fields it adds to
   module models (e.g. `model User { projectMemberships ProjectMember[] }`).
   The framework reads the module fragment and the addition file, merges the
   added fields into the matching models, and writes the combined
   `prisma/models/<key>.prisma`. The addition file is never touched by
   assembly.

2. **Marker blocks inside the generated file.** The framework emits
   `// @@model-additions-start` / `// @@model-additions-end` markers inside
   each model in `<key>.prisma`; the host edits between the markers and the
   framework preserves that region on reassembly.

3. **Do nothing.** The host keeps hand-editing the generated file and
   re-applies the fields after every `newbie install`.

## Decision

- **Adopt candidate 1 (host-side addition file).** Decisive reason:
  ownership is clean and non-overlapping. `prisma/models/<key>.prisma` is
  fully framework-generated (read-only); `prisma-additions/<key>.prisma` is fully
  host-owned (never read by Prisma directly, never written by the framework).
  This matches the ADR-009 file-ownership registry model (one owner per file)
  and avoids the semantic contradiction of a `DO NOT EDIT` file that actually
  contains an editable region (candidate 2).
- **Location is constrained, not stylistic: the file must live outside
  `prisma/`.** Two independent mechanisms would otherwise destroy it, both
  verified empirically against nightwatch-backend on Prisma 7.10.1:
  - `prisma.config.ts` sets `schema: "prisma/"`, so Prisma's multi-file
    resolver loads **every** `.prisma` file under that directory recursively.
    A probe file `prisma/models/adr020-probe.host.prisma` declaring `model User` made
    `prisma validate` report `The following fields do not exist in the
    related model User: id` on every `references: [id]` — the module's own
    `User` was shadowed. Prisma has no exclusion list for multi-file schemas.
  - `assembleSchemaFiles` (`packages/newbie-cli/src/assemble/schema.ts`,
    step 2) deletes every `prisma/models/*.prisma` whose stem is not an
    enabled module key, so `account.host` would be swept on the next
    `newbie install`.
  A sibling directory is immune structurally rather than by a suffix
  blacklist: Prisma never scans it, and the sweep never walks it.
- **Directory name: `prisma-additions/`.** The name describes the content,
  not the owner: the directory holds the **module-side half** of the links
  between module tables and host-owned tables (and between module tables of
  different modules) — forward relation fields and their scalars, reverse
  relation arrays — plus, in the same additive spirit, host indexes and
  host-only scalar fields on module models. The host-side half stays in
  `prisma/schema.prisma`. "Addition" also
  encodes the constraint this ADR already decided — additive only, a colliding
  field is an error, never an override. `extension` was rejected because the
  framework already spends that word on the runtime client layer
  (`prisma.extension.ts`, `$extends`, `registerExtension`); a second meaning
  would make a search for "extension" ambiguous. `overlay`/`patch` were
  rejected as semantically wrong under the fail-loud conflict rule, and
  `fragment` is already taken for module-owned Prisma files (`manifest.schema`
  in `module-install.ts`). The `prisma-` prefix also keeps the directory
  sorted next to `prisma/`, which a name like `schema-extensions/` would not.
  Verified with a probe file in a sibling `prisma-*` directory declaring a
  duplicate `model User`: `prisma validate` passed, confirming the configured
  path is exact rather than a prefix glob, so no sibling directory is scanned.
- **Merge scope: any field, relation, index, or `@@` attribute** that the
  host appends to a module model. The immediate need is reverse relations,
  but restricting to relations only forces a follow-up ADR the first time a
  host needs a host-scoped `@@index` or scalar field on a module model.
- **Conflict handling: fail loudly.** If a host field name collides with a
  field already declared by the module, `newbie install` aborts with a list
  of colliding fields. No silent override: a module upgrade that adds a
  field must be visible to the host, not masked.
- **Parser: a lightweight model-block extractor.** The framework only needs
  to (a) locate `model X { ... }` blocks in the module fragment, (b) locate
  the same blocks in the addition file, and (c) append the added field lines
  before the closing brace. A brace-counting state machine is sufficient;
  no full Prisma AST / DMMF dependency is introduced. The merged output is
  validated by the existing `prisma generate` step, which already runs as
  part of `assembleSchemaFiles`.
- **Convention: `prisma-additions/<key>.prisma`.** The directory sits beside
  `prisma/` so a host editor sees the generated fragments and the host
  additions in one glance. It is host-owned: the framework never creates,
  deletes, or drift-checks it. If the file exists for a disabled module, it is
  ignored (no error). The file is a normal `.prisma` file for tooling
  (formatting, syntax highlighting) precisely because Prisma itself does not
  load that directory.

## Cross-host check

The mechanism is host-agnostic: any Nest + Prisma host that assembles a module
can drop a `prisma-additions/<key>.prisma` to link the module's models to
host-owned models the module cannot name. It only writes the module-side half
of a link, and only into models that exist in that module's fragment: it cannot
declare a new model, and it cannot add a field to a host-owned model (those
live in `prisma/schema.prisma`). No
nightwatch-specific concept (ProjectMember, application schema) leaks into
the framework or the module. The module's own `schema.prisma` stays
unchanged and host-agnostic. The merge is purely additive on the host side.

## Consequences

- `assembleSchemaFiles` renders **every enabled** module fragment, not only
  the newly added keys. Without that change a host addition would never reach
  the generated file on a plain `newbie install` (step 1 previously ran for
  `added` only), so the merge would be dead code. The new
  `mergeModelAdditions` helper in `core/prisma-schema.ts` does the block
  extraction and append; additions are placed before the model's `@@` block
  attributes so the generated model keeps the canonical shape.
- The generated fragment keeps its `DO NOT EDIT` header; host edits go into
  `prisma-additions/<key>.prisma`.
- Rollout order matters: a host running a `newbie-cli` older than the release
  carrying this ADR ignores `prisma-additions/` and regenerates the fragment
  without the added fields. The migration in nightwatch-backend is in place,
  but it only becomes stable after that release: until then `newbie install`
  in that host fails loudly at `prisma generate` (missing opposite relation
  field) instead of silently dropping the relation.
- nightwatch-backend migrated in this milestone: `projectMemberships` moved
  out of `prisma/models/account.prisma` into `prisma-additions/account.prisma`;
  the regenerated fragment is byte-identical to the merge output
  (`prisma validate` passes).
- `prisma-additions/` is host-owned and outside the ADR-009 ownership registry:
  template-sync never compares it, and it does not exist in newbie-starter
  (a fresh host starts without the directory).
- `prisma validate` (already implicit in `prisma generate`) catches malformed
  host fragments; the assembly step additionally reports the additions file
  path plus every colliding `model.field`, and the run exits non-zero.
- No new runtime dependency. The parser is self-contained in
  `packages/newbie-cli`.
