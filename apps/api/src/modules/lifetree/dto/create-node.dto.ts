import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { LifeTreeNodeType } from '@echolife/shared';

export class CreateNodeDto {
  @ApiPropertyOptional({ description: '父节点ID（根节点不传）' })
  @IsUUID('4', { message: '父节点ID格式不正确' })
  @IsOptional()
  parentId?: string;

  @ApiProperty({
    example: 'category',
    enum: LifeTreeNodeType,
    description: '节点类型',
    default: LifeTreeNodeType.CATEGORY,
  })
  @IsIn(Object.values(LifeTreeNodeType), { message: '节点类型不正确' })
  @IsOptional()
  type?: LifeTreeNodeType;

  @ApiProperty({ example: '童年时光', description: '节点标题' })
  @IsString()
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题不能超过200个字符' })
  title!: string;

  @ApiPropertyOptional({ example: '记录童年时期的美好回忆', description: '节点描述' })
  @IsString()
  @IsOptional()
  @MaxLength(2000, { message: '描述不能超过2000个字符' })
  description?: string;

  @ApiPropertyOptional({
    example: { color: 'var(--color-primary)', icon: 'star' },
    description: '元数据（任意 JSON 结构）',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
