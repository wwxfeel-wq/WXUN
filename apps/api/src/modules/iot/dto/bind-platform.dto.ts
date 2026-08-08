import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

/** 绑定平台凭证请求 DTO（米家使用 token，HomeKit 使用 homebridgeUrl + authToken） */
export class BindPlatformDto {
  @ApiPropertyOptional({
    example: 'ATB3F8...token...',
    description: '米家 access token',
  })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional({
    example: 'RT9C2A...refresh...',
    description: '米家 refresh token',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({
    example: 'http://192.168.1.10:51828',
    description: 'Homebridge REST API 地址',
  })
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'homebridgeUrl 必须是合法的 http(s) 地址' },
  )
  @IsOptional()
  homebridgeUrl?: string;

  @ApiPropertyOptional({
    example: '9F7B-...-auth-token',
    description: 'Homebridge 鉴权 token',
  })
  @IsString()
  @IsOptional()
  authToken?: string;

  @ApiPropertyOptional({
    example: 2592000,
    description: '米家 token 过期时间（秒），用于计算 expiresAt',
  })
  @IsInt()
  @IsOptional()
  expiresInSeconds?: number;
}
