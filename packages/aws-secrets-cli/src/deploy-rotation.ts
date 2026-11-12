import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { bold, cyan, green, yellow } from "colorette";

import { CliError, execCapture, execLive } from "@devbie/newbie-cli/lib";
import type { GlobalOptions } from "@devbie/newbie-cli/lib";

import { assertExpectedAccount, getCallerIdentity } from "./aws-identity";
import { readEnvToolConfig } from "./env-tool-config";
import { pickEnvironment, printCredentialHint } from "./pull-push";

export interface DeployRotationOptions extends GlobalOptions {
  environment?: string;
}

/**
 * Provision the per-account Secrets Manager rotation Lambda. The SST template
 * shipped inside this package (sst/ at the package root) is copied into a
 * stable per-account workdir (so repeated runs reuse node_modules), then
 * deployed with the caller's own AWS credentials. The stack stage is the AWS
 * account id — one stack per account.
 */
export async function runDeployRotation(options: DeployRotationOptions): Promise<void> {
  const { config: toolConfig } = await readEnvToolConfig(options.cwd);
  const envName = await pickEnvironment(toolConfig, options.environment);
  const envConfig = toolConfig.environments[envName];
  printCredentialHint();

  const identity = await getCallerIdentity(envConfig.region);
  assertExpectedAccount(identity, envConfig.expectedAccountId);
  console.info(cyan(`Deploying the rotation Lambda to account ${bold(identity.accountId)} (${envConfig.region})...\n`));

  // The template ships inside this package (sst/ at the package root, included
  // in the published tarball), so dist/ and the sst/ directory are siblings.
  const templateDir = path.resolve(__dirname, "..", "sst");
  const workdir = path.join(os.homedir(), ".newbie", "rotation-lambda", identity.accountId);
  await fs.cp(templateDir, workdir, { recursive: true, force: true });

  if (options.dryRun) {
    console.info(yellow(`[dry-run] would run npm install and sst deploy --stage ${identity.accountId} in ${workdir}`));
    return;
  }

  await execLive("npm", ["install"], { cwd: workdir });
  const { stdout } = await execCapture("npx", ["sst", "deploy", "--stage", identity.accountId], { cwd: workdir });

  const lambdaArn = (stdout.match(/lambdaArn:\s+"?(arn:aws:lambda:[^"\s]+)"?/)?.[1] ?? "").trim();
  if (!lambdaArn) {
    throw new CliError("Deployment finished but the Lambda ARN could not be parsed from the SST output.");
  }

  console.info(green(`\n✓ Rotation Lambda deployed: ${bold(lambdaArn)}`));
  console.info(
    cyan(
      `\nPaste this ARN into the project's cross-account role card (Rotation Lambda ARN) to enable ` +
        `automatic rotation for every project using that AWS account.\n` +
        `To remove the Lambda later: cd ${workdir} && npx sst remove --stage ${identity.accountId}\n`,
    ),
  );
}
