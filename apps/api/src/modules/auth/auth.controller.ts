import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('认证')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册', description: '使用邮箱、密码和昵称注册新账户' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '用户登录', description: '使用邮箱和密码登录，返回访问令牌和刷新令牌' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '刷新令牌', description: '使用刷新令牌获取新的访问令牌和刷新令牌' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: '退出登录', description: '撤销刷新令牌，退出当前会话' })
  async logout(
    @CurrentUser('userId') userId: string,
    @Body() body?: { refreshToken?: string },
  ) {
    await this.authService.logout(userId, body?.refreshToken);
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息', description: '获取已登录用户的详细信息' })
  async me(@CurrentUser('userId') userId: string) {
    return this.authService.getCurrentUser(userId);
  }
}
