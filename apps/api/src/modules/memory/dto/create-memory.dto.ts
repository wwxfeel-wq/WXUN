import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
import { MemoryType, MemoryVisibility } from '@echolife/shared';

export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'procedural';
export type MemorySourceType =
  | 'chat'
  | 'image'
  | 'ocr'
  | 'pdf'
  | 'family_relation'
  | 'event'
  | 'shopping'
  | 'calendar'
  | 'photo'
  | 'family_story';

export class CreateMemoryDto {
  @ApiProperty({ example: '童年夏天的西瓜', description: '记忆标题' })
  @IsString()
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;

  @ApiProperty({ example: '那年夏天，我们在院子里吃着冰镇西瓜...', description: '记忆内容' })
  @IsString()
  @MinLength(1, { message: '内容不能为空' })
  @MaxLength(10000, { message: '内容不能超过10000个字符' })
  content!: string;

  @ApiProperty({
    example: 'story',
    enum: MemoryType,
    description: '记忆类型',
    default: MemoryType.STORY,
  })
  @IsIn(Object.values(MemoryType), { message: '记忆类型不正确' })
  @IsOptional()
  type?: MemoryType = MemoryType.STORY;

  @ApiProperty({
    example: 'private',
    enum: MemoryVisibility,
    description: '可见性',
    default: MemoryVisibility.PRIVATE,
  })
  @IsIn(Object.values(MemoryVisibility), { message: '可见性取值不正确' })
  @IsOptional()
  visibility?: MemoryVisibility = MemoryVisibility.PRIVATE;

  @ApiPropertyOptional({ example: 'joy', description: '情感类型（如 joy, sadness, nostalgia 等）' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  emotion?: string;

  @ApiPropertyOptional({ example: 0.8, description: '情感强度评分 (0.0 - 1.0)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: '情感强度不能小于0' })
  @Max(1, { message: '情感强度不能大于1' })
  @IsOptional()
  emotionScore?: number;

  @ApiPropertyOptional({ example: 0.7, description: '重要程度 (0.0 - 1.0)', default: 0.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: '重要程度不能小于0' })
  @Max(1, { message: '重要程度不能大于1' })
  @IsOptional()
  importance?: number;

  @ApiPropertyOptional({ example: '2024-06-15T00:00:00.000Z', description: '事件发生时间' })
  @IsDateString({}, { message: '发生时间格式不正确' })
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({
    example: { location: '老家院子', people: ['父亲', '母亲'] },
    description: '元数据（任意 JSON 结构）',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'episodic',
    description: '记忆分层：working | episodic | semantic | procedural',
  })
  @IsIn(['working', 'episodic', 'semantic', 'procedural'])
  @IsOptional()
  memoryLayer?: MemoryLayer;

  @ApiPropertyOptional({
    example: 'chat',
    description:
      '记忆来源：chat / image / ocr / pdf / family_relation / event / shopping / calendar / photo / family_story',
  })
  @IsIn([
    'chat',
    'image',
    'ocr',
    'pdf',
    'family_relation',
    'event',
    'shopping',
    'calendar',
    'photo',
    'family_story',
  ])
  @IsOptional()
  sourceType?: MemorySourceType;
}
