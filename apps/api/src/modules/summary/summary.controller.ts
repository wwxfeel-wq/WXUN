import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SummaryService } from './summary.service';
import { GenerateSummaryDto } from './dto/generate-summary.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('生活总结')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('summaries')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  @ApiOperation({ summary: '获取总结列表', description: '分页获取当前用户的生活总结列表' })
  async list(@CurrentUser('userId') userId: string, @Query() query: QuerySummaryDto) {
    return this.summaryService.list(userId, query);
  }

  @Get('latest')
  @ApiOperation({ summary: '获取最新总结', description: '获取当前用户最新的生活总结' })
  async getLatest(@CurrentUser('userId') userId: string, @Query('period') period?: string) {
    return this.summaryService.getLatest(userId, period);
  }

  @Post('generate')
  @ApiOperation({
    summary: '生成生活总结',
    description: '调用AI总结代理，基于指定时间段的记忆生成周期性生活总结',
  })
  async generate(@CurrentUser('userId') userId: string, @Body() dto: GenerateSummaryDto) {
    return this.summaryService.generate(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取总结详情', description: '根据ID获取单条生活总结详情' })
  async getById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.summaryService.getById(userId, id);
  }
}
