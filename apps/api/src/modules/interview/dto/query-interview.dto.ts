import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { InterviewStatus } from '@echolife/shared';

export class QueryInterviewDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InterviewStatus, description: '访谈状态筛选' })
  @IsIn(Object.values(InterviewStatus))
  @IsOptional()
  @IsString()
  status?: InterviewStatus;
}
