import fs from "node:fs/promises";
import path from "node:path";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Extract the package name from an npm spec ("axios@^1" or "@scope/pkg@^2"). */
export function packageNameOf(spec: string): string {
  if (spec.startsWith("@")) {
    const at = spec.indexOf("@", 1);
    return at === -1 ? spec : spec.slice(0, at);
  }
  return spec.split("@")[0];
}

/** Package names declared in the project manifest (dependencies + devDependencies). */
export async function declaredPackageNames(projectRoot: string): Promise<Set<string>> {
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8")) as PackageJson;
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

/** npm package specs missing from the project's dependencies. */
export async function missingPackages(projectRoot: string, specs: string[]): Promise<string[]> {
  const declared = await declaredPackageNames(projectRoot);
  return specs.filter((spec) => !declared.has(packageNameOf(spec)));
}
