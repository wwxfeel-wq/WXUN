import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyService, ApiKeyProvider } from './services/api-key.service';
import { SetApiKeyDto } from './dto/set-api-key.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class RotateKeyDto {
  @ApiProperty({ description: '新的加密密钥 (64 位 hex，32 字节)' })
  @IsString()
  @IsNotEmpty({ message: '新密钥不能为空' })
  @MinLength(64, { message: '密钥必须为 64 位 hex 字符' })
  @Matches(/^[0-9a-fA-F]{64}$/, { message: '密钥必须为 64 位 hex 字符' })
  newKey!: string;
}

const VALID_PROVIDERS: ApiKeyProvider[] = ['glm', 'deepseek', 'openai', 'qwen'];

@ApiTags('AI 接入配置')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Roles('super_admin', 'operator')
  @Get()
  @ApiOperation({ summary: '获取所有 API Key 配置状态', description: '需要管理员权限' })
  async getStatus() {
    return this.apiKeyService.getAllStatus();
  }

  @Roles('super_admin')
  @Put('active/:provider')
  @ApiOperation({ summary: '切换活跃 AI provider', description: '设置当前使用的 AI 服务提供商' })
  async setActiveProvider(
    @Param('provider') provider: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!VALID_PROVIDERS.includes(provider as ApiKeyProvider)) {
      return { success: false, message: `不支持的 provider: ${provider}` };
    }
    await this.apiKeyService.setActiveProvider(provider as ApiKeyProvider, userId);
    return { success: true, provider };
  }

  @Roles('super_admin')
  @Get('encryption/version')
  @ApiOperation({ summary: '获取当前加密密钥版本', description: '用于检测是否需要密钥轮换' })
  async getEncryptionVersion() {
    return { version: this.apiKeyService.getEncryptionKeyVersion() };
  }

  @Roles('super_admin')
  @Post('encryption/rotate')
  @ApiOperation({ summary: '轮换加密密钥', description: '用新密钥重新加密所有已存储的 API Key' })
  async rotateEncryptionKey(
    @Body() dto: RotateKeyDto,
    @CurrentUser('userId') userId: string,
  ) {
    const rotated = await this.apiKeyService.rotateEncryptionKey(dto.newKey, userId);
    return { success: true, rotated };
  }

  @Roles('super_admin')
  @Put(':provider')
  @ApiOperation({ summary: '设置 API Key', description: '用 AES-256-GCM 加密后存入数据库' })
  async setKey(
    @Param('provider') provider: string,
    @Body() dto: SetApiKeyDto,
    @CurrentUser('userId') userId: string,
  ) {
    if (!VALID_PROVIDERS.includes(provider as ApiKeyProvider)) {
      return { success: false, message: `不支持的 provider: ${provider}` };
    }
    await this.apiKeyService.setApiKey(provider as ApiKeyProvider, dto.apiKey, userId);
    return { success: true, provider };
  }

  @Roles('super_admin')
  @Delete(':provider')
  @ApiOperation({ summary: '删除 API Key' })
  async deleteKey(
    @Param('provider') provider: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.apiKeyService.deleteApiKey(provider as ApiKeyProvider, userId);
    return { success: true, provider };
  }

  @Roles('super_admin')
  @Post(':provider/test')
  @ApiOperation({ summary: '测试 API Key 连通性' })
  async testKey(@Param('provider') provider: string) {
    return this.apiKeyService.testConnection(provider as ApiKeyProvider);
  }
}
