import fs from "node:fs/promises";
import path from "node:path";

import { checkbox, confirm, select } from "@inquirer/prompts";
import { bold, cyan, green, yellow } from "colorette";
import {
  CreateSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
  TagResourceCommand,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";

import { CliError, ENV_PATH, EnvLine, envValues, IssueBag, parseEnv, serializeEnv } from "@devbie/newbie-cli/lib";

import { assertExpectedAccount, getCallerIdentity } from "./aws-identity";
import { EnvironmentConfig, EnvToolConfig, SecretConfig, readEnvToolConfig } from "./env-tool-config";
import type { GlobalOptions } from "@devbie/newbie-cli/lib";

/**
 * Tag contract shared with the aws-secrets-manager NestJS module
 * (`aws-secrets-manager.types.ts`: MANAGED_TAG_KEY, SECRET_TYPE_TAG_KEY) and
 * the rotation Lambda (`sst/function/common.ts`). The AWS secret tags are the
 * single source of truth and the module is not an npm dependency of this
 * package, so the constants are mirrored here. Keep all copies in sync when
 * changing the tag contract.
 */
const MANAGED_TAG_KEY = "devbie:managed";
const SECRET_TYPE_TAG_KEY = "devbie:secret-type";

const PLACEHOLDER = "<PLEASE_SET_THIS_VALUE>";

export interface SecretsCommandOptions extends GlobalOptions {
  environment?: string;
  yes?: boolean;
  /** Pull only: abort without writing .env when any secret fails to pull. */
  strict?: boolean;
}

export function createAwsClient(region: string): SecretsManagerClient {
  // No explicit credentials: the SDK default chain resolves env vars
  // (including AWS_SESSION_TOKEN, required for OIDC sessions), profiles,
  // SSO and IMDS role credentials. Manually constructing a credentials
  // object here would silently drop the session token and break OIDC.
  return new SecretsManagerClient({ region });
}

export function printCredentialHint(): void {
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY) return;
  if (process.env.AWS_PROFILE) {
    console.info(cyan(`ℹ️  Using AWS Profile: ${bold(process.env.AWS_PROFILE)}\n`));
  } else {
    console.info(cyan("ℹ️  No AWS credentials in env; falling back to SSO/login, ~/.aws/credentials or IAM role.\n"));
  }
}

export async function pickEnvironment(config: EnvToolConfig, preselected: string | undefined): Promise<string> {
  const names = Object.keys(config.environments);
  if (preselected) {
    if (!names.includes(preselected)) {
      throw new CliError(`Unknown environment '${preselected}'. Available: ${names.join(", ")}`);
    }
    return preselected;
  }
  return select({
    message: "Select env set:",
    choices: names.map((name) => ({ name, value: name })),
  });
}

function setEntry(lines: EnvLine[], key: string, value: string): void {
  for (const line of lines) {
    if (line.kind === "entry" && line.key === key) {
      line.value = value;
      return;
    }
  }
  lines.push({ kind: "entry", key, value });
}

/**
 * Replace .env atomically with owner-only permissions: write a sibling temp file
 * then rename over the target, so a crash or concurrent reader never sees a
 * half-written file (and the new inode lands 0600 instead of inheriting umask).
 */
async function writeEnvAtomic(target: string, content: string): Promise<void> {
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, content, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

/* ------------------------------------------------------------------ pull -- */

interface ParsedSecret {
  envVars: Record<string, string>;
  keysOnlyVars: Record<string, string>;
  placeholderKeys: string[];
}

function parseSecret(secret: string, secretConfig: SecretConfig): ParsedSecret {
  const envVars: Record<string, string> = {};
  const keysOnlyVars: Record<string, string> = {};
  const placeholderKeys: string[] = [];

  const data = JSON.parse(secret) as Record<string, unknown>;
  const picked = secretConfig.keys && secretConfig.keys.length > 0 ? secretConfig.keys : Object.keys(data);

  for (const key of picked) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = String(data[key]);
    envVars[key] = value;
    if (value === PLACEHOLDER) placeholderKeys.push(key);
  }

  for (const key of secretConfig.keysOnly ?? []) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete envVars[key];
      keysOnlyVars[key] = PLACEHOLDER;
    }
  }

  return { envVars, keysOnlyVars, placeholderKeys };
}

export async function runSecretsPull(options: SecretsCommandOptions): Promise<void> {
  const { config: toolConfig, path: configPath } = await readEnvToolConfig(options.cwd);
  const issues = new IssueBag();

  const envName = await pickEnvironment(toolConfig, options.environment);
  const envConfig: EnvironmentConfig = toolConfig.environments[envName];
  printCredentialHint();

  if (envConfig.expectedAccountId) {
    assertExpectedAccount(await getCallerIdentity(envConfig.region), envConfig.expectedAccountId);
  }

  const client = createAwsClient(envConfig.region);

  const pulled: Record<string, string> = {};
  const keysOnly: Record<string, string> = {};
  const placeholderKeys: string[] = [];

  console.info(cyan("📥 Pulling secrets...\n"));
  for (const secretConfig of envConfig.secrets) {
    try {
      console.info(`  Pulling: ${secretConfig.name}`);
      const response = await client.send(new GetSecretValueCommand({ SecretId: secretConfig.name }));
      const secretString = response.SecretString ?? new TextDecoder().decode(response.SecretBinary);
      const parsed = parseSecret(secretString, secretConfig);
      Object.assign(pulled, parsed.envVars);
      Object.assign(keysOnly, parsed.keysOnlyVars);
      placeholderKeys.push(...parsed.placeholderKeys);
      console.info(
        green(`    ✓ ${Object.keys(parsed.envVars).length + Object.keys(parsed.keysOnlyVars).length} variables\n`),
      );
    } catch (error) {
      issues.warn(`Failed to pull ${secretConfig.name}: ${(error as Error).message}`);
    }
  }

  // Strict mode (CI): never write a partially-pulled .env.
  if (options.strict) issues.assertEmpty();

  const envTarget = path.resolve(options.cwd, ENV_PATH);
  let raw = "";
  try {
    raw = await fs.readFile(envTarget, "utf8");
  } catch {
    // missing .env: create from scratch
  }
  const lines = parseEnv(raw);
  const existing = envValues(lines);

  // Conflicting keys: ask (non-interactive default keeps local value).
  for (const [key, newValue] of Object.entries(pulled)) {
    if (key in existing && existing[key] !== newValue) {
      let overwrite = false;
      if (!options.yes && !options.dryRun && process.stdin.isTTY) {
        overwrite = await confirm({
          message: `${key} differs from AWS value. Overwrite?`,
          default: false,
        });
      }
      if (overwrite) setEntry(lines, key, newValue);
    } else if (!(key in existing)) {
      setEntry(lines, key, newValue);
    }
  }

  const addedKeysOnly: string[] = [];
  for (const [key, value] of Object.entries(keysOnly)) {
    if (!(key in existing)) {
      setEntry(lines, key, value);
      addedKeysOnly.push(key);
    }
  }

  const next = serializeEnv(lines);
  if (next === raw) {
    console.info(cyan("[info] .env is already up to date."));
  } else if (options.dryRun) {
    console.info(yellow(`[dry-run] would update ${ENV_PATH} (config: ${configPath})`));
  } else {
    let shouldWrite = options.yes ?? false;
    if (!shouldWrite && process.stdin.isTTY) {
      shouldWrite = await confirm({
        message: "Write environment variables to .env?",
        default: true,
      });
    }
    if (!shouldWrite) {
      console.info(yellow("Write cancelled"));
      return;
    }
    await writeEnvAtomic(envTarget, next);
    console.info(green(`✓ Updated ${ENV_PATH}`));
  }

  const placeholders = [...new Set([...placeholderKeys, ...addedKeysOnly])];
  if (placeholders.length > 0) {
    console.info(yellow(`\n⚠️  Placeholder variables needing manual values: ${placeholders.join(", ")}`));
  }

  issues.assertEmpty();
  console.info(bold(green("🍺 Done!\n")));
}

/* ------------------------------------------------------------------ push -- */

async function secretExists(client: SecretsManagerClient, name: string): Promise<boolean> {
  try {
    await client.send(new DescribeSecretCommand({ SecretId: name }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ResourceNotFoundException") return false;
    throw error;
  }
}

async function getExistingSecret(client: SecretsManagerClient, name: string): Promise<Record<string, string> | null> {
  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: name }));
    return response.SecretString ? (JSON.parse(response.SecretString) as Record<string, string>) : {};
  } catch (error) {
    if ((error as { name?: string }).name === "ResourceNotFoundException") return null;
    throw error;
  }
}

/** Tags marking the secret as managed by this toolchain, plus the type used for rotation routing. */
function managementTags(secretConfig: SecretConfig): { Key: string; Value: string }[] {
  const tags = [{ Key: MANAGED_TAG_KEY, Value: "true" }];
  if (secretConfig.type) tags.push({ Key: SECRET_TYPE_TAG_KEY, Value: secretConfig.type });
  return tags;
}

export async function runSecretsPush(options: SecretsCommandOptions): Promise<void> {
  const { config: toolConfig } = await readEnvToolConfig(options.cwd);
  const envName = await pickEnvironment(toolConfig, options.environment);
  const envConfig = toolConfig.environments[envName];
  printCredentialHint();

  if (envConfig.expectedAccountId) {
    assertExpectedAccount(await getCallerIdentity(envConfig.region), envConfig.expectedAccountId);
  }

  const envTarget = path.resolve(options.cwd, ENV_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(envTarget, "utf8");
  } catch {
    throw new CliError(`${ENV_PATH} not found; nothing to push.`);
  }
  const localEnv = envValues(parseEnv(raw));

  const client = createAwsClient(envConfig.region);

  for (const secretConfig of envConfig.secrets) {
    console.info(cyan(`\n📦 Secret: ${bold(secretConfig.name)}`));

    let keys = secretConfig.keys ?? [];
    if (keys.length === 0) {
      if (!process.stdin.isTTY) {
        throw new CliError(`Secret ${secretConfig.name} has no "keys" list and cannot prompt in non-interactive mode.`);
      }
      keys = await checkbox({
        message: `Select variables to push to ${secretConfig.name}:`,
        choices: Object.keys(localEnv).map((key) => ({
          value: key,
          name: key,
        })),
        pageSize: 15,
      });
      if (keys.length === 0) {
        console.info(yellow("  - No variables selected, skipping"));
        continue;
      }
    }

    const valuesToPush: Record<string, string> = {};
    for (const key of keys) {
      if (key in localEnv) valuesToPush[key] = localEnv[key];
      else console.warn(yellow(`  ⚠️  ${key} not found in ${ENV_PATH}`));
    }

    // keysOnly: ensure the key exists remotely, never push its value.
    const preserveKeysOnly = new Set<string>();
    if ((secretConfig.keysOnly ?? []).length > 0) {
      const existing = (await secretExists(client, secretConfig.name))
        ? await getExistingSecret(client, secretConfig.name)
        : null;
      for (const key of secretConfig.keysOnly ?? []) {
        if (!existing || !(key in existing)) {
          valuesToPush[key] = PLACEHOLDER;
        } else {
          preserveKeysOnly.add(key);
        }
      }
    }

    if (Object.keys(valuesToPush).length === 0) {
      console.info(yellow("  - Nothing to push, skipping"));
      continue;
    }

    const exists = await secretExists(client, secretConfig.name);

    if (exists) {
      const existing = (await getExistingSecret(client, secretConfig.name)) ?? {};
      const added: string[] = [];
      const modified: string[] = [];
      for (const [key, value] of Object.entries(valuesToPush)) {
        if (!(key in existing)) added.push(key);
        else if (existing[key] !== value && value !== PLACEHOLDER) modified.push(key);
      }

      if (added.length === 0 && modified.length === 0) {
        console.info(cyan("  ℹ️  No changes, skipping"));
        continue;
      }
      console.info(green(`  added: ${added.join(", ") || "(none)"}`));
      console.info(yellow(`  modified: ${modified.join(", ") || "(none)"}`));

      if (options.dryRun) {
        console.info(yellow("  [dry-run] would update secret"));
        continue;
      }
      const confirmed =
        options.yes ||
        (process.stdin.isTTY &&
          (await confirm({
            message: `Update ${secretConfig.name}?`,
            default: true,
          })));
      if (!confirmed) continue;

      // keysOnly keys that already have a remote value must never be overwritten
      // by the local placeholder (this fixes a legacy data-loss bug).
      const merged = { ...existing };
      for (const [key, value] of Object.entries(valuesToPush)) {
        if (value === PLACEHOLDER && preserveKeysOnly.has(key) && key in existing) continue;
        merged[key] = value;
      }
      await client.send(
        new UpdateSecretCommand({
          SecretId: secretConfig.name,
          SecretString: JSON.stringify(merged, null, 2),
        }),
      );
      // TagResource overwrites existing tag keys, keeping the tag contract fresh on every push.
      await client.send(new TagResourceCommand({ SecretId: secretConfig.name, Tags: managementTags(secretConfig) }));
      console.info(green(`  ✓ Updated ${secretConfig.name}`));
    } else {
      if (options.dryRun) {
        console.info(yellow("  [dry-run] would create secret"));
        continue;
      }
      const confirmed =
        options.yes ||
        (process.stdin.isTTY &&
          (await confirm({
            message: `Create new secret ${secretConfig.name}?`,
            default: true,
          })));
      if (!confirmed) continue;

      await client.send(
        new CreateSecretCommand({
          Name: secretConfig.name,
          Description: secretConfig.description || "Created by newbie secrets push",
          SecretString: JSON.stringify(valuesToPush, null, 2),
          Tags: managementTags(secretConfig),
        }),
      );
      console.info(green(`  ✓ Created ${secretConfig.name}`));
    }
  }

  console.info(bold(green("\n🍺 Done!\n")));
}
