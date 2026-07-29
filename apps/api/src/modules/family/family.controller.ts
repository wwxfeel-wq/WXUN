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
import { FamilyService, JoinFamilyPayload } from './family.service';
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
  constructor(private readonly familyService: FamilyService) {}

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
}
