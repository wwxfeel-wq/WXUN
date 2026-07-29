import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateNodeDto } from './create-node.dto';

export class UpdateNodeDto extends PartialType(CreateNodeDto) {
  @ApiPropertyOptional({ description: '节点标题' })
  title?: string;

  @ApiPropertyOptional({ description: '节点描述' })
  description?: string;

  @ApiPropertyOptional({ description: '父节点ID' })
  parentId?: string;
}
