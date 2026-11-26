import "reflect-metadata";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ApiOkResponse, ApiProperty, DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";

import { CommonListResponseDto } from "../src/common.dto";

/**
 * ADR-087 gate: renders a real OpenAPI document from a probe module and checks
 * that `records` is only ever emitted with a declared element type. A list DTO
 * written in the inherited form must expose no `records` at all, so the missing
 * declaration fails at the consumer's compile step instead of shipping `{}[]`.
 *
 * Decorators are applied as plain function calls because the test runner
 * (tsx/esbuild) does not emit decorator metadata; every type below is therefore
 * declared explicitly.
 */

class RecordItemDto {
  id!: string;
}
ApiProperty({ type: String })(RecordItemDto.prototype, "id");

/** Declared form: the subclass redeclares `records` with its element type. */
class DeclaredListResponseDto extends CommonListResponseDto<RecordItemDto> {
  records: RecordItemDto[] = [];
}
ApiProperty({ type: RecordItemDto, isArray: true })(DeclaredListResponseDto.prototype, "records");

/** Inherited form: no redeclaration, the base must advertise nothing. */
class InheritedListResponseDto extends CommonListResponseDto<RecordItemDto> {}

class ProbeController {
  declared(): DeclaredListResponseDto {
    throw new Error("probe routes are never called");
  }

  inherited(): InheritedListResponseDto {
    throw new Error("probe routes are never called");
  }
}
Controller("probe")(ProbeController);
for (const [method, responseType] of [
  ["declared", DeclaredListResponseDto],
  ["inherited", InheritedListResponseDto],
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(ProbeController.prototype, method)!;
  Get(method)(ProbeController.prototype, method, descriptor);
  ApiOkResponse({ type: responseType })(ProbeController.prototype, method, descriptor);
}

class ProbeModule {}
Module({ controllers: [ProbeController] })(ProbeModule);

describe("CommonListResponseDto records metadata", () => {
  let document: OpenAPIObject;

  before(async () => {
    const app = await NestFactory.create(ProbeModule, { logger: false });
    try {
      document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), { include: [ProbeModule] });
    } finally {
      await app.close();
    }
  });

  function propertiesOf(schemaName: string): Record<string, any> {
    const schema = document.components?.schemas?.[schemaName];
    assert.ok(schema, `expected schema ${schemaName} in the generated document`);
    return (schema as { properties?: Record<string, any> }).properties ?? {};
  }

  it("emits records as an array of the declared element schema", () => {
    const records = propertiesOf("DeclaredListResponseDto").records;
    assert.equal(records?.type, "array");
    assert.deepEqual(records?.items, { $ref: "#/components/schemas/RecordItemDto" });
  });

  it("emits no records for a subclass that does not redeclare it", () => {
    assert.equal(propertiesOf("InheritedListResponseDto").records, undefined);
  });

  it("still inherits pagination from the base", () => {
    assert.deepEqual(propertiesOf("InheritedListResponseDto").pagination?.allOf, [
      { $ref: "#/components/schemas/CommonPagination" },
    ]);
  });
});
