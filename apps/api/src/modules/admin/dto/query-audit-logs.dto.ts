import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'create', description: '操作类型筛选' })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ example: 'users', description: '资源类型筛选' })
  @IsString()
  @IsOptional()
  resource?: string;

  @ApiPropertyOptional({ description: '用户ID筛选' })
  @IsUUID('4')
  @IsOptional()
  userId?: string;

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
}
