import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { MemoryType, MemoryVisibility } from '@echolife/shared';

export class QueryMemoryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MemoryType, description: '记忆类型筛选' })
  @IsIn(Object.values(MemoryType))
  @IsOptional()
  type?: MemoryType;

  @ApiPropertyOptional({ example: 'joy', description: '情感类型筛选' })
  @IsString()
  @IsOptional()
  emotion?: string;

  @ApiPropertyOptional({ enum: MemoryVisibility, description: '可见性筛选' })
  @IsIn(Object.values(MemoryVisibility))
  @IsOptional()
  visibility?: MemoryVisibility;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z', description: '开始日期' })
  @IsDateString({}, { message: '开始日期格式不正确' })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59.999Z', description: '结束日期' })
  @IsDateString({}, { message: '结束日期格式不正确' })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ example: '西瓜', description: '全文搜索关键词' })
  @IsString()
  @IsOptional()
  search?: string;
}
