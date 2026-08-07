import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FamilyService, JoinFamilyPayload } from './family.service';
import { SupervisionService } from './supervision.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { ShareMemoryDto } from './dto/share-memory.dto';
import { QuerySharedMemoryDto } from './dto/query-shared-memory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('家庭')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class FamilyController {
  private readonly logger = new Logger(FamilyController.name);

  constructor(
    private readonly familyService: FamilyService,
    private readonly supervisionService: SupervisionService,
  ) {}

  @Get('families')
  @ApiOperation({ summary: '获取我的家庭列表', description: '获取当前用户加入的所有家庭组' })
  async listMyFamilies(@CurrentUser('userId') userId: string) {
    const families = await this.familyService.listUserFamilies(userId);
    return { families, count: families.length };
  }

  @Post('families')
  @ApiOperation({ summary: '创建家庭', description: '创建一个新的家庭组，创建者自动成为管理员' })
  async createFamily(@CurrentUser('userId') userId: string, @Body() dto: CreateFamilyDto) {
    return this.familyService.createFamily(userId, dto);
  }

  @Post('families/join')
  @ApiOperation({ summary: '加入家庭', description: '通过邀请码加入一个家庭组' })
  async joinFamily(@CurrentUser('userId') userId: string, @Body() payload: JoinFamilyPayload) {
    return this.familyService.joinFamily(userId, payload);
  }

  @Get('families/:id')
  @ApiOperation({ summary: '获取家庭详情', description: '获取家庭组的详细信息' })
  async getFamily(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.familyService.getFamily(userId, id);
  }

  @Get('families/:id/members')
  @ApiOperation({ summary: '获取家庭成员', description: '获取家庭组的所有成员列表' })
  async listMembers(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.familyService.listMembers(userId, id);
  }

  @Post('families/:id/memories')
  @ApiOperation({ summary: '分享记忆', description: '将一条记忆分享到家庭组' })
  async shareMemory(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: ShareMemoryDto,
  ) {
    return this.familyService.shareMemory(userId, id, dto);
  }

  @Get('families/:id/memories')
  @ApiOperation({ summary: '获取家庭记忆列表', description: '获取家庭组中分享的记忆列表' })
  async listSharedMemories(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query() query: QuerySharedMemoryDto,
  ) {
    return this.familyService.listSharedMemories(userId, id, query);
  }

  @Post('families/memories/:id/confirm')
  @ApiOperation({ summary: '确认家庭记忆', description: '确认一条家庭分享的记忆' })
  async confirmMemory(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.familyService.confirmMemory(userId, id);
  }

  @Post('families/memories/:id/reject')
  @ApiOperation({ summary: '拒绝家庭记忆', description: '拒绝一条家庭分享的记忆' })
  async rejectMemory(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.familyService.rejectMemory(userId, id);
  }

  @Delete('families/:id/leave')
  @ApiOperation({ summary: '离开家庭', description: '退出一个家庭组' })
  async leaveFamily(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.familyService.leaveFamily(userId, id);
    return { success: true };
  }

  // ============================================================
  // 督促提醒（家长角色体系）
  // ============================================================

  @Get('families/supervisions')
  @ApiOperation({
    summary: '获取督促任务列表',
    description: '根据设备状态和时间段生成督促任务，返回当前活跃的督促任务列表',
  })
  async getSupervisions(@CurrentUser('userId') userId: string) {
    try {
      await this.supervisionService.generateSupervisions(userId);
      const tasks = await this.supervisionService.getActiveSupervisions(userId);
      return { supervisions: tasks, count: tasks.length };
    } catch (error) {
      this.logger.error(
        `获取督促任务失败 (userId=${userId}): ${(error as Error).message}\n${(error as Error).stack}`,
      );
      return { supervisions: [], count: 0 };
    }
  }

  @Post('families/supervisions/:id/resolve')
  @ApiOperation({
    summary: '标记督促任务已完成',
    description: '将指定的督促任务标记为已完成状态',
  })
  async resolveSupervision(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    const task = await this.supervisionService.resolveSupervision(userId, id);
    return { success: true, supervision: task };
  }
}
