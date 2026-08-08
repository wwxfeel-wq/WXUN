import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  OnModuleInit,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FamilyHubService } from './familyhub.service';
import { SkillsInvocationService } from './skills-invocation.service';
import { WechatService } from '../wechat/wechat.service';
import { InvokeAgentDto } from './dto/invoke-agent.dto';
import type { InvokeSkillAbilityDto } from '@echolife/shared';

@ApiTags('Family Hub')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('family-hub')
export class FamilyHubController implements OnModuleInit {
  constructor(
    private readonly service: FamilyHubService,
    private readonly skillsInvocation: SkillsInvocationService,
    private readonly wechatService: WechatService,
  ) {}

  /** Auto-seed agents and skills on first startup. */
  async onModuleInit() {
    try {
      await this.service.seedIfEmpty();
    } catch (err) {
      // seedIfEmpty 失败不应阻止 API 启动
      console.error('[FamilyHub] seedIfEmpty failed (non-fatal):', err);
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: '首页指标数据' })
  async getMetrics(@CurrentUser('userId') userId: string) {
    return this.service.getMetrics(userId);
  }

  @Get('shimo-core')
  @ApiOperation({ summary: '时墨核心状态' })
  async getShimoCore(@CurrentUser('userId') userId: string) {
    return this.service.getShimoCore(userId);
  }

  @Get('agents')
  @ApiOperation({ summary: '获取所有 Agent' })
  async getAgents() {
    return this.service.getAgents();
  }

  @Get('agents/:code')
  @ApiOperation({ summary: '获取单个 Agent 详情（含技能）' })
  async getAgent(@Param('code') code: string) {
    return this.service.getAgent(code);
  }

  @Post('agents/:code/invoke')
  @ApiOperation({ summary: '调用 Agent（真实 AI 对话）' })
  async invokeAgent(
    @Param('code') code: string,
    @Body() dto: InvokeAgentDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.invokeAgent(code, dto.message, user.userId);
  }

  @Get('skills')
  @ApiOperation({ summary: '获取所有技能' })
  async getSkills() {
    return this.service.getSkills();
  }

  @Post('skills/:id/learn')
  @ApiOperation({ summary: '学习技能（提升进度）' })
  async learnSkill(@Param('id') id: string) {
    return this.service.learnSkill(id);
  }

  @Post('skills/:id/invoke')
  @ApiOperation({ summary: '执行技能能力（调用真实 MCP 工具）' })
  async invokeSkillAbility(
    @Param('id') id: string,
    @Body() body: InvokeSkillAbilityDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.skillsInvocation.invoke(user.userId, id, body);
  }

  @Get('timeline')
  @ApiOperation({ summary: '学习时间线' })
  async getTimeline(@CurrentUser('userId') userId: string) {
    return this.service.getTimeline(userId);
  }

  @Get('execution-logs')
  @ApiOperation({ summary: '获取当前用户的 Agent 执行日志' })
  async getExecutionLogs(
    @CurrentUser() user: { userId: string },
    @Query('agentCode') agentCode?: string,
    @Query('limit') limit?: string,
  ) {
    // R1-BE-013: 限制 limit 最大 100 条
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    return this.service.getExecutionLogs(
      user.userId,
      agentCode,
      Number.isNaN(parsedLimit) ? 20 : parsedLimit,
    );
  }

  @Get('devices')
  @ApiOperation({ summary: '设备同步状态' })
  async getDevices(
    @CurrentUser() user: { userId: string },
  ) {
    // Check real WeChat connection status
    const wechatStatus = await this.wechatService.getStatus();
    const wechatConnected = wechatStatus.loggedIn;

    return [
      { id: 'web', name: 'Web', status: 'connected', icon: 'Globe' },
      { id: 'wechat', name: 'WeChat', status: wechatConnected ? 'connected' : 'disconnected', icon: 'MessageCircle' },
      { id: 'family', name: 'Family Group', status: wechatConnected ? 'connected' : 'coming_soon', icon: 'Users' },
      { id: 'memory', name: 'Memory', status: 'synced', icon: 'Database' },
      { id: 'app', name: 'App', status: 'coming_soon', icon: 'Smartphone' },
      { id: 'watch', name: 'Watch', status: 'coming_soon', icon: 'Watch' },
      { id: 'robot', name: 'Robot', status: 'coming_soon', icon: 'Bot' },
    ];
  }

  @Get('family-status')
  @ApiOperation({ summary: '家庭状态' })
  async getFamilyStatus() {
    return [
      { id: 'mood', label: '家庭情绪', value: '温暖', sub: '全员状态良好', color: 'var(--color-highlight)', icon: 'Smile' },
      { id: 'memory', label: '本周新增回忆', value: '3 段', sub: '昨天新增了1段', color: 'var(--color-info)', icon: 'BookOpen' },
      { id: 'tree', label: '生命树成长', value: 'Lv.8', sub: 'Young Tree 阶段', color: 'var(--color-success)', icon: 'TreePine' },
      { id: 'advice', label: '今日家庭建议', value: '给爸妈打个电话', sub: '已3天未联系', color: 'var(--color-error)', icon: 'Heart' },
      { id: 'todo', label: '本周待办', value: '周末家庭聚餐', sub: '周六晚上', color: 'var(--color-purple)', icon: 'Calendar' },
      { id: 'ai', label: 'AI理解程度', value: '89%', sub: '持续学习中', color: 'var(--color-secondary)', icon: 'Brain' },
    ];
  }
}
