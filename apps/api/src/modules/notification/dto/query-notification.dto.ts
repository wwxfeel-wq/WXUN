import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryNotificationDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: '按已读状态筛选' })
  @IsIn(['true', 'false'])
  @IsOptional()
  @IsString()
  read?: string;

  @ApiPropertyOptional({ description: '按通知类型筛选' })
  @IsString()
  @IsOptional()
  type?: string;
}
