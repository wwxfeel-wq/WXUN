import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { EntityType } from '@echolife/shared';

export class QueryEntityDto extends PaginationDto {
  @ApiPropertyOptional({ enum: EntityType, description: '实体类型筛选' })
  @IsIn(Object.values(EntityType))
  @IsOptional()
  @IsString()
  type?: EntityType;

  @ApiPropertyOptional({ example: '张三', description: '搜索关键词' })
  @IsString()
  @IsOptional()
  search?: string;
}
