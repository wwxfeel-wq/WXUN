import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: '系统维护通知', description: '公告标题' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;

  @ApiProperty({ example: '系统将于本周六凌晨进行维护升级...', description: '公告内容' })
  @IsString()
  @IsNotEmpty({ message: '内容不能为空' })
  @MaxLength(10000, { message: '内容不能超过10000个字符' })
  content!: string;

  @ApiProperty({
    example: 'info',
    enum: ['info', 'warning', 'maintenance', 'update'],
    description: '公告类型',
    default: 'info',
  })
  @IsIn(['info', 'warning', 'maintenance', 'update'], { message: '公告类型不正确' })
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ example: true, description: '是否发布', default: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59.999Z', description: '过期时间' })
  @IsDateString({}, { message: '过期时间格式不正确' })
  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date;
}
