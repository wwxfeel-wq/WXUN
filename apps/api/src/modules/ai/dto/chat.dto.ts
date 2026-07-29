import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatDto {
  @ApiProperty({ example: '今天我想聊聊我小时候的故事', description: '用户消息内容' })
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(10000, { message: '消息内容不能超过10000个字符' })
  message!: string;

  @ApiPropertyOptional({ example: 'uuid-interview-id', description: '访谈会话ID（可选）' })
  @IsString()
  @IsOptional()
  interviewId?: string;
}

export class DigitalLifeDto {
  @ApiProperty({ example: '你最近过得怎么样？', description: '向数字生命提问的内容' })
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(10000, { message: '消息内容不能超过10000个字符' })
  message!: string;

  @ApiPropertyOptional({ example: '你是一个幽默风趣的数字生命', description: '自定义数字生命人格设定' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  persona?: string;
}
