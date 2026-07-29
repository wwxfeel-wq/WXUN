import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'dark', enum: ['dark', 'light', 'auto'], description: '主题' })
  @IsIn(['dark', 'light', 'auto'], { message: '主题取值不正确' })
  @IsOptional()
  theme?: string;

  @ApiPropertyOptional({ example: 'zh-CN', enum: ['zh-CN', 'en-US'], description: '语言' })
  @IsIn(['zh-CN', 'en-US'], { message: '语言取值不正确' })
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: true, description: '是否接收邮件通知' })
  @IsBoolean()
  @IsOptional()
  notificationEmail?: boolean;

  @ApiPropertyOptional({ example: true, description: '是否接收推送通知' })
  @IsBoolean()
  @IsOptional()
  notificationPush?: boolean;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2, description: 'AI温度参数（0-2）' })
  @IsNumber()
  @Min(0, { message: 'AI温度不能小于0' })
  @Max(2, { message: 'AI温度不能大于2' })
  @IsOptional()
  aiTemperature?: number;

  @ApiPropertyOptional({ example: 365, minimum: 1, maximum: 3650, description: '记忆保留天数' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '记忆保留天数不能小于1' })
  @Max(3650, { message: '记忆保留天数不能大于3650' })
  @IsOptional()
  memoryRetentionDays?: number;
}
