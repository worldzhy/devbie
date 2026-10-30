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

export class CommonListResponseDto<T = any> {
  @ApiProperty({
    type: CommonPagination,
    description: "Pagination information for the response",
  })
  pagination!: CommonPagination;

  @ApiProperty({
    type: Object,
    isArray: true,
    description: "List of records in the current page",
  })
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
