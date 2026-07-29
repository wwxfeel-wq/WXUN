import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateMemoryDto } from './create-memory.dto';

export class UpdateMemoryDto extends PartialType(CreateMemoryDto) {
  @ApiPropertyOptional({ description: '记忆标题' })
  title?: string;

  @ApiPropertyOptional({ description: '记忆内容' })
  content?: string;
}
