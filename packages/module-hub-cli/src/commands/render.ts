import { bold, cyan, gray, green, yellow } from "colorette";
import { CliError } from "@devbie/newbie-cli/lib";

import type { InstallationInspection } from "../client";

/** Render an ISO timestamp as `YYYY-MM-DD HH:mm:ss UTC`, or a dash when absent. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** Assert that the installation the token belongs to is the one we expected. */
export function assertExpectedLabel(inspection: InstallationInspection, expected: string | null): void {
  if (!expected) return;
  const actual = inspection.installation.label;
  if (actual !== expected) {
    throw new CliError(
      `Installation label mismatch: expected '${expected}' but the token resolves to '${actual ?? "(none)"}'.`,
    );
  }
}

/** Print installation facts, the recorded snapshot and the target spec. */
export function renderInstallationInspection(inspection: InstallationInspection): void {
  const { installation } = inspection;

  console.log(bold(`Installation: ${installation.label ?? "(unnamed)"}`));
  console.log(`  ${gray("id")}         ${installation.id ?? "-"}`);
  console.log(`  ${gray("env")}        ${installation.env ?? "-"}`);
  console.log(`  ${gray("appVersion")} ${installation.appVersion ?? "-"}`);
  console.log(`  ${gray("framework")}  ${installation.frameworkVersion ?? installation.framework ?? "-"}`);
  console.log(`  ${gray("instanceId")} ${installation.instanceId ?? "-"}`);
  console.log(`  ${gray("lastSeenAt")} ${formatTimestamp(inspection.reportedAt)}`);

  console.log();
  if (!inspection.actual || inspection.actual.length === 0) {
    console.log(yellow("No module snapshot reported yet — start the process, then re-run."));
  } else {
    console.log(bold(`Reported modules (${inspection.actual.length})`));
    for (const module of inspection.actual) {
      const key = typeof module.key === "string" ? module.key : "(unknown)";
      const version = typeof module.version === "string" ? module.version : "-";
      const commit = typeof module.sourceCommit === "string" ? module.sourceCommit.slice(0, 12) : "-";
      console.log(`  ${cyan(key.padEnd(24))} ${version.padEnd(10)} ${gray(commit)}`);
    }
  }

  console.log();
  if (!inspection.targetSpec) {
    console.log(gray("No target spec set by the host."));
    return;
  }
  const targetModules = inspection.targetSpec.modules;
  const targetCount = Array.isArray(targetModules) ? targetModules.length : 0;
  console.log(bold(`Target spec: ${targetCount} module(s) marked by the host`));
  console.log(gray("  (target-vs-actual comparison is rendered by the hub UI)"));
}

/** Print one verification mismatch. */
export function renderMismatch(mismatch: {
  key: string;
  reason: string;
  localSourceCommit?: string | null;
  remoteSourceCommit?: string | null;
}): void {
  const local = mismatch.localSourceCommit ? mismatch.localSourceCommit.slice(0, 12) : "-";
  const remote = mismatch.remoteSourceCommit ? mismatch.remoteSourceCommit.slice(0, 12) : "-";
  console.log(`  ${yellow(mismatch.key.padEnd(24))} ${mismatch.reason.padEnd(22)} local:${local} hub:${remote}`);
}

/** Print the success line for a clean verification. */
export function renderVerificationOk(count: number): void {
  console.log(green(`OK: ${count} module(s) match the hub snapshot.`));
}
