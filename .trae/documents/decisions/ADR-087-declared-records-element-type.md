# ADR-087: List response DTOs declare the `records` element type

**Status:** Adopted (2026-11-26)
**Scope:** the shared list DTO in `@devbie/newbie`, every list response DTO in the module registry, and the apits-generated clients
**Preceded by:** ADR-015 (apits merged into devbie)

## Problem

`CommonListResponseDto<T>` in `packages/newbie/src/common.dto.ts:51-63` advertises `records` as an untyped array:

```ts
@ApiProperty({ type: Object, isArray: true, description: "List of records in the current page" })
records!: T[];
```

TypeScript generics are erased at runtime, so Swagger only sees `type: Object, isArray: true`. Every DTO written as `extends CommonListResponseDto<BackendMonitorRequestLogResponseDto> {}` inherits that metadata unchanged. The OpenAPI document says `records: object[]`, and apits emits `records: {}[]` — 15+ occurrences in `nightwatch-frontend/src/api/_gen/api.ts` at the time of writing.

Consumers then lie to the compiler: 25 `as unknown as` assertions across the console, mostly on the frontend-monitor and backend-monitor pages.

Two forms exist side by side in the registry:

| Form | Example | Swagger result |
|---|---|---|
| **declared form** (correct) | `ListMembershipLevelsResponseDto extends CommonListResponseDto { @ApiProperty({ type: MembershipLevelResponseDto, isArray: true }) declare records: MembershipLevelResponseDto[]; }` (`membership/membership.dto.ts:66-69`) | `records: MembershipLevelResponseDto[]` |
| **inherited form** (broken) | `ListBackendMonitorRequestLogsResponseDto extends CommonListResponseDto<BackendMonitorRequestLogResponseDto> {}` (`backend-monitor/backend-monitor.dto.ts:365`) | `records: object[]` → `{}[]` |

The inherited form looks typed because it passes a generic argument, which is exactly why the gap survived review.

## Why this matters

1. The generated client is the contract. If it says `{}`, a renamed or dropped field compiles clean and fails at runtime — the opposite of the "unrepresentable illegal state" rule the DTO layer is supposed to enforce.
2. List rows that support expansion need a stable row key. The backend-monitor record DTOs already expose `request_id` (and `fingerprint` on error records), but the generated client hides them behind `{}`, so the page keys expansion state by array index. After a sort, a page change, or a stream refresh, "row 3" is a different log and the expanded panel shows the wrong content.
3. The declared form already exists and is the majority in the registry; this is not a new pattern, it is removing an exception.

## Decision

**D1 — declared records.** Every concrete list response DTO declares the element type of `records`. Use the declared form: extend `CommonListResponseDto` (with or without the generic argument) and redeclare:

```ts
export class ListBackendMonitorRequestLogsResponseDto extends CommonListResponseDto<BackendMonitorRequestLogResponseDto> {
  @ApiProperty({ type: BackendMonitorRequestLogResponseDto, isArray: true })
  declare records: BackendMonitorRequestLogResponseDto[];
}
```

The base's `records` decorator is removed. Without it, a subclass that forgets the redeclaration loses `records` from the generated client, which fails at the consumer's compile step instead of silently shipping `{}[]`.

Rejected alternatives:

- **Keep the base decorator and rely on review.** This is the status quo that produced 22 inherited-form DTOs; without a loud failure the same omission returns.
- **Runtime parsing in the frontend.** It moves a static contract into a hand-written validator per consumer and leaves the generated client wrong for every other host.

**D2 — stable row key.** Every interactive list row is keyed by the endpoint's stable row identifier (row key), never by array index. Where the record DTO already exposes one, use it: `request_id` for backend request logs, `request_id` + `fingerprint` for backend error logs. No new ClickHouse column is required. If a future interactive list has no row key, the endpoint adds one; an index key is not an acceptable substitute.

**Optional hardening (not required by this ADR).** Remove the `= any` default from `CommonListResponseDto<T>` so each list DTO must name its element type in the type argument. This catches a subclass that omits the argument entirely, but it does not catch the inherited form — the OpenAPI gate below is the real guard. Treat it as a follow-up strengthening, not a substitute.

## Names deliberately kept

| Name | Kept because |
|---|---|
| `records` (wire field) | Renaming it to `items` would change a field consumed by the backend, apits and every host client, for zero functional gain. |
| `CommonListResponseDto` | "Common" carries no information, but it is a public export of `@devbie/newbie` extended by every host. A rename is a cross-host breaking change with no behavioural benefit. |

## Consequences

- **`@devbie/newbie`**: remove the `records` decorator from `CommonListResponseDto`; document the declared form on the class.
- **Registry modules**: 22 inherited-form DTOs migrate to the declared form — backend-monitor (2), security-evaluation (5), penetration-testing (4), work-evaluation (7), evaluation (1), job-scheduler (1), task-management (1), event-emitter (1). The consumer host's `src/modules/**` is regenerated by assembly, not hand-edited.
- **apits**: regenerate; `records` becomes `RecordDto[]`. Frontend assertions (`as unknown as`) are deleted module by module.
- **Enforcement**: add a devbie test that renders the OpenAPI document and fails when any response schema declares `records` as a plain object array. Without a gate, a new inherited-form DTO reintroduces the gap invisibly.
- **Rollout order**: migrate all inherited-form DTOs and remove the base decorator in the same change, then regenerate clients. Removing the decorator first would delete `records` from clients that still rely on it.

## Cross-host check

| Dimension | Framework layer (`@devbie/newbie`) | Host / registry layer |
|---|---|---|
| `records` contract | Base advertises no untyped `records`; a subtype must declare the element type | Each list DTO declares its own record DTO |
| Generated client | apits emits `records: RecordDto[]` | Hosts consume the generated type; local row interfaces and `as unknown as` go away |
| Row key | No runtime mechanism in the framework | Host pages key rows by `request_id` / `fingerprint`; an endpoint without a row key must add one |
| Portability | Any host that regenerates gets typed records | Mechanical migration; omissions fail at compile time |

## Not superseding anything

No existing ADR described the `records` contract. ADR-015 only records apits living in this repository; this ADR governs the metadata it consumes. No status change elsewhere.
