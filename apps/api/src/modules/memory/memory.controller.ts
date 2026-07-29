import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MemoryService } from './memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { QueryMemoryDto } from './dto/query-memory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('记忆')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('memories')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  @ApiOperation({ summary: '获取记忆列表', description: '分页获取当前用户的记忆列表，支持按类型、情感、可见性筛选和排序' })
  async list(@CurrentUser('userId') userId: string, @Query() query: QueryMemoryDto) {
    return this.memoryService.list(userId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建记忆', description: '创建一条新的记忆记录' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateMemoryDto) {
    return this.memoryService.create(userId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取记忆统计', description: '获取当前用户记忆的聚合统计数据' })
  async getStats(@CurrentUser('userId') userId: string) {
    return this.memoryService.getMemoryStats(userId);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索记忆', description: '按关键词全文搜索记忆标题和内容' })
  async search(
    @CurrentUser('userId') userId: string,
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.memoryService.searchMemories(
      userId,
      q,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('date-range')
  @ApiOperation({ summary: '按日期范围获取记忆', description: '获取指定日期范围内发生的记忆' })
  async getByDateRange(
    @CurrentUser('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.memoryService.getMemoriesByDateRange(
      userId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取记忆详情', description: '根据ID获取单条记忆详情' })
  async findById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.memoryService.findById(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新记忆', description: '更新指定记忆的内容和属性' })
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoryService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除记忆', description: '软删除指定记忆（标记为已删除）' })
  async delete(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.memoryService.softDelete(userId, id);
    return { success: true };
  }
}
