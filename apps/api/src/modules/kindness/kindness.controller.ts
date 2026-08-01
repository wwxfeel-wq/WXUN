import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KindnessService } from './kindness.service';
import { CreateKindnessDto } from './dto/create-kindness.dto';
import { QueryKindnessDto } from './dto/query-kindness.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('童忆引擎')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('kindness')
export class KindnessController {
  constructor(private readonly kindnessService: KindnessService) {}

  // ============================================================
  // CRUD
  // ============================================================

  @Get()
  @ApiOperation({ summary: '获取温暖瞬间列表', description: '分页获取温暖瞬间，支持按类型、重要度、情绪筛选' })
  async list(@CurrentUser('userId') userId: string, @Query() query: QueryKindnessDto) {
    return this.kindnessService.list(userId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建温暖瞬间', description: '记录一个家庭温暖瞬间，自动进入 Family Memory Graph' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateKindnessDto) {
    return this.kindnessService.create(userId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取温暖统计', description: '温暖瞬间聚合统计' })
  async getStats(@CurrentUser('userId') userId: string) {
    return this.kindnessService.getStats(userId);
  }

  @Get('nodes')
  @ApiOperation({ summary: '获取 Kindness Network 节点', description: '供 Life Core 粒子云渲染' })
  async getNodes(@CurrentUser('userId') userId: string, @Query('limit') limit?: string) {
    return this.kindnessService.getKindnessNodes(userId, limit ? parseInt(limit, 10) : 50);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取温暖瞬间详情' })
  async findById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.kindnessService.findById(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除温暖瞬间' })
  async delete(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.kindnessService.softDelete(userId, id);
    return { success: true };
  }

  // ============================================================
  // 核心能力 1：Memory Story Reconstruction
  // ============================================================

  @Post(':id/story')
  @ApiOperation({ summary: '重新讲述温暖瞬间', description: 'AI 生成温暖家庭故事' })
  async reconstructStory(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    const story = await this.kindnessService.reconstructStory(userId, id);
    return { story };
  }

  // ============================================================
  // 核心能力 2：Family Kindness Moments
  // ============================================================

  @Post('detect')
  @ApiOperation({ summary: '识别家庭温暖行为', description: '从文本中自动识别家庭温暖行为' })
  async detectKindness(@CurrentUser('userId') userId: string, @Body('text') text: string) {
    return this.kindnessService.detectKindness(userId, text);
  }

  // ============================================================
  // 核心能力 3：Daily Warm Reminder
  // ============================================================

  @Post('reminder/daily')
  @ApiOperation({ summary: '生成每日温暖提醒', description: '像童年公益广告一样的短暂陪伴' })
  async generateDailyReminder(@CurrentUser('userId') userId: string) {
    return this.kindnessService.generateDailyReminder(userId);
  }

  @Get('reminders/pending')
  @ApiOperation({ summary: '获取待发送的温暖提醒' })
  async getPendingReminders(@CurrentUser('userId') userId: string) {
    return this.kindnessService.getPendingReminders(userId);
  }

  // ============================================================
  // 核心能力 4：Family Short Story Generator
  // ============================================================

  @Post('story/generate')
  @ApiOperation({ summary: '生成家庭短故事', description: '每天/每周生成一段温暖的家庭故事' })
  async generateShortStory(
    @CurrentUser('userId') userId: string,
    @Query('period') period?: string,
  ) {
    return this.kindnessService.generateShortStory(userId, (period as 'daily' | 'weekly') ?? 'daily');
  }

  @Get('stories')
  @ApiOperation({ summary: '获取历史家庭短故事' })
  async getShortStories(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.kindnessService.getShortStories(
      userId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 10,
    );
  }
}
