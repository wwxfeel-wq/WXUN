import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for the public tracking endpoint (POST /tracking/events).
 *
 * IP address and User-Agent are captured from the HTTP request in the
 * controller, not from the payload body.
 */
export class TrackEventDto {
  @ApiProperty({ example: 'sess_abc123def456', description: '会话 ID（前端生成，用于区分独立访客）' })
  @IsString()
  @MinLength(1, { message: '会话 ID 不能为空' })
  @MaxLength(100, { message: '会话 ID 不能超过 100 个字符' })
  sessionId!: string;

  @ApiProperty({
    example: 'page_view',
    description: '事件类型，如 page_view、click、scroll、custom 等',
  })
  @IsString()
  @MinLength(1, { message: '事件类型不能为空' })
  @MaxLength(50, { message: '事件类型不能超过 50 个字符' })
  eventType!: string;

  @ApiProperty({ example: '/home', description: '页面路径' })
  @IsString()
  @MinLength(1, { message: '页面路径不能为空' })
  @MaxLength(500, { message: '页面路径不能超过 500 个字符' })
  pagePath!: string;

  @ApiPropertyOptional({ example: '首页 - EchoLife', description: '页面标题' })
  @IsString()
  @MaxLength(500, { message: '页面标题不能超过 500 个字符' })
  @IsOptional()
  pageTitle?: string;

  @ApiPropertyOptional({ example: 'https://www.google.com', description: '来源页面 URL' })
  @IsString()
  @MaxLength(500, { message: '来源页面不能超过 500 个字符' })
  @IsOptional()
  referrer?: string;

  @ApiPropertyOptional({
    example: { buttonId: 'cta-signup', duration: 3200 },
    description: '自定义事件元数据（JSON 对象）',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
