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
import { CapsuleService } from './capsule.service';
import { CreateCapsuleDto } from './dto/create-capsule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('时间胶囊')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('capsules')
export class CapsuleController {
  constructor(private readonly capsuleService: CapsuleService) {}

  @Post()
  @ApiOperation({ summary: '创建时间胶囊', description: '创建一个封存到指定日期的时间胶囊' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateCapsuleDto) {
    return this.capsuleService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取时间胶囊列表', description: '分页获取当前用户的时间胶囊列表，支持按状态筛选' })
  async list(
    @CurrentUser('userId') userId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.capsuleService.list(userId, {
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '获取时间胶囊详情', description: '获取时间胶囊详情（未到开启时间的内容会被隐藏）' })
  async get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.capsuleService.get(userId, id);
  }

  @Post(':id/open')
  @ApiOperation({ summary: '开启时间胶囊', description: '开启已到期的时间胶囊，揭示其内容' })
  async open(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.capsuleService.open(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除时间胶囊', description: '永久删除一个时间胶囊' })
  async delete(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.capsuleService.delete(userId, id);
    return { success: true };
  }
}
