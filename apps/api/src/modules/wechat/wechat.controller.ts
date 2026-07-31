import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WechatService } from './wechat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { BindFamilyMemberDto } from './dto/bind-family-member.dto';
import { Observable } from 'rxjs';

@ApiTags('WeChat Bot')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Post('login')
  @ApiOperation({ summary: '启动微信登录（获取二维码）' })
  async startLogin() {
    const result = await this.wechatService.startLogin();
    return { success: true, qrCodeUrl: result.qrCodeUrl };
  }

  @Get('status')
  @ApiOperation({ summary: '获取微信连接状态' })
  getStatus() {
    return this.wechatService.getStatus();
  }

  @Get('health')
  @ApiOperation({ summary: '微信连接健康检查' })
  healthCheck() {
    return this.wechatService.healthCheck();
  }

  @Post('logout')
  @ApiOperation({ summary: '退出微信登录' })
  async logout() {
    await this.wechatService.logout();
    return { success: true };
  }

  @Get('contacts')
  @ApiOperation({ summary: '获取微信联系人列表' })
  getContacts() {
    return this.wechatService.getContacts();
  }

  @Get('messages/:contactId')
  @ApiOperation({ summary: '获取与某联系人的聊天记录' })
  getMessages(@Param('contactId') contactId: string) {
    return this.wechatService.getMessages(contactId);
  }

  @Post('send')
  @ApiOperation({ summary: '发送微信消息' })
  async sendMessage(@Body() body: SendMessageDto) {
    const result = await this.wechatService.sendMessage(
      body.toId,
      body.content,
    );
    return result;
  }

  @Post('bind-family-member')
  @ApiOperation({ summary: '将微信身份绑定到家庭成员' })
  async bindFamilyMember(@Body() body: BindFamilyMemberDto) {
    await this.wechatService.bindFamilyMember(body);
    return { success: true };
  }

  @Sse('stream')
  @ApiOperation({ summary: 'SSE 实时消息推送' })
  streamMessages(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.wechatService.onMessage((msg) => {
        subscriber.next({
          data: JSON.stringify(msg),
          type: 'message',
        });
      });

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        subscriber.next({ data: 'ping', type: 'heartbeat' });
      }, 30000);

      // Cleanup on unsubscribe
      return () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
    });
  }
}
