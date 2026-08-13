import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * DTO for querying tracking events with filters (admin only).
 *
 * Inherits pagination fields (page, pageSize, sortBy, sortOrder) from
 * PaginationDto.
 */
export class QueryTrackingDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'page_view', description: '事件类型筛选' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  eventType?: string;

  @ApiPropertyOptional({ example: '192.168.1', description: 'IP 地址筛选（模糊匹配）' })
  @IsString()
  @IsOptional()
  @MaxLength(45)
  ipAddress?: string;

  @ApiPropertyOptional({
    example: '2025-01-01T00:00:00.000Z',
    description: '开始日期（ISO 8601）',
  })
  @IsDateString({}, { message: '开始日期格式不正确' })
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2025-12-31T23:59:59.999Z',
    description: '结束日期（ISO 8601）',
  })
  @IsDateString({}, { message: '结束日期格式不正确' })
  @IsOptional()
  endDate?: string;
}
