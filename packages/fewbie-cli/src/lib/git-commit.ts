import { execCapture } from "@devbie/cli-kit";

/**
 * Commit identity of a registry checkout (ADR-057 D4).
 *
 * A `FEWBIE_REGISTRY_PATH` override is a working tree, not a pinned revision,
 * so it is recorded as `dev`; the lockfile must never pretend a moving local
 * checkout is a release.
 */
export const LOCAL_REGISTRY_COMMIT = "dev";

/** HEAD of the git checkout at `root`; `dev` for the local override, `unknown` when git cannot answer. */
export async function registryCommit(root: string, localOverride: boolean): Promise<string> {
  if (localOverride) return LOCAL_REGISTRY_COMMIT;
  try {
    const { stdout } = await execCapture("git", ["-C", root, "rev-parse", "HEAD"]);
    const commit = stdout.trim();
    return commit === "" ? "unknown" : commit;
  } catch {
    return "unknown";
  }
}
