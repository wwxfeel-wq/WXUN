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
import { LifeTreeService, LinkMemoryPayload } from './lifetree.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('生命树')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('life-tree')
export class LifeTreeController {
  constructor(private readonly lifeTreeService: LifeTreeService) {}

  @Get()
  @ApiOperation({ summary: '获取生命树', description: '获取当前用户的完整生命树结构（递归嵌套）' })
  async getTree(@CurrentUser('userId') userId: string) {
    return this.lifeTreeService.getTree(userId);
  }

  @Get('stats')
  @ApiOperation({
    summary: '生命树成长数据',
    description: '基于真实家庭成员、记忆、时间胶囊、里程碑计算的生命树成长阶段与可视化指标',
  })
  async getTreeStats(@CurrentUser('userId') userId: string) {
    return this.lifeTreeService.getTreeGrowthStats(userId);
  }

  @Get('nodes')
  @ApiOperation({ summary: '按类型获取节点', description: '获取指定类型的所有生命树节点（扁平列表）' })
  async getNodesByType(@CurrentUser('userId') userId: string, @Query('type') type: string) {
    return this.lifeTreeService.getNodesByType(userId, type);
  }

  @Post()
  @ApiOperation({ summary: '创建节点', description: '在生命树中创建一个新节点' })
  async createNode(@CurrentUser('userId') userId: string, @Body() dto: CreateNodeDto) {
    return this.lifeTreeService.createNode(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新节点', description: '更新生命树节点信息' })
  async updateNode(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.lifeTreeService.updateNode(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除节点', description: '删除生命树节点，子节点会被重新挂载到父节点' })
  async deleteNode(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.lifeTreeService.deleteNode(userId, id);
    return { success: true };
  }

  @Post(':id/link-memory')
  @ApiOperation({ summary: '关联记忆', description: '将一条记忆关联到生命树节点' })
  async linkMemory(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() payload: LinkMemoryPayload,
  ) {
    return this.lifeTreeService.linkMemory(userId, id, payload);
  }
}
