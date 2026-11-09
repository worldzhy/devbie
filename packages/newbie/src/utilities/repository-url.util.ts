/**
 * Extracts the `{ owner, repo }` slug from a Git repository URL, independent
 * of the hosting provider.
 *
 * Supports both HTTPS (`https://host/owner/repo`) and SSH (`git@host:owner/repo`)
 * forms, with an optional `.git` suffix and trailing slash. Returns null when
 * the URL does not resolve to an owner/repo pair.
 *
 * Provider-specific wrappers (`parseGitHubUrl`, `parseBitbucketUrl`) layer a
 * host check on top of this; host code that needs any provider's slug (for
 * example security-evaluation entity matching) calls this directly.
 */
export function parseRepositorySlug(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  // SSH form: git@host:owner/repo(.git)(/)
  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  // HTTPS form: https?://host/owner/repo(.git)(/) — exactly two path segments
  // so a deep link like /owner/repo/tree/main is rejected rather than read as
  // owner=tree, repo=main.
  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname
      .replace(/\/$/, "")
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean);
    if (segments.length !== 2) return null;
    return { owner: segments[0], repo: segments[1] };
  } catch {
    return null;
  }
}
