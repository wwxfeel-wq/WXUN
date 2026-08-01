import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { KindnessType, KindnessLevel } from '@echolife/shared';

export class QueryKindnessDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: KindnessType, description: '温暖类型筛选' })
  @IsIn(Object.values(KindnessType))
  @IsOptional()
  type?: KindnessType;

  @ApiPropertyOptional({ enum: KindnessLevel, description: '重要度筛选' })
  @IsIn(Object.values(KindnessLevel))
  @IsOptional()
  importance?: KindnessLevel;

  @ApiPropertyOptional({ description: '情绪筛选' })
  @IsString()
  @IsOptional()
  emotion?: string;

  @ApiPropertyOptional({ description: '家庭 ID 筛选' })
  @IsString()
  @IsOptional()
  familyId?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: '排序字段', default: 'occurredAt' })
  @IsString()
  @IsOptional()
  sortBy?: string = 'occurredAt';

  @ApiPropertyOptional({ description: '排序方向', default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
