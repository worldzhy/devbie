import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MODULES_MARKER_END,
  MODULES_MARKER_START,
  compareStrings,
  envValues,
  normalizeSections,
  parseEnv,
  pruneEmptySections,
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
