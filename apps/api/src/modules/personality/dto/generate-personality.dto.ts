import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GeneratePersonalityDto {
  @ApiPropertyOptional({
    example: 100,
    description: '分析最近多少条记忆（默认100，最大500）',
    default: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '记忆数量不能小于1' })
  @Max(500, { message: '记忆数量不能超过500' })
  @IsOptional()
  memoryLimit?: number = 100;
}
