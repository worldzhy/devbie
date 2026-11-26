/**
 * Minimal shape of a permission group as `/account/me` returns it.
 *
 * Structural on purpose: a host can pass its generated `UserPermissionGroupSummary`
 * DTO without a mapping layer.
 */
export interface PermissionGroupSummary {
  id: number;
  name: string;
  routePath: string;
}
