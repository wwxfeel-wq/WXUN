import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '张三', description: '用户昵称' })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: '昵称至少需要2个字符' })
  @MaxLength(100, { message: '昵称不能超过100个字符' })
  nickname?: string;

  @ApiPropertyOptional({ example: 'https://cdn.echolife.com/avatar/123.png', description: '头像URL' })
  @IsUrl({}, { message: '头像URL格式不正确' })
  @IsOptional()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '热爱生活，喜欢记录点滴。', description: '个人简介' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: '简介不能超过500个字符' })
  bio?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: '出生日期' })
  @IsDateString({}, { message: '出生日期格式不正确' })
  @IsOptional()
  @Type(() => Date)
  birthDate?: Date;

  @ApiPropertyOptional({ example: 'male', enum: ['male', 'female', 'other'], description: '性别' })
  @IsIn(['male', 'female', 'other'], { message: '性别取值不正确' })
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: '北京', description: '所在地' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ example: '软件工程师', description: '职业' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  occupation?: string;
}
