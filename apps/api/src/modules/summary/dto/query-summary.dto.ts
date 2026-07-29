import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SummaryPeriod } from '@echolife/shared';

export class QuerySummaryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: SummaryPeriod, description: '总结周期类型筛选' })
  @IsIn(Object.values(SummaryPeriod))
  @IsOptional()
  @IsString()
  period?: SummaryPeriod;
}
