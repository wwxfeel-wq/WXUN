import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {
  @ApiPropertyOptional({ description: '公告标题' })
  title?: string;

  @ApiPropertyOptional({ description: '公告内容' })
  content?: string;

  @ApiPropertyOptional({ description: '是否发布' })
  isPublished?: boolean;
}
