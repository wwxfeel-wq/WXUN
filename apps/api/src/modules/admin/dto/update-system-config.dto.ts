import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({
    example: 'maintenance_mode',
    description: '配置键名（从URL参数获取，无需在请求体中提供）',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: '配置键名不能超过100个字符' })
  key?: string;

  @ApiProperty({ example: 'false', description: '配置值' })
  @IsString()
  @IsNotEmpty({ message: '配置值不能为空' })
  value!: string;

  @ApiPropertyOptional({
    example: 'string',
    enum: ['string', 'number', 'boolean', 'json'],
    description: '值类型',
    default: 'string',
  })
  @IsIn(['string', 'number', 'boolean', 'json'])
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ example: '是否开启维护模式', description: '配置描述' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
