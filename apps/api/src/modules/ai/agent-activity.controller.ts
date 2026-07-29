import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AgentEcosystemService } from './services/agent-ecosystem.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * AgentActivityController
 *
 * Exposes the live status and activity stream of the six background agents
 * that make up the EchoLife agent ecosystem.
 *
 * Base path (after the global `api/v1` prefix):
 *   /api/v1/ai/agent-ecosystem
 */
@ApiTags('AI · Agent Ecosystem')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('ai/agent-ecosystem')
export class AgentActivityController {
  constructor(private readonly agentEcosystem: AgentEcosystemService) {}

  /**
   * GET /api/v1/ai/agent-ecosystem
   *
   * Returns all six agents with their current status and stats.
   */
  @Get()
  @ApiOperation({
    summary: '获取全部后台代理状态',
    description: '返回 6 个后台代理的实时状态、当前活动及统计数据',
  })
  async getAgents() {
    return this.agentEcosystem.getAgentStatuses();
  }

  /**
   * GET /api/v1/ai/agent-ecosystem/activities/recent
   *
   * Returns recent activities from all agents within the last 24 hours.
   *
   * NOTE: This route must be declared before the `:agentId` route so that
   * "activities" is not captured as an agentId parameter.
   */
  @Get('activities/recent')
  @ApiOperation({
    summary: '获取全部代理最近活动',
    description: '返回过去 24 小时内所有代理的活动记录（默认最多 50 条）',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '返回的最大活动条数（默认 50）',
  })
  async getRecentActivities(@Query('limit') limit?: number) {
    const max = limit ? Math.min(Math.max(limit, 1), 200) : 50;
    return this.agentEcosystem.getRecentActivities(max);
  }

  /**
   * GET /api/v1/ai/agent-ecosystem/:agentId
   *
   * Returns one agent's details and its recent activities.
   */
  @Get(':agentId')
  @ApiOperation({
    summary: '获取单个代理详情',
    description: '返回指定代理的状态信息及最近活动记录',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '返回的最大活动条数（默认 20）',
  })
  async getAgent(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: number,
  ) {
    const agent = this.agentEcosystem.getAgentById(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    const max = limit ? Math.min(Math.max(limit, 1), 100) : 20;
    const activities = await this.agentEcosystem.getAgentActivities(agentId, {
      limit: max,
    });

    return { agent, activities };
  }

  /**
   * POST /api/v1/ai/agent-ecosystem/:agentId/trigger
   *
   * Manually triggers an agent run. The run completes before the response is
   * returned so the caller receives the agent's updated state.
   */
  @Post(':agentId/trigger')
  @ApiOperation({
    summary: '手动触发代理运行',
    description: '立即触发指定代理执行一次，返回运行后的最新状态',
  })
  async triggerAgent(@Param('agentId') agentId: string) {
    return this.agentEcosystem.triggerRun(agentId);
  }
}
