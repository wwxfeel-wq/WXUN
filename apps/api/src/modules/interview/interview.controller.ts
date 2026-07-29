import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InterviewService } from './interview.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { QueryInterviewDto } from './dto/query-interview.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('访谈')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post()
  @ApiOperation({ summary: '创建访谈会话', description: '创建一个新的AI访谈会话' })
  async createSession(@CurrentUser('userId') userId: string, @Body() dto: CreateInterviewDto) {
    return this.interviewService.createSession(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取访谈列表', description: '分页获取当前用户的访谈会话列表' })
  async listSessions(@CurrentUser('userId') userId: string, @Query() query: QueryInterviewDto) {
    return this.interviewService.listSessions(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取访谈详情', description: '根据ID获取访谈会话详情' })
  async getSession(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.interviewService.getSession(userId, id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: '完成访谈', description: '将访谈会话标记为已完成' })
  async completeSession(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.interviewService.completeSession(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '放弃访谈', description: '将访谈会话标记为已放弃' })
  async abandonSession(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.interviewService.abandonSession(userId, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: '获取访谈消息', description: '获取访谈会话中的所有对话消息' })
  async getMessages(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.interviewService.getMessages(userId, id);
  }
}
