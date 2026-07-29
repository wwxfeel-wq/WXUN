import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInterviewDto {
  @ApiProperty({ example: '童年回忆访谈', description: '访谈会话标题' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;
}
