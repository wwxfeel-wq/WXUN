import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength, Matches } from 'class-validator';

/**
 * DTO for setting an API key.
 *
 * Validation rules:
 * - Must be a non-empty string
 * - Minimum 10 characters (all providers issue keys >= 10 chars)
 * - Maximum 500 characters (safety upper bound)
 * - Must match a realistic API key pattern (alphanumeric, dots, dashes, underscores)
 * - Must not contain whitespace
 */
export class SetApiKeyDto {
  @ApiProperty({
    example: 'xxxxxxxx.xxxxxx',
    description: 'API Key 明文，后端会用 AES-256-GCM 加密后存入数据库',
  })
  @IsString()
  @IsNotEmpty({ message: 'API Key 不能为空' })
  @MinLength(10, { message: 'API Key 至少 10 个字符' })
  @MaxLength(500, { message: 'API Key 过长' })
  @Matches(/^[A-Za-z0-9._\-]+$/, {
    message: 'API Key 只能包含字母、数字、点(.)、下划线(_)和连字符(-)',
  })
  apiKey!: string;
}
