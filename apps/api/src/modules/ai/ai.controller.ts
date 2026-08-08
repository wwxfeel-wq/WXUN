import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import type { IncomingMessage } from 'http';
import { AgentOrchestratorService } from './services/agent-orchestrator.service';
import { SSEEvent } from '@echolife/shared';
import { ChatDto, DigitalLifeDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AGENTS } from '@echolife/shared';

@ApiTags('AI')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  /**
   * SSE streaming endpoint for interview chat.
   * Streams AI response as Server-Sent Events.
   *
   * Event format:
   *   event: {type}\n
   *   data: {json}\n\n
   *
   * Event types: token, entities, emotion, skill_exp, skill_level_up, done, error
   */
  @Post('chat')
  @HttpCode(200)
  @ApiOperation({
    summary: 'AI访谈对话（SSE流式）',
    description: '与AI生命教练进行访谈对话，响应以SSE流式返回',
  })
  async chat(
    @Body() dto: ChatDto,
    @CurrentUser('userId') userId: string,
    @Req() req: IncomingMessage,
    @Res() res: Response,
  ): Promise<void> {
    this.setSSEHeaders(res);

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on('close', onClose);

    try {
      const generator = this.orchestrator.interview({
        userId,
        message: dto.message,
        interviewId: dto.interviewId,
      });

      for await (const event of generator) {
        if (abortController.signal.aborted) break;
        this.writeSSEEvent(res, event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        this.writeSSEEvent(res, {
          type: 'error' as never,
          data: {
            message: 'AI服务内部错误',
            code: 50001,
          },
        });
      }
    } finally {
      req.removeListener('close', onClose);
      res.end();
    }
  }

  /**
   * SSE streaming endpoint for the digital life persona.
   * The digital life speaks in the user's voice based on their memories.
   */
  @Post('digital-life')
  @HttpCode(200)
  @ApiOperation({
    summary: '数字生命对话（SSE流式）',
    description: '与用户的数字生命分身对话，响应以SSE流式返回',
  })
  async digitalLife(
    @Body() dto: DigitalLifeDto,
    @CurrentUser('userId') userId: string,
    @Req() req: IncomingMessage,
    @Res() res: Response,
  ): Promise<void> {
    this.setSSEHeaders(res);

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on('close', onClose);

    try {
      const generator = this.orchestrator.digitalLife({
        userId,
        message: dto.message,
        persona: dto.persona,
      });

      for await (const event of generator) {
        if (abortController.signal.aborted) break;
        this.writeSSEEvent(res, event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        this.writeSSEEvent(res, {
          type: 'error' as never,
          data: {
            message: '数字生命服务内部错误',
            code: 50001,
          },
        });
      }
    } finally {
      req.removeListener('close', onClose);
      res.end();
    }
  }

  /**
   * Lists all available AI agents with their metadata.
   */
  @Get('agents')
  @ApiOperation({
    summary: '获取可用AI代理列表',
    description: '返回系统中所有可用的AI代理及其描述',
  })
  async getAgents() {
    return Object.entries(AGENTS).map(([type, info]) => ({
      type,
      name: info.name,
      description: info.description,
      maxTokens: info.maxTokens,
    }));
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Sets the required headers for Server-Sent Events.
   */
  private setSSEHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    res.flushHeaders();
  }

  /**
   * Writes a single SSE event to the response stream.
   *
   * Format:
   *   event: {type}\n
   *   data: {json}\n\n
   */
  private writeSSEEvent(res: Response, event: SSEEvent): void {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }
}
