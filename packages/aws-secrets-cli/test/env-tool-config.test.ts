import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { CliError } from "@devbie/newbie-cli/lib";

import { readEnvToolConfig } from "../src/env-tool-config";

let workspace: string;

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "aws-secrets-cli-"));
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

async function projectWithConfig(relativePath: string, content: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(workspace, "project-"));
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return root;
}

describe("readEnvToolConfig", () => {
  it("reads the first candidate and returns its relative path", async () => {
    const config = { environments: { dev: { region: "us-east-1", secrets: [] } } };
    const root = await projectWithConfig(".newbie/env.config.json", JSON.stringify(config));

    const loaded = await readEnvToolConfig(root);

    assert.equal(loaded.path, ".newbie/env.config.json");
    assert.deepEqual(loaded.config, config);
  });

  it("falls back to the legacy candidate when the preferred one is absent", async () => {
    const config = { environments: { dev: { region: "us-east-1", secrets: [] } } };
    const root = await projectWithConfig(".newbie-env-tool/.config/config.json", JSON.stringify(config));

    const loaded = await readEnvToolConfig(root);

    assert.equal(loaded.path, ".newbie-env-tool/.config/config.json");
    assert.deepEqual(loaded.config, config);
  });

  it("rejects invalid JSON with a CliError naming the file", async () => {
    const root = await projectWithConfig(".newbie/env.config.json", "{ not json");

    await assert.rejects(
      () => readEnvToolConfig(root),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /Cannot parse env-tool config \.newbie\/env\.config\.json/);
        return true;
      },
    );
  });

  it("rejects a config without environments", async () => {
    const root = await projectWithConfig(".newbie/env.config.json", JSON.stringify({ secrets: [] }));

    await assert.rejects(
      () => readEnvToolConfig(root),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /missing "environments"/);
        return true;
      },
    );
  });

  it("lists every candidate it looked at when nothing is found", async () => {
    const root = await fs.mkdtemp(path.join(workspace, "empty-"));

    await assert.rejects(
      () => readEnvToolConfig(root),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /Env tool config not found/);
        assert.match(error.message, /\.newbie\/env\.config\.json/);
        assert.match(error.message, /\.newbie-env-tool\/\.config\/config\.json/);
        return true;
      },
    );
  });
});
