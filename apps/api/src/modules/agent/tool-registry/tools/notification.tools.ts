import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { NotificationService } from '../../../notification/notification.service';
import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
} from '../types/tool-registry.types';

/**
 * Notification / family communication MCP tools.
 *
 * These tools create real in-app notifications for the user and, when
 * requested, for other members of the same families.
 */
@Injectable()
export class NotificationTools {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  getDefinitions(): McpToolDefinition[] {
    return [this.sendFamilyNotification()];
  }

  private sendFamilyNotification(): McpToolDefinition {
    return {
      name: 'send_family_notification',
      description: '给家庭成员发送一条应用内通知',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '通知标题',
          },
          body: {
            type: 'string',
            description: '通知正文',
          },
          type: {
            type: 'string',
            description: '通知类型标签',
            default: 'family_notification',
          },
          notifyFamilyMembers: {
            type: 'boolean',
            description: '是否同时通知同家庭其他成员',
            default: false,
          },
        },
        required: ['title', 'body'],
      },
      handler: async (args, ctx) => this.handleSendFamilyNotification(args, ctx),
    };
  }

  private async handleSendFamilyNotification(
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<McpToolResult> {
    const title = String(args.title ?? '').trim();
    const body = String(args.body ?? '').trim();

    if (!title || !body) {
      return {
        tool: 'send_family_notification',
        success: false,
        summary: '请提供通知标题和正文',
      };
    }

    const type = typeof args.type === 'string' ? args.type : 'family_notification';
    const notifyFamilyMembers = args.notifyFamilyMembers === true;

    try {
      const payloads: Array<{
        userId: string;
        type: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
      }> = [
        {
          userId: ctx.userId,
          type,
          title,
          body,
          data: { agentCode: ctx.agentCode, invokedAsSkill: true },
        },
      ];

      if (notifyFamilyMembers) {
        const memberIds = await this.findFamilyMemberUserIds(ctx.userId);
        for (const memberId of memberIds) {
          if (memberId === ctx.userId) continue;
          payloads.push({
            userId: memberId,
            type,
            title,
            body,
            data: { agentCode: ctx.agentCode, invokedAsSkill: true, fromUserId: ctx.userId },
          });
        }
      }

      const notifications = await this.notificationService.createBatch(payloads);

      return {
        tool: 'send_family_notification',
        success: true,
        summary:
          notifications.length > 1
            ? `已发送家庭通知「${title}」给 ${notifications.length} 位成员`
            : `已发送家庭通知「${title}」`,
        data: { notificationIds: notifications.map((n) => n.id) },
      };
    } catch (error) {
      return {
        tool: 'send_family_notification',
        success: false,
        summary: `发送家庭通知失败：${(error as Error).message}`,
      };
    }
  }

  private async findFamilyMemberUserIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });

    if (memberships.length === 0) return [];

    const familyIds = memberships.map((m) => m.familyId);
    const members = await this.prisma.familyMember.findMany({
      where: { familyId: { in: familyIds } },
      select: { userId: true },
      distinct: ['userId'],
    });

    return members.map((m) => m.userId);
  }
}
