import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { QueryEntityDto } from './dto/query-entity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('知识图谱')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('entities')
  @ApiOperation({ summary: '获取知识实体列表', description: '分页获取知识实体列表，支持按类型筛选' })
  async listEntities(@CurrentUser('userId') userId: string, @Query() query: QueryEntityDto) {
    return this.knowledgeService.listEntities(userId, query);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索知识实体', description: '按关键词搜索知识实体（名称或描述）' })
  async searchEntities(
    @CurrentUser('userId') userId: string,
    @Query('q') q: string,
    @Query('type') type?: string,
  ) {
    return this.knowledgeService.searchEntities(userId, q, type);
  }

  @Get('graph')
  @ApiOperation({ summary: '获取知识图谱', description: '获取完整的知识图谱（节点+边）用于可视化' })
  async getKnowledgeGraph(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.knowledgeService.getKnowledgeGraph(
      userId,
      limit ? parseInt(limit, 10) : 200,
    );
  }

  @Get('entities/:id')
  @ApiOperation({ summary: '获取知识实体详情', description: '获取知识实体详情，包括关联记忆和关系' })
  async getEntity(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.knowledgeService.getEntity(userId, id);
  }

  @Get('entities/:id/relations')
  @ApiOperation({ summary: '获取实体关系', description: '获取知识实体的所有关系（出边和入边）' })
  async getEntityRelations(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.knowledgeService.getEntityRelations(userId, id);
  }
}
