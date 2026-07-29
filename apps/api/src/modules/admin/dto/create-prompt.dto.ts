import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AgentType } from '@echolife/shared';

export class CreatePromptDto {
  @ApiProperty({ enum: AgentType, example: 'life_coach', description: 'AI代理类型' })
  @IsIn(Object.values(AgentType), { message: 'AI代理类型不正确' })
  @IsNotEmpty({ message: '代理类型不能为空' })
  agentType!: AgentType;

  @ApiProperty({ example: '1.2.0', description: '版本号（语义化版本格式）' })
  @IsString()
  @IsNotEmpty({ message: '版本号不能为空' })
  @Matches(/^\d+\.\d+\.\d+$/, { message: '版本号格式不正确，应为 x.y.z 格式' })
  @MaxLength(20)
  version!: string;

  @ApiProperty({ example: '你是EchoLife的生命教练...', description: '提示词内容' })
  @IsString()
  @IsNotEmpty({ message: '提示词内容不能为空' })
  @MinLength(1, { message: '提示词内容不能为空' })
  content!: string;

  @ApiPropertyOptional({
    example: { user_nickname: 'string', user_message: 'string' },
    description: '变量定义',
  })
  @IsObject()
  @IsOptional()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '更新了生命教练的提示词', description: '版本描述' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
