import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

class CommonPagination {
  @ApiProperty({
    type: Number,
    description: "Number of items in the current page",
  })
  countOfCurrentPage!: number;

  @ApiProperty({
    type: Number,
    description: "Total number of items across all pages",
  })
  countOfTotal!: number;

  @ApiProperty({
    type: Number,
    description: "Page number, starts from 0",
  })
  page!: number;

  @ApiProperty({
    type: Number,
    description: "Page size, the number of items per page",
  })
  pageSize!: number;
}

export class CommonListRequestDto {
  @ApiPropertyOptional({
    type: Number,
    description: "Page size, the number of items per page. Defaults to 20 when omitted; capped at 1000.",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pageSize?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "Page number, starts from 0. Defaults to 0 when omitted.",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;
}

/**
 * Base class for paginated list responses.
 *
 * Subclasses must declare the element type of `records` themselves (ADR-087):
 *
 * ```ts
 * export class ListUsersResponseDto extends CommonListResponseDto<UserResponseDto> {
 *   @ApiProperty({ type: UserResponseDto, isArray: true })
 *   declare records: UserResponseDto[];
 * }
 * ```
 *
 * The base deliberately carries no `records` decorator. Generics are erased at
 * runtime, so a decorator here would only advertise `object[]` in the OpenAPI
 * document and make every generated client say `{}[]`. Without it, a subclass
 * that forgets the redeclaration fails at the consumer's compile step instead
 * of silently shipping a wrong contract.
 */
export class CommonListResponseDto<T = any> {
  @ApiProperty({
    type: CommonPagination,
    description: "Pagination information for the response",
  })
  pagination!: CommonPagination;

  records!: T[];
}

export class CommonGetByStringIdRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  id!: string;
}

export class CommonGetByNumberIdRequestDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  id!: number;
}
