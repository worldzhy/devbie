import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { envExampleValues } from "../src/assemble/env";
import {
  MODULES_MARKER_END,
  MODULES_MARKER_START,
  compareStrings,
  envValues,
  normalizeSections,
  parseEnv,
  pruneEmptySections,
  relocateSharedEnvKeys,
  removeEnvKeys,
  replaceMarkedBlock,
  serializeEnv,
  upsertEnvSection,
} from "../src/core/env-file";

describe("parseEnv / serializeEnv", () => {
  it("parses blank lines, comments and entries", () => {
    const lines = parseEnv("# header\n\nFOO=bar\n# trailing comment\n");
    assert.deepEqual(lines, [
      { kind: "comment", text: "# header" },
      { kind: "blank" },
      { kind: "entry", key: "FOO", value: "bar" },
      { kind: "comment", text: "# trailing comment" },
    ]);
  });

  it("strips quotes and handles export prefix", () => {
    const values = envValues(parseEnv("export A=\"x y\"\nexport B='z'\nC=`t`"));
    assert.deepEqual(values, { A: "x y", B: "z", C: "t" });
  });

  it("round-trips user content without dropping comments", () => {
    const content = "# my comment\nFOO=bar\n\nBAR=baz\n";
    assert.equal(serializeEnv(parseEnv(content)), content);
  });

  it("quotes values containing inline comments", () => {
    const out = serializeEnv([{ kind: "entry", key: "A", value: "x # y" }]);
    assert.equal(out, 'A="x # y"\n');
    assert.deepEqual(envValues(parseEnv(out)), { A: "x # y" });
  });
});

describe("envExampleValues", () => {
  it("renders typed declarations as plain values", () => {
    assert.deepEqual(
      envExampleValues({
        PLAIN: "value",
        TYPED: { type: "int", example: 30, description: "keep N days" },
        NO_EXAMPLE: { type: "string" },
      }),
      { PLAIN: "value", TYPED: "30", NO_EXAMPLE: "" },
    );
  });

  it("returns an empty map when the manifest declares no env", () => {
    assert.deepEqual(envExampleValues(undefined), {});
  });
});

describe("removeEnvKeys", () => {
  it("removes only matched entries, keeping comments", () => {
    const lines = parseEnv("# h\nA=1\nB=2\nC=3\n");
    const next = removeEnvKeys(lines, new Set(["A", "C"]));
    assert.deepEqual(envValues(next), { B: "2" });
    assert.ok(next.some((line) => line.kind === "comment" && line.text === "# h"));
  });
});

describe("upsertEnvSection", () => {
  const deco = "# ----------------------------------------------------------------------------------";

  it("appends a new titled section", () => {
    const lines = upsertEnvSection(parseEnv("APP_NAME=Newbie\n"), "Account", {
      ACCOUNT_REDIS_HOST: "",
    });
    const text = serializeEnv(lines);
    assert.ok(text.includes("# ! Account variables"));
    assert.ok(text.includes("ACCOUNT_REDIS_HOST="));
  });

  it("adds missing keys to the existing section, not the file tail", () => {
    const lines = upsertEnvSection(
      parseEnv(
        [deco, "# ! Alpha variables", deco, "ALPHA_A=1", "", deco, "# ! Zeta variables", deco, "ZETA_A=1"].join("\n"),
      ),
      "Alpha",
      { ALPHA_B: "2" },
    );
    const text = serializeEnv(lines);
    assert.ok(text.indexOf("ALPHA_A=1") < text.indexOf("ALPHA_B=2"));
    assert.ok(text.indexOf("ALPHA_B=2") < text.indexOf("# ! Zeta variables"));
  });

  it("is idempotent and never overwrites existing keys", () => {
    const once = upsertEnvSection(parseEnv(""), "Account", { A: "1" });
    const twice = upsertEnvSection(once, "Account", { A: "2", B: "3" });
    const values = envValues(twice);
    assert.equal(values.A, "1");
    assert.equal(values.B, "3");
    assert.equal(serializeEnv(twice).match(/A=/g)?.length, 1);
  });

  it("mirrors a key shared with an earlier module instead of leaving an empty section (R20-27)", () => {
    const withAlpha = upsertEnvSection(parseEnv(""), "Alpha", { SHARED_TOKEN: "a", ALPHA_ONLY: "1" });
    const withBeta = upsertEnvSection(withAlpha, "Beta", { SHARED_TOKEN: "b" });

    const text = serializeEnv(withBeta);
    const betaBody = text.slice(text.indexOf("# ! Beta variables"));
    assert.ok(betaBody.includes("SHARED_TOKEN=b"), "the later module's section lists its own shared key");
    assert.equal(betaBody.match(/SHARED_TOKEN=/g)?.length, 1, "the key is written once per section");
  });

  it("leaves an in-section key untouched instead of appending an example (R21-01)", () => {
    const seeded = parseEnv([deco, "# ! Alpha variables", deco, "ALPHA_TOKEN=real"].join("\n"));
    const text = serializeEnv(upsertEnvSection(seeded, "Alpha", { ALPHA_TOKEN: "" }));

    assert.equal(text.match(/ALPHA_TOKEN=/g)?.length, 1);
    assert.deepEqual(envValues(parseEnv(text)), { ALPHA_TOKEN: "real" });
  });

  it("treats an out-of-section handwritten key as satisfied and adds no section (R21-01)", () => {
    const text = serializeEnv(upsertEnvSection(parseEnv("MANUAL_TOKEN=from-user\n"), "Alpha", { MANUAL_TOKEN: "" }));

    assert.equal(text.match(/MANUAL_TOKEN=/g)?.length, 1, "no empty example is appended");
    assert.equal(text, "MANUAL_TOKEN=from-user\n", "the file is left untouched");
    assert.deepEqual(envValues(parseEnv(text)), { MANUAL_TOKEN: "from-user" });
  });

  it("keeps both copies when the key exists in the section and outside (R21-01)", () => {
    const seeded = parseEnv(
      ["SHARED_TOKEN=outside", "", deco, "# ! Alpha variables", deco, "SHARED_TOKEN=inside", "ALPHA_ONLY=1"].join("\n"),
    );
    const lines = upsertEnvSection(seeded, "Alpha", { SHARED_TOKEN: "" });
    const text = serializeEnv(lines);

    assert.equal(text.match(/SHARED_TOKEN=/g)?.length, 2, "no third copy is appended");
    assert.equal(envValues(parseEnv(text)).SHARED_TOKEN, "inside", "existing order is preserved");
    assert.equal(serializeEnv(upsertEnvSection(lines, "Alpha", { SHARED_TOKEN: "" })), text, "still idempotent");
  });
});

describe("relocateSharedEnvKeys", () => {
  const deco = "# ----------------------------------------------------------------------------------";
  const owners = new Map([["SHARED_TOKEN", "Alpha"]]);

  it("migrates the real value from a non-owner section into the owner's empty entry (R29-01)", () => {
    const seeded = parseEnv(
      [
        deco,
        "# ! Alpha variables",
        deco,
        "SHARED_TOKEN=",
        "ALPHA_ONLY=1",
        "",
        deco,
        "# ! Beta variables",
        deco,
        "SHARED_TOKEN=real",
        "BETA_ONLY=2",
      ].join("\n"),
    );

    const { lines, migrated } = relocateSharedEnvKeys(seeded, owners);
    const text = serializeEnv(normalizeSections(lines));

    assert.equal(text.match(/SHARED_TOKEN=/g)?.length, 1, "exactly one generated copy remains");
    assert.equal(envValues(parseEnv(text)).SHARED_TOKEN, "real", "the real value wins over the empty owner entry");
    const alphaStart = text.indexOf("# ! Alpha variables");
    const betaStart = text.indexOf("# ! Beta variables");
    const sharedAt = text.indexOf("SHARED_TOKEN=real");
    assert.ok(
      alphaStart !== -1 && alphaStart < sharedAt && sharedAt < betaStart,
      "the copy lives in the owner section",
    );
    assert.equal(migrated.get("SHARED_TOKEN"), "real");
    assert.ok(text.includes("BETA_ONLY=2"), "unrelated keys are untouched");
  });

  it("is a no-op when no non-owner copies exist", () => {
    const seeded = parseEnv([deco, "# ! Alpha variables", deco, "SHARED_TOKEN=real"].join("\n"));

    const { lines, migrated } = relocateSharedEnvKeys(seeded, owners);

    assert.equal(serializeEnv(lines), serializeEnv(seeded));
    assert.equal(migrated.size, 0);
  });

  it("keeps a hand-written copy as the single source and strips generated duplicates", () => {
    const seeded = parseEnv(
      [
        deco,
        "# ! Alpha variables",
        deco,
        "SHARED_TOKEN=",
        "",
        deco,
        "# ! Beta variables",
        deco,
        "SHARED_TOKEN=generated",
        "",
        "SHARED_TOKEN=from-user",
      ].join("\n"),
    );

    const { lines } = relocateSharedEnvKeys(seeded, owners);
    const text = serializeEnv(lines);

    assert.equal(text.match(/SHARED_TOKEN=/g)?.length, 1, "no generated copy is re-added");
    assert.equal(envValues(parseEnv(text)).SHARED_TOKEN, "from-user");
  });

  it("creates the owner section when it is missing", () => {
    const seeded = parseEnv([deco, "# ! Beta variables", deco, "SHARED_TOKEN=real"].join("\n"));

    const { lines } = relocateSharedEnvKeys(seeded, owners);
    const text = serializeEnv(normalizeSections(lines));

    assert.ok(text.includes("# ! Alpha variables"));
    assert.equal(text.match(/SHARED_TOKEN=/g)?.length, 1);
    assert.equal(envValues(parseEnv(text)).SHARED_TOKEN, "real");
  });

  it("converges all-empty copies to a single empty owner entry", () => {
    const seeded = parseEnv(
      [deco, "# ! Alpha variables", deco, "SHARED_TOKEN=", deco, "# ! Beta variables", deco, "SHARED_TOKEN="].join(
        "\n",
      ),
    );

    const { lines } = relocateSharedEnvKeys(seeded, owners);
    const text = serializeEnv(lines);

    assert.equal(text.match(/SHARED_TOKEN=/g)?.length, 1);
    assert.equal(envValues(parseEnv(text)).SHARED_TOKEN, "");
  });
});

describe("pruneEmptySections", () => {
  const deco = "# ----------------------------------------------------------------------------------";

  it("removes section blocks left without entries", () => {
    const lines = pruneEmptySections(
      upsertEnvSection(parseEnv(""), "Account", { A: "1" }).filter((line) => line.kind !== "entry" || line.key !== "A"),
    );
    assert.ok(!serializeEnv(lines).includes("Account variables"));
  });

  it("removes an empty middle section without eating neighbouring sections", () => {
    const lines = pruneEmptySections(
      parseEnv(
        [
          "APP_NAME=Newbie",
          "",
          deco,
          "# ! Account variables",
          deco,
          "",
          deco,
          "# ! Zeta variables",
          deco,
          "ZETA_A=1",
        ].join("\n"),
      ),
    );
    const text = serializeEnv(lines);
    assert.ok(!text.includes("Account variables"));
    assert.equal(text, ["APP_NAME=Newbie", "", deco, "# ! Zeta variables", deco, "ZETA_A=1"].join("\n") + "\n");
  });
});

describe("compareStrings", () => {
  it("orders by code units, not locale", () => {
    const sorted = ["aws-s3", "Aws-audit", "account", "audit"].sort(compareStrings);
    assert.deepEqual(sorted, ["Aws-audit", "account", "audit", "aws-s3"]);
  });
});

describe("normalizeSections", () => {
  const deco = "# ----------------------------------------------------------------------------------";

  it("orders sections by title and entries by key, preserving surrounding content", () => {
    const raw = [
      "APP_NAME=Newbie",
      "",
      deco,
      "# ! Zeta variables",
      deco,
      "ZETA_B=2",
      "ZETA_A=1",
      "",
      deco,
      "# ! Alpha variables",
      deco,
      "ALPHA_X=9",
      "",
      "# user tail",
      "USER_VAR=keep",
    ].join("\n");
    const out = serializeEnv(normalizeSections(parseEnv(raw)));

    assert.ok(out.indexOf("# ! Alpha variables") < out.indexOf("# ! Zeta variables"));
    const zetaBlock = out.slice(out.indexOf("# ! Zeta variables"));
    assert.ok(zetaBlock.indexOf("ZETA_A=1") < zetaBlock.indexOf("ZETA_B=2"));
    assert.ok(out.startsWith("APP_NAME=Newbie\n"));
    assert.ok(out.endsWith("# user tail\nUSER_VAR=keep\n"));
  });

  it("keeps empty sections in the ordered run", () => {
    const raw = [deco, "# ! B variables", deco, "", deco, "# ! A variables", deco].join("\n");
    const out = serializeEnv(normalizeSections(parseEnv(raw)));
    assert.ok(out.indexOf("# ! A variables") < out.indexOf("# ! B variables"));
  });

  it("never swallows content after a comment inside a section body", () => {
    const raw = [deco, "# ! A variables", deco, "A_TWO=2", "# note", "A_ONE=1"].join("\n");
    const out = serializeEnv(normalizeSections(parseEnv(raw)));
    const values = envValues(parseEnv(out));
    assert.deepEqual(values, { A_TWO: "2", A_ONE: "1" });
    assert.ok(out.includes("# note"));
  });

  it("is idempotent", () => {
    const raw = [deco, "# ! B variables", deco, "B_B=2", "B_A=1", "", deco, "# ! A variables", deco, "A_X=9"].join(
      "\n",
    );
    const once = serializeEnv(normalizeSections(parseEnv(raw)));
    assert.equal(serializeEnv(normalizeSections(parseEnv(once))), once);
  });

  it("leaves files without sections untouched", () => {
    const raw = "APP_NAME=Newbie\nFOO=bar\n";
    assert.equal(serializeEnv(normalizeSections(parseEnv(raw))), raw);
  });
});

describe("replaceMarkedBlock", () => {
  it("appends the block when markers are absent", () => {
    const out = replaceMarkedBlock("APP_NAME=Newbie\n", "BODY=1\n");
    assert.ok(out.includes("APP_NAME=Newbie\n"));
    assert.ok(out.includes(MODULES_MARKER_START));
    assert.ok(out.includes("BODY=1"));
    assert.ok(out.includes(MODULES_MARKER_END));
  });

  it("replaces only the marked block on subsequent runs", () => {
    const first = replaceMarkedBlock("APP_NAME=Newbie\n", "A=1\n");
    const second = replaceMarkedBlock(first, "B=2\n");
    assert.ok(!second.includes("A=1"));
    assert.ok(second.includes("B=2"));
    assert.ok(second.includes("APP_NAME=Newbie"));
    assert.equal(second.match(new RegExp(MODULES_MARKER_START, "g"))?.length, 1);
  });
});
