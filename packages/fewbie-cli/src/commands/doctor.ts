import fs from "node:fs/promises";
import path from "node:path";
import { bold, green, red, yellow } from "colorette";

import { CliError } from "@devbie/cli-kit";
import { readModulesFile } from "../lib/modules-file";
import { packageNameOf } from "../lib/npm-spec";
import { loadItem, listRegistryItemNames, resolveRegistryRoot } from "../registry/store";

export interface DoctorOptions {
  /** Project root (global --cwd). */
  cwd?: string;
  /** Emit machine-readable JSON instead of a human report. */
  json?: boolean;
}

/** Severity of a single doctor finding. */
type Severity = "error" | "warn" | "info";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
}

interface DoctorResult {
  projectRoot: string;
  findings: Finding[];
  /** Registry items declared in fewbie.json (ADR-025 F10: the declaration is the criterion). */
  declared: string[];
  /** Count of findings grouped by severity. */
  summary: { error: number; warn: number; info: number };
}

/** Critical CSS variables that every fewbie project must define. */
const REQUIRED_CSS_VARS = [
  "--background",
  "--foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--radius",
];

/** Read a JSON file, returning null when it does not exist. */
async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Run all checks and return the structured result. The function never throws
 * on project issues — those surface as `error`-severity findings. It only
 * throws for unrecoverable CLI failures (e.g. registry not found).
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const projectRoot = path.resolve(options.cwd ?? process.cwd());
  const findings: Finding[] = [];

  // --- 1. Project structure ---
  const hasPackageJson = await fs
    .access(path.join(projectRoot, "package.json"))
    .then(() => true)
    .catch(() => false);
  if (!hasPackageJson) {
    findings.push({
      severity: "error",
      category: "structure",
      message: "No package.json found — not a Node.js project.",
    });
    return finalize(projectRoot, findings, []);
  }

  const hasComponentsJson = await fs
    .access(path.join(projectRoot, "components.json"))
    .then(() => true)
    .catch(() => false);
  if (!hasComponentsJson) {
    findings.push({
      severity: "error",
      category: "structure",
      message: "No components.json found — run 'fewbie create' or add shadcn/ui to this project first.",
    });
    return finalize(projectRoot, findings, []);
  }

  const globalsCssPath = path.join(projectRoot, "src", "app", "globals.css");
  const hasGlobalsCss = await fs
    .access(globalsCssPath)
    .then(() => true)
    .catch(() => false);

  // --- 2. Declared registry modules ---
  // The declaration is the only criterion (ADR-024 F10): files that merely
  // exist (the template ships some registry files) do not imply installation.
  const registryRoot = await resolveRegistryRoot();
  const declaration = await readModulesFile(projectRoot);
  const declaredModules = declaration ?? [];
  if (declaration === null) {
    findings.push({
      severity: "error",
      category: "registry",
      message: `No fewbie.json found — run 'fewbie create' or add { "modules": [] } to the project root.`,
    });
  }

  const available = new Set(await listRegistryItemNames(registryRoot));
  const installedItems: Array<{ name: string; dependencies: string[] }> = [];

  for (const name of declaredModules) {
    if (!available.has(name)) {
      findings.push({
        severity: "warn",
        category: "registry",
        message: `Declared module '${name}' is not present in the registry.`,
      });
      continue;
    }
    const item = await loadItem(registryRoot, name);
    const targets = item.files.map((file) => file.target);
    const present = await Promise.all(
      targets.map((target) =>
        fs
          .access(path.join(projectRoot, target))
          .then(() => true)
          .catch(() => false),
      ),
    );

    if (present.every(Boolean)) {
      installedItems.push({ name, dependencies: item.manifest.dependencies ?? [] });
    } else {
      findings.push({
        severity: "warn",
        category: "registry",
        message: `Module '${name}' is partially installed — missing: ${targets
          .filter((_, index) => !present[index])
          .join(", ")}. Run 'fewbie modules apply' to repair.`,
      });
    }
  }

  // --- 3. Dependency completeness for declared modules ---
  const pkg = (await readJsonSafe<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(projectRoot, "package.json")))!;
  const declaredPackages = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);

  for (const item of installedItems) {
    const missing = item.dependencies.filter((spec) => !declaredPackages.has(packageNameOf(spec)));
    if (missing.length > 0) {
      findings.push({
        severity: "warn",
        category: "dependencies",
        message: `Module '${item.name}' is missing dependencies: ${missing.join(", ")}. Run 'npm install ${missing.join(" ")}'.`,
      });
    }
  }

  // --- 4. CSS variables ---
  if (hasGlobalsCss) {
    const css = await fs.readFile(globalsCssPath, "utf8");
    const missingVars = REQUIRED_CSS_VARS.filter((v) => !css.includes(v));
    if (missingVars.length > 0) {
      findings.push({
        severity: "warn",
        category: "tokens",
        message: `globals.css is missing design tokens: ${missingVars.join(", ")}. Re-run shadcn init or restore the token block.`,
      });
    } else {
      findings.push({
        severity: "info",
        category: "tokens",
        message: `All ${REQUIRED_CSS_VARS.length} required design tokens present in globals.css.`,
      });
    }
  } else {
    findings.push({
      severity: "warn",
      category: "tokens",
      message: "src/app/globals.css not found — cannot verify design tokens.",
    });
  }

  // --- 5. AI readability ---
  // Registry items are copied into the project as source (shadcn philosophy),
  // so AI tools can read them without an npm package boundary.
  if (declaredModules.length > 0) {
    findings.push({
      severity: "info",
      category: "ai-readability",
      message: "Declared module sources are plain project files, readable by AI tools.",
    });
  }

  return finalize(projectRoot, findings, declaredModules);
}

function finalize(projectRoot: string, findings: Finding[], declared: string[]): DoctorResult {
  const summary = { error: 0, warn: 0, info: 0 };
  for (const finding of findings) summary[finding.severity]++;
  return { projectRoot, findings, declared, summary };
}

/** Format the doctor result for human consumption. */
export function formatDoctorReport(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push(bold(`fewbie doctor — ${result.projectRoot}`));
  lines.push("");

  if (result.declared.length > 0) {
    lines.push(`${green("Declared modules")}: ${result.declared.join(", ")}`);
  } else {
    lines.push(yellow("No modules declared in fewbie.json."));
  }
  lines.push("");

  if (result.findings.length === 0) {
    lines.push(green("All checks passed."));
    return lines.join("\n");
  }

  const icon = (s: Severity) => (s === "error" ? red("✗") : s === "warn" ? yellow("!") : green("✓"));

  for (const f of result.findings) {
    lines.push(`${icon(f.severity)} [${f.category}] ${f.message}`);
  }

  lines.push("");
  lines.push(`${result.summary.error} error(s), ${result.summary.warn} warning(s), ${result.summary.info} info`);

  return lines.join("\n");
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const result = await runDoctor(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDoctorReport(result));
  }

  // Exit non-zero when there are errors so CI can gate on doctor.
  if (result.summary.error > 0) {
    throw new CliError("Doctor found errors.");
  }
}
