import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 调用 Agent 请求 DTO */
export class InvokeAgentDto {
  @ApiProperty({
    example: '帮我规划周末家庭聚餐',
    description: '发送给 Agent 的消息内容',
  })
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(10000, { message: '消息内容不能超过10000个字符' })
  message!: string;
}
