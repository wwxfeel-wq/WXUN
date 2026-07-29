import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DemoService } from './services/demo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('一键演示')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('run')
  @ApiOperation({ summary: '一键演示 AI 全链路', description: '运行 AI 对话 → 向量化 → 总结 全流程，返回各步骤结果和耗时' })
  async runDemo(@CurrentUser('userId') _userId: string) {
    return this.demoService.runDemo();
  }
}
