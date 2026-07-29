import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';
import { PromptStatus } from '@echolife/shared';

export class UpdatePromptStatusDto {
  @ApiProperty({
    enum: [PromptStatus.ACTIVE, PromptStatus.ARCHIVED],
    example: 'active',
    description: '提示词状态',
  })
  @IsIn([PromptStatus.ACTIVE, PromptStatus.ARCHIVED], {
    message: '提示词状态不正确，可选值: active, archived',
  })
  @IsNotEmpty({ message: '状态不能为空' })
  status!: string;
}
