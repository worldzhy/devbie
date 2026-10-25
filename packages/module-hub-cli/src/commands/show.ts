import { bold, gray } from "colorette";

import { fetchSelfInspection } from "../client";
import { resolveCredentials, resolveExpectedLabel } from "../env";
import type { HubCommandOptions } from "../options";
import { assertExpectedLabel, renderSelfInspection } from "./render";

/**
 * `newbie module-hub show` — print this installation's runtime facts plus the
 * module snapshot the hub recorded for it. Read-only; identification is the
 * report token, so no host user session is required.
 */
export async function runShow(options: HubCommandOptions): Promise<void> {
  const credentials = await resolveCredentials({
    cwd: options.cwd,
    endpoint: options.endpoint,
    token: options.token,
  });
  const expectedLabel = await resolveExpectedLabel(options.cwd, options.expectLabel);
  const inspection = await fetchSelfInspection(credentials);

  assertExpectedLabel(inspection, expectedLabel);

  console.log(bold(`Hub: ${credentials.selfUrl}`));
  console.log(gray(""));
  renderSelfInspection(inspection);
}
