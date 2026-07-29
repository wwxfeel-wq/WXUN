import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CapsuleType } from '@echolife/shared';

export class CreateCapsuleDto {
  @ApiProperty({ example: '给十年后的自己', description: '时间胶囊标题' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;

  @ApiProperty({ example: '亲爱的未来的我，希望你一切安好...', description: '时间胶囊内容' })
  @IsString()
  @IsNotEmpty({ message: '内容不能为空' })
  @MaxLength(50000, { message: '内容不能超过50000个字符' })
  content!: string;

  @ApiProperty({
    example: 'personal',
    enum: CapsuleType,
    description: '时间胶囊类型',
    default: CapsuleType.PERSONAL,
  })
  @IsIn(Object.values(CapsuleType), { message: '时间胶囊类型不正确' })
  @IsOptional()
  type?: CapsuleType;

  @ApiProperty({ example: '2034-07-01T00:00:00.000Z', description: '开启时间（到期后才能打开）' })
  @IsDateString({}, { message: '开启时间格式不正确' })
  @Type(() => Date)
  openAt!: Date;

  @ApiPropertyOptional({
    example: { recipients: ['家人'], attachments: [] },
    description: '元数据（任意 JSON 结构）',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
