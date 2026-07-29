import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { SummaryPeriod } from '@echolife/shared';

export class GenerateSummaryDto {
  @ApiProperty({
    enum: SummaryPeriod,
    example: 'weekly',
    description: '总结周期类型',
  })
  @IsIn(Object.values(SummaryPeriod), { message: '总结周期类型不正确' })
  @IsNotEmpty({ message: '总结周期类型不能为空' })
  period!: SummaryPeriod;

  @ApiProperty({ example: '2024-06-01T00:00:00.000Z', description: '周期开始日期' })
  @IsDateString({}, { message: '开始日期格式不正确' })
  @Type(() => Date)
  startDate!: Date;

  @ApiPropertyOptional({ example: '2024-06-07T23:59:59.999Z', description: '周期结束日期（不传则自动计算）' })
  @IsDateString({}, { message: '结束日期格式不正确' })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;
}
