import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('用户')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户资料', description: '获取已登录用户的完整资料信息' })
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.userService.getProfile(userId);
  }

  @Put('me')
  @ApiOperation({ summary: '更新当前用户资料', description: '更新已登录用户的个人资料' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('me/settings')
  @ApiOperation({ summary: '获取用户设置', description: '获取已登录用户的应用设置' })
  async getSettings(@CurrentUser('userId') userId: string) {
    return this.userService.getSettings(userId);
  }

  @Put('me/settings')
  @ApiOperation({ summary: '更新用户设置', description: '更新已登录用户的应用设置' })
  async updateSettings(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.userService.updateSettings(userId, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: '删除账户', description: '软删除当前用户账户，撤销所有会话' })
  async deleteAccount(@CurrentUser('userId') userId: string) {
    await this.userService.deleteAccount(userId);
    return { success: true };
  }
}
