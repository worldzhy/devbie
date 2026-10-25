import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";

/** Assert the directory is a Node.js project (package.json present). */
export async function assertProjectRoot(projectRoot: string): Promise<void> {
  await fs.access(path.join(projectRoot, "package.json")).catch(() => {
    throw new CliError(`No package.json found in ${projectRoot}. Run this command inside a Next.js project.`);
  });
}
