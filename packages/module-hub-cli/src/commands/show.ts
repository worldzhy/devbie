import { bold, gray } from "colorette";

import { fetchInstallationInspection } from "../client";
import { resolveCredentials, resolveExpectedLabel } from "../env";
import type { HubCommandOptions } from "../options";
import { assertExpectedLabel, renderInstallationInspection } from "./render";

/**
 * `newbie module-hub show` — print this installation's runtime facts plus the
 * module snapshot the hub recorded for it. Read-only; identification is the
 * report token, so no host user session is required.
 */
export async function runShow(options: HubCommandOptions): Promise<void> {
  const credentials = await resolveCredentials({
    cwd: options.cwd,
    modulesUrl: options.modulesUrl,
    token: options.token,
  });
  const expectedLabel = await resolveExpectedLabel(options.cwd, options.expectLabel);
  const inspection = await fetchInstallationInspection(credentials);

  assertExpectedLabel(inspection, expectedLabel);

  console.log(bold(`Hub: ${credentials.modulesUrl}`));
  console.log(gray(""));
  renderInstallationInspection(inspection);
}
