import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeModelAdditions,
  moduleSchemaNamespace,
  readDatasourceSchemas,
  reconcileDatasourceSchemas,
  updateDatasourceSchemas,
} from "../src/core/prisma-schema";

const SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["application"]
}

generator client {
  provider = "prisma-client-js"
}
`;

describe("updateDatasourceSchemas", () => {
  it("appends module namespaces while preserving application", () => {
    const next = updateDatasourceSchemas(SCHEMA, ["module/account"], []);
    assert.match(next, /schemas\s*=\s*\["application", "module\/account"\]/);
  });

  it("removes disabled namespaces and keeps others", () => {
    const withTwo = updateDatasourceSchemas(SCHEMA, ["module/account", "module/workflow"], []);
    const removed = updateDatasourceSchemas(withTwo, [], ["module/account"]);
    assert.match(removed, /"module\/workflow"/);
    assert.doesNotMatch(removed, /"module\/account"/);
    assert.match(removed, /"application"/);
  });

  it("is idempotent", () => {
    const once = updateDatasourceSchemas(SCHEMA, ["module/account"], []);
    const twice = updateDatasourceSchemas(once, ["module/account"], []);
    assert.equal(once, twice);
  });

  it("leaves content without a schemas array untouched", () => {
    const content = 'datasource db {\n  provider = "postgresql"\n}\n';
    assert.equal(updateDatasourceSchemas(content, ["module/account"], []), content);
  });

  it("throws on an unparsable schemas array", () => {
    const broken = "datasource db {\n  schemas = [,]\n}\n";
    assert.throws(() => updateDatasourceSchemas(broken, ["x"], []));
  });

  it("silently ignores a datasource block without any schemas array", () => {
    const broken = 'datasource db {\n  provider = "postgresql"\n  schemas =\n}\n';
    assert.equal(updateDatasourceSchemas(broken, ["x"], []), broken);
  });

  it("does not drift into a later block that mentions schemas", () => {
    const content = 'datasource db {\n  provider = "postgresql"\n}\n\n// schemas = ["module/x"]\n';
    assert.equal(updateDatasourceSchemas(content, ["module/account"], []), content);
    assert.equal(readDatasourceSchemas(content), null);
  });
});

describe("reconcileDatasourceSchemas", () => {
  it("sets module entries to exactly the supplied namespaces", () => {
    const withOrphans = updateDatasourceSchemas(SCHEMA, ["module/account", "module/llm-agent", "module/workflow"], []);
    const next = reconcileDatasourceSchemas(withOrphans, ["module/account", "module/copilot"]);
    const schemas = readDatasourceSchemas(next);
    assert.deepEqual(schemas, ["application", "module/account", "module/copilot"]);
  });

  it("preserves non-module entries when clearing all modules", () => {
    const withModules = updateDatasourceSchemas(SCHEMA, ["module/account", "module/workflow"], []);
    const next = reconcileDatasourceSchemas(withModules, []);
    assert.deepEqual(readDatasourceSchemas(next), ["application"]);
  });

  it("is idempotent", () => {
    const once = reconcileDatasourceSchemas(SCHEMA, ["module/account"]);
    const twice = reconcileDatasourceSchemas(once, ["module/account"]);
    assert.equal(once, twice);
  });

  it("deduplicates entries", () => {
    const next = reconcileDatasourceSchemas(SCHEMA, ["module/account", "module/account"]);
    assert.deepEqual(readDatasourceSchemas(next), ["application", "module/account"]);
  });

  it("leaves content without a schemas array untouched", () => {
    const content = 'datasource db {\n  provider = "postgresql"\n}\n';
    assert.equal(reconcileDatasourceSchemas(content, ["module/account"]), content);
  });
});

describe("moduleSchemaNamespace", () => {
  it("uses the module/ namespace convention", () => {
    assert.equal(moduleSchemaNamespace("aws-s3"), "module/aws-s3");
  });
});

describe("readDatasourceSchemas", () => {
  it("parses the current schemas list", () => {
    assert.deepEqual(readDatasourceSchemas(SCHEMA), ["application"]);
  });

  it("returns null when the array is absent", () => {
    assert.equal(readDatasourceSchemas('datasource db {\n provider = "postgresql"\n}\n'), null);
  });
});

const FRAGMENT = `model User {
  id    String @id
  email String?

  @@schema("module/account")
}

model Session {
  id     Int    @id
  userId String
}
`;

describe("mergeModelAdditions", () => {
  it("appends added fields before the model's block attributes", () => {
    const additions = `model User {
  projectMemberships ProjectMember[]
}
`;
    const merged = mergeModelAdditions(FRAGMENT, additions);
    assert.deepEqual(merged.conflicts, []);
    assert.deepEqual(merged.unknownModels, []);
    assert.match(merged.content, /projectMemberships ProjectMember\[\]\n\n {2}@@schema\("module\/account"\)/);
  });

  it("merges several models in one additions file", () => {
    const additions = `model User {
  projectMemberships ProjectMember[]
}

model Session {
  projectMemberId String?
}
`;
    const merged = mergeModelAdditions(FRAGMENT, additions);
    assert.match(merged.content, /projectMemberships ProjectMember\[\]/);
    assert.match(merged.content, /projectMemberId String\?/);
    assert.equal(merged.content.match(/model /g)?.length, 2);
  });

  it("refuses a model whose field name the module already declares", () => {
    const additions = `model User {
  email String?
}
`;
    const merged = mergeModelAdditions(FRAGMENT, additions);
    assert.deepEqual(merged.conflicts, [{ model: "User", field: "email" }]);
    assert.equal(merged.content, FRAGMENT);
  });

  it("reports models that the module does not declare", () => {
    const additions = `model Missing {
  userId String
}
`;
    const merged = mergeModelAdditions(FRAGMENT, additions);
    assert.deepEqual(merged.unknownModels, ["Missing"]);
    assert.equal(merged.content, FRAGMENT);
  });

  it("treats a repeated block attribute as an addition, not a conflict", () => {
    const additions = `model User {
  @@index([email])
}
`;
    const merged = mergeModelAdditions(FRAGMENT, additions);
    assert.deepEqual(merged.conflicts, []);
    assert.match(merged.content, /@@index\(\[email\]\)/);
  });

  it("returns the fragment unchanged when the additions file has no models", () => {
    const merged = mergeModelAdditions(FRAGMENT, "// nothing yet\n");
    assert.equal(merged.content, FRAGMENT);
  });

  it("throws on an unclosed model block", () => {
    assert.throws(() => mergeModelAdditions("model User {\n  id String\n", "model User {\n  x Int\n}\n"));
  });
});
