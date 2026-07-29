import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'wxid_xxx', description: '目标联系人/群聊的微信 UserName' })
  @IsString({ message: '接收方 ID 必须是字符串' })
  @MinLength(1, { message: '接收方 ID 不能为空' })
  toId!: string;

  @ApiProperty({ example: '你好，时墨', description: '要发送的文本内容' })
  @IsString({ message: '消息内容必须是字符串' })
  @MinLength(1, { message: '消息内容不能为空' })
  content!: string;
}
