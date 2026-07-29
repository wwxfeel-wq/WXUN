import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryAiLogsDto } from './dto/query-ai-logs.dto';
import { QueryPromptsDto } from './dto/query-prompts.dto';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { UpdatePromptStatusDto } from './dto/update-prompt-status.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('管理后台')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'operator')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============================================================
  // User Management
  // ============================================================

  @Get('users')
  @ApiOperation({ summary: '获取用户列表', description: '分页获取所有用户列表，支持按状态筛选和邮箱搜索' })
  async listUsers(@Query() query: QueryUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: '更新用户状态', description: '暂停或激活用户账户' })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateUserStatus(id, dto, adminId);
  }

  // ============================================================
  // AI Call Logs
  // ============================================================

  @Get('ai-logs')
  @ApiOperation({ summary: '获取AI调用日志', description: '分页获取AI调用日志，支持按代理类型、状态、用户和日期范围筛选' })
  async listAiLogs(@Query() query: QueryAiLogsDto) {
    return this.adminService.listAiLogs(query);
  }

  // ============================================================
  // Prompt Version Management
  // ============================================================

  @Get('prompts')
  @ApiOperation({ summary: '获取提示词版本列表', description: '分页获取提示词版本列表' })
  async listPrompts(@Query() query: QueryPromptsDto) {
    return this.adminService.listPrompts(query);
  }

  @Post('prompts')
  @ApiOperation({ summary: '创建提示词版本', description: '创建一个新的提示词版本（草稿状态）' })
  async createPrompt(
    @Body() dto: CreatePromptDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.createPrompt(dto, adminId);
  }

  @Patch('prompts/:id/status')
  @ApiOperation({ summary: '更新提示词状态', description: '激活或归档提示词版本（激活时会自动归档同类型的其他版本）' })
  async updatePromptStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePromptStatusDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updatePromptStatus(id, dto, adminId);
  }

  // ============================================================
  // Announcement Management
  // ============================================================

  @Get('announcements')
  @ApiOperation({ summary: '获取公告列表', description: '分页获取所有公告' })
  async listAnnouncements(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listAnnouncements(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Post('announcements')
  @ApiOperation({ summary: '创建公告', description: '创建一条新的系统公告' })
  async createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.createAnnouncement(dto, adminId);
  }

  @Patch('announcements/:id')
  @ApiOperation({ summary: '更新公告', description: '更新指定公告的内容或发布状态' })
  async updateAnnouncement(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.updateAnnouncement(id, dto, adminId);
  }

  // ============================================================
  // System Configuration
  // ============================================================

  @Get('system-configs')
  @ApiOperation({ summary: '获取系统配置', description: '获取所有系统配置项' })
  async listSystemConfigs() {
    return this.adminService.listSystemConfigs();
  }

  @Put('system-configs/:key')
  @ApiOperation({ summary: '更新系统配置', description: '更新或创建指定的系统配置项' })
  async updateSystemConfig(
    @Param('key') key: string,
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser('userId') adminId: string,
  ) {
    dto.key = key;
    return this.adminService.updateSystemConfig(dto, adminId);
  }

  // ============================================================
  // Audit Logs
  // ============================================================

  @Get('audit-logs')
  @ApiOperation({ summary: '获取审计日志', description: '分页获取审计日志，支持按操作类型、资源、用户和日期范围筛选' })
  async listAuditLogs(@Query() query: QueryAuditLogsDto) {
    return this.adminService.listAuditLogs(query);
  }
}
