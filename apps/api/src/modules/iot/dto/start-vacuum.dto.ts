import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** 启动扫地机器人清扫请求 DTO */
export class StartVacuumDto {
  @ApiPropertyOptional({
    example: 'deep',
    enum: ['quick', 'deep', 'spot'],
    description: '清扫模式：quick（快速）/ deep（深度）/ spot（重点）',
  })
  @IsOptional()
  @IsIn(['quick', 'deep', 'spot'])
  mode?: 'quick' | 'deep' | 'spot';
}
