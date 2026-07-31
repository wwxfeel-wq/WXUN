import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';

/** Supported AI providers */
export type ApiKeyProvider = 'glm' | 'deepseek' | 'openai' | 'qwen';

/** Provider configuration */
export interface ProviderConfig {
  id: ApiKeyProvider;
  label: string;
  apiUrl: string;
  chatModel: string;
  testModel: string;
  embeddingModel: string | null;
  envKey: string;
  placeholder: string;
  supportsEmbedding: boolean;
}

const CONFIG_KEY_PREFIX = 'ai_api_key_';
const ACTIVE_PROVIDER_KEY = 'ai_active_provider';

const PROVIDER_CONFIGS: Record<ApiKeyProvider, ProviderConfig> = {
  glm: {
    id: 'glm',
    label: '智谱 GLM',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatModel: 'glm-4-plus',
    testModel: 'glm-4-flash',
    embeddingModel: 'embedding-3',
    envKey: 'GLM_API_KEY',
    placeholder: 'your-glm-api-key',
    supportsEmbedding: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-v4-pro',
    testModel: 'deepseek-v4-flash',
    embeddingModel: null,
    envKey: 'DEEPSEEK_API_KEY',
    placeholder: 'your-deepseek-api-key',
    supportsEmbedding: false,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o',
    testModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    envKey: 'OPENAI_API_KEY',
    placeholder: 'your-openai-api-key',
    supportsEmbedding: true,
  },
  qwen: {
    id: 'qwen',
    label: '通义千问 Qwen',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModel: 'qwen-plus',
    testModel: 'qwen-turbo',
    embeddingModel: 'text-embedding-v2',
    envKey: 'QWEN_API_KEY',
    placeholder: 'your-qwen-api-key',
    supportsEmbedding: true,
  },
};

const ALL_PROVIDERS = Object.keys(PROVIDER_CONFIGS) as ApiKeyProvider[];

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private cache: Partial<Record<ApiKeyProvider, string>> = {};
  private cacheTs: Partial<Record<ApiKeyProvider, number>> = {};
  private readonly cacheTtlMs = 10_000;
  private activeProviderCache: ApiKeyProvider | null = null;
  private activeProviderTs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionUtil,
    private readonly configService: ConfigService,
  ) {}

  /** Get the provider config for a given provider, with env overrides. */
  getProviderConfig(provider: ApiKeyProvider): ProviderConfig {
    const base = PROVIDER_CONFIGS[provider];
    // Allow env variable to override the hardcoded API URL
    const envUrlKey = `${provider.toUpperCase()}_API_URL`;
    const envUrl = this.configService.get<string>(envUrlKey);
    if (envUrl) {
      return { ...base, apiUrl: envUrl };
    }
    return base;
  }

  /** Get all provider configs. */
  getAllProviderConfigs(): ProviderConfig[] {
    return ALL_PROVIDERS.map((p) => PROVIDER_CONFIGS[p]);
  }

  /** Resolve the active provider: env > DB > first configured > 'glm' fallback. */
  async getActiveProvider(): Promise<ApiKeyProvider> {
    const now = Date.now();
    if (this.activeProviderCache && now - this.activeProviderTs < this.cacheTtlMs) {
      return this.activeProviderCache;
    }

    // 1. env override (highest priority — ensures .env.production takes effect)
    const envProvider = this.configService.get<string>('AI_ACTIVE_PROVIDER');
    if (envProvider && ALL_PROVIDERS.includes(envProvider as ApiKeyProvider)) {
      const p = envProvider as ApiKeyProvider;
      const key = await this.getApiKey(p);
      if (key) {
        this.activeProviderCache = p;
        this.activeProviderTs = now;
        return p;
      }
      this.logger.warn(`AI_ACTIVE_PROVIDER=${envProvider} but no API key found, falling through`);
    }

    // 2. check DB
    try {
      const row = await this.prisma.systemConfig.findUnique({
        where: { key: ACTIVE_PROVIDER_KEY },
      });
      if (row?.value && ALL_PROVIDERS.includes(row.value as ApiKeyProvider)) {
        const p = row.value as ApiKeyProvider;
        // Verify the DB-selected provider actually has a key
        const key = await this.getApiKey(p);
        if (key) {
          this.activeProviderCache = p;
          this.activeProviderTs = now;
          return p;
        }
        this.logger.warn(`DB active provider '${p}' has no API key, falling through to first configured`);
      }
    } catch {
      // ignore
    }

    // 3. fallback to first configured provider (has a valid key)
    for (const p of ALL_PROVIDERS) {
      const key = await this.getApiKey(p);
      if (key) {
        this.activeProviderCache = p;
        this.activeProviderTs = now;
        return p;
      }
    }

    // 4. default
    return 'glm';
  }

  /** Set the active provider. */
  async setActiveProvider(provider: ApiKeyProvider, actionBy: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key: ACTIVE_PROVIDER_KEY },
      update: { value: provider, type: 'string', description: '当前活跃 AI provider' },
      create: { key: ACTIVE_PROVIDER_KEY, value: provider, type: 'string', description: '当前活跃 AI provider' },
    });
    this.activeProviderCache = provider;
    this.activeProviderTs = Date.now();

    try {
      await this.prisma.auditLog.create({
        data: { actionBy, action: 'switch_ai_provider', resource: 'api_keys', resourceId: provider, details: { provider } },
      });
    } catch {
      // non-critical
    }
    this.logger.log(`Active provider switched to ${provider} by ${actionBy}`);
  }

  /** Resolve the plaintext API key for a provider. Priority: DB > env. */
  async getApiKey(provider: ApiKeyProvider = 'glm'): Promise<string> {
    const now = Date.now();
    if (this.cache[provider] && now - (this.cacheTs[provider] ?? 0) < this.cacheTtlMs) {
      return this.cache[provider] as string;
    }

    const cfg = PROVIDER_CONFIGS[provider];

    // 1. try encrypted DB record
    try {
      const row = await this.prisma.systemConfig.findUnique({
        where: { key: `${CONFIG_KEY_PREFIX}${provider}` },
      });
      if (row?.value) {
        const plaintext = this.encryption.decrypt(row.value);
        this.cache[provider] = plaintext;
        this.cacheTs[provider] = now;
        return plaintext;
      }
    } catch (e) {
      this.logger.warn(`Failed to read API key for ${provider} from DB: ${(e as Error).message}`);
    }

    // 2. fallback to env
    const envKey = this.configService.get<string>(cfg.envKey) ?? '';
    if (envKey && envKey !== cfg.placeholder) {
      this.cache[provider] = envKey;
      this.cacheTs[provider] = now;
      return envKey;
    }
    return '';
  }

  /** Encrypt and persist the API key. */
  async setApiKey(provider: ApiKeyProvider, plaintext: string, actionBy: string): Promise<void> {
    const encrypted = this.encryption.encrypt(plaintext);
    const key = `${CONFIG_KEY_PREFIX}${provider}`;
    const cfg = PROVIDER_CONFIGS[provider];

    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value: encrypted, type: 'secret', description: `${cfg.label} API Key (AES-256-GCM 加密)` },
      create: { key, value: encrypted, type: 'secret', description: `${cfg.label} API Key (AES-256-GCM 加密)` },
    });

    // Cache the plaintext briefly (TTL-based, cleared on delete/rotate)
    this.cache[provider] = plaintext;
    this.cacheTs[provider] = Date.now();

    try {
      await this.prisma.auditLog.create({
        data: {
          actionBy,
          action: 'set_api_key',
          resource: 'api_keys',
          resourceId: provider,
          details: { provider, masked: this.encryption.maskSecret(plaintext) },
        },
      });
    } catch {
      // non-critical
    }
    // Log with masked key, never the plaintext
    this.logger.log(`API key for ${provider} updated by ${actionBy} (${this.encryption.maskSecret(plaintext)})`);
  }

  /** Remove the API key. */
  async deleteApiKey(provider: ApiKeyProvider, actionBy: string): Promise<void> {
    const key = `${CONFIG_KEY_PREFIX}${provider}`;
    await this.prisma.systemConfig.deleteMany({ where: { key } });

    // Securely clear the in-memory cache
    this.cache[provider] = '';
    delete this.cache[provider];
    delete this.cacheTs[provider];

    try {
      await this.prisma.auditLog.create({
        data: { actionBy, action: 'delete_api_key', resource: 'api_keys', resourceId: provider, details: { provider } },
      });
    } catch {
      // non-critical
    }
    this.logger.log(`API key for ${provider} deleted by ${actionBy}`);
  }

  /**
   * Rotate the encryption key for all stored API keys.
   * Re-encrypts all existing API keys with a new key.
   *
   * @param newKeyHex - New 64-char hex key
   * @param actionBy - User performing the rotation
   * @returns Number of keys re-encrypted
   */
  async rotateEncryptionKey(newKeyHex: string, actionBy: string): Promise<number> {
    let rotated = 0;

    for (const provider of ALL_PROVIDERS) {
      const key = `${CONFIG_KEY_PREFIX}${provider}`;
      try {
        const row = await this.prisma.systemConfig.findUnique({ where: { key } });
        if (row?.value) {
          // Re-encrypt with new key
          const reEncrypted = this.encryption.rotateKey(row.value, newKeyHex);
          await this.prisma.systemConfig.update({
            where: { key },
            data: { value: reEncrypted },
          });
          rotated++;
        }
      } catch (e) {
        this.logger.error(`Failed to rotate key for ${provider}: ${(e as Error).message}`);
      }
    }

    // Clear all cached plaintext keys
    for (const p of ALL_PROVIDERS) {
      this.cache[p] = '';
      delete this.cache[p];
      delete this.cacheTs[p];
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          actionBy,
          action: 'rotate_encryption_key',
          resource: 'api_keys',
          resourceId: 'all',
          details: { rotatedCount: rotated },
        },
      });
    } catch {
      // non-critical
    }

    this.logger.log(`Encryption key rotation completed by ${actionBy}: ${rotated} keys re-encrypted`);
    return rotated;
  }

  /**
   * Get the current encryption key version.
   * Useful for health checks and detecting if a rotation is needed.
   */
  getEncryptionKeyVersion(): number {
    return this.encryption.getKeyVersion();
  }

  /**
   * Clear all cached API keys (for security on logout / session end).
   */
  clearCache(): void {
    for (const p of ALL_PROVIDERS) {
      this.cache[p] = '';
      delete this.cache[p];
      delete this.cacheTs[p];
    }
    this.activeProviderCache = null;
    this.activeProviderTs = 0;
    this.logger.debug('API key cache cleared');
  }

  /** Status for a single provider. */
  async getStatus(provider: ApiKeyProvider): Promise<{
    provider: ApiKeyProvider;
    label: string;
    configured: boolean;
    source: 'database' | 'env' | 'none';
    masked: string;
    supportsEmbedding: boolean;
  }> {
    const cfg = PROVIDER_CONFIGS[provider];
    let source: 'database' | 'env' | 'none' = 'none';
    let plaintext = '';

    try {
      const row = await this.prisma.systemConfig.findUnique({
        where: { key: `${CONFIG_KEY_PREFIX}${provider}` },
      });
      if (row?.value) {
        plaintext = this.encryption.decrypt(row.value);
        source = 'database';
      }
    } catch {
      // ignore
    }

    if (!plaintext) {
      const envKey = this.configService.get<string>(cfg.envKey) ?? '';
      if (envKey && envKey !== cfg.placeholder) {
        plaintext = envKey;
        source = 'env';
      }
    }

    return {
      provider,
      label: cfg.label,
      configured: plaintext.length > 0,
      source,
      masked: plaintext ? this.mask(plaintext) : '',
      supportsEmbedding: cfg.supportsEmbedding,
    };
  }

  /** Status for all providers + the active one. */
  async getAllStatus(): Promise<{
    providers: Array<Awaited<ReturnType<ApiKeyService['getStatus']>>>;
    activeProvider: ApiKeyProvider;
  }> {
    const providers = await Promise.all(ALL_PROVIDERS.map((p) => this.getStatus(p)));
    const activeProvider = await this.getActiveProvider();
    return { providers, activeProvider };
  }

  /** Test connectivity. */
  async testConnection(provider: ApiKeyProvider = 'glm'): Promise<{
    provider: ApiKeyProvider;
    success: boolean;
    latencyMs: number;
    message: string;
  }> {
    const key = await this.getApiKey(provider);
    if (!key) {
      return { provider, success: false, latencyMs: 0, message: '未配置 API Key' };
    }

    const cfg = PROVIDER_CONFIGS[provider];
    const start = Date.now();
    try {
      const res = await fetch(`${cfg.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: cfg.testModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        return { provider, success: true, latencyMs, message: '连接成功' };
      }
      const text = await res.text();
      const msg = res.status === 401 || res.status === 403
        ? `Key 无效或无权限 (${res.status})`
        : `接口返回 ${res.status}: ${text.slice(0, 120)}`;
      return { provider, success: false, latencyMs, message: msg };
    } catch (e) {
      return { provider, success: false, latencyMs: Date.now() - start, message: `请求失败: ${(e as Error).message}` };
    }
  }

  private mask(key: string): string {
    return this.encryption.maskSecret(key);
  }
}
