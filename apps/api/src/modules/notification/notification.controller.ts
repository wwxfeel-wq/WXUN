import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('通知')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取通知列表', description: '分页获取当前用户的通知列表，支持按已读状态筛选' })
  async list(@CurrentUser('userId') userId: string, @Query() query: QueryNotificationDto) {
    return this.notificationService.list(userId, query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: '全部标记已读', description: '将当前用户所有未读通知标记为已读' })
  async markAllAsRead(@CurrentUser('userId') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '标记已读', description: '将单条通知标记为已读' })
  async markAsRead(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.notificationService.markAsRead(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除通知', description: '永久删除一条通知' })
  async delete(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.notificationService.delete(userId, id);
    return { success: true };
  }
}
