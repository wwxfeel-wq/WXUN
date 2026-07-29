import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersonalityService } from './personality.service';
import { GeneratePersonalityDto } from './dto/generate-personality.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('个性画像')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('personality')
export class PersonalityController {
  constructor(private readonly personalityService: PersonalityService) {}

  @Get()
  @ApiOperation({ summary: '获取当前个性画像', description: '获取用户最新的个性画像（大五人格）' })
  async getCurrentProfile(@CurrentUser('userId') userId: string) {
    return this.personalityService.getCurrentProfile(userId);
  }

  @Get('history')
  @ApiOperation({ summary: '获取个性历史', description: '获取用户个性画像的历史记录（快照）' })
  async getHistory(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.personalityService.getHistory(
      userId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('latest-snapshot')
  @ApiOperation({ summary: '获取最新快照', description: '获取用户最新的个性快照数据' })
  async getLatestSnapshot(@CurrentUser('userId') userId: string) {
    return this.personalityService.getLatestSnapshot(userId);
  }

  @Post('generate')
  @ApiOperation({
    summary: '生成个性画像',
    description: '基于最近的记忆数据，调用AI情感代理生成大五人格画像',
  })
  async generateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: GeneratePersonalityDto,
  ) {
    return this.personalityService.generateProfile(userId, dto);
  }
}
