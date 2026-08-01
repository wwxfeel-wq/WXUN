import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { KindnessType, KindnessLevel } from '@echolife/shared';

export class CreateKindnessDto {
  @ApiProperty({ example: '妈妈的早餐', description: '温暖瞬间标题' })
  @IsString()
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;

  @ApiProperty({ example: '今天早上妈妈五点起来给我煮了一碗面...', description: '温暖瞬间内容' })
  @IsString()
  @MinLength(1, { message: '内容不能为空' })
  @MaxLength(10000, { message: '内容不能超过10000个字符' })
  content!: string;

  @ApiProperty({
    example: 'care',
    enum: KindnessType,
    description: '温暖类型',
    default: KindnessType.COMPANIONSHIP,
  })
  @IsIn(Object.values(KindnessType), { message: '温暖类型不正确' })
  @IsOptional()
  type?: KindnessType = KindnessType.COMPANIONSHIP;

  @ApiProperty({
    example: 'warm',
    enum: KindnessLevel,
    description: '重要度等级（影响 Life Core 粒子颜色）',
    default: KindnessLevel.WARM,
  })
  @IsIn(Object.values(KindnessLevel), { message: '重要度等级不正确' })
  @IsOptional()
  importance?: KindnessLevel = KindnessLevel.WARM;

  @ApiProperty({ example: ['妈妈', '我'], description: '相关人员' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  people?: string[];

  @ApiProperty({ example: '妈妈早起做早餐', description: '事件简述' })
  @IsString()
  @MaxLength(500, { message: '事件简述不能超过500个字符' })
  event!: string;

  @ApiPropertyOptional({ example: 'love', description: '情绪标签' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  emotion?: string;

  @ApiPropertyOptional({ example: 0.9, description: '情绪强度 (0.0 - 1.0)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  emotionScore?: number;

  @ApiPropertyOptional({ example: '家里厨房', description: '地点' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    example: [{ type: 'photo', url: 'https://...', description: '早餐照片' }],
    description: '媒体附件（照片/语音/文字）',
  })
  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  media?: Record<string, unknown>[];

  @ApiPropertyOptional({ example: '2025-02-10T00:00:00.000Z', description: '发生时间' })
  @IsDateString({}, { message: '发生时间格式不正确' })
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'xxx-xxx', description: '关联家庭 ID' })
  @IsString()
  @IsOptional()
  familyId?: string;
}
