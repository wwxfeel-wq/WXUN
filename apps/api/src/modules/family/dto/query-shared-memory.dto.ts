import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ConfirmationStatus } from '@echolife/shared';

export class QuerySharedMemoryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ConfirmationStatus, description: '确认状态筛选' })
  @IsIn(Object.values(ConfirmationStatus))
  @IsOptional()
  @IsString()
  status?: ConfirmationStatus;
}
