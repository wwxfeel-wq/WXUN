import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { AgentType, PromptStatus } from '@echolife/shared';

export class QueryPromptsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AgentType, description: 'AI代理类型筛选' })
  @IsIn(Object.values(AgentType))
  @IsOptional()
  @IsString()
  agentType?: AgentType;

  @ApiPropertyOptional({ enum: PromptStatus, description: '提示词状态筛选' })
  @IsIn(Object.values(PromptStatus))
  @IsOptional()
  @IsString()
  status?: PromptStatus;
}
