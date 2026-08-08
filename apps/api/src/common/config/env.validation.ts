/**
 * H-043: 环境变量启动验证
 *
 * 在应用启动时验证必需的环境变量，如果缺失则立即退出并输出明确的错误信息。
 * 避免应用在缺少关键配置的情况下静默启动并产生难以排查的运行时错误。
 */

/** 生产环境必须的环境变量 */
const REQUIRED_ENV_VARS_PRODUCTION = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'REDIS_PASSWORD',
  'ENCRYPTION_KEY',
  // R3-BUG-027: OPENCLAW_WEBHOOK_SECRET is required for webhook authentication
  'OPENCLAW_WEBHOOK_SECRET',
] as const;

/** 开发环境必须的环境变量（较宽松） */
const REQUIRED_ENV_VARS_DEVELOPMENT = [
  'DATABASE_URL',
  'JWT_SECRET',
] as const;

/**
 * 验证必需的环境变量。
 *
 * 在生产环境中，所有 REQUIRED_ENV_VARS_PRODUCTION 列出的变量必须存在且非空。
 * 在开发环境中，仅验证 REQUIRED_ENV_VARS_DEVELOPMENT。
 *
 * 如果验证失败，输出错误信息并以 exit code 1 退出进程。
 */
export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const requiredVars = isProduction
    ? REQUIRED_ENV_VARS_PRODUCTION
    : REQUIRED_ENV_VARS_DEVELOPMENT;

  const missing: string[] = [];
  const empty: string[] = [];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (value === undefined) {
      missing.push(varName);
    } else if (value.trim() === '') {
      empty.push(varName);
    }
  }

  if (missing.length > 0 || empty.length > 0) {
    const messages: string[] = [];

    if (missing.length > 0) {
      messages.push(`Missing required environment variables: ${missing.join(', ')}`);
    }
    if (empty.length > 0) {
      messages.push(`Empty environment variables: ${empty.join(', ')}`);
    }

    // eslint-disable-next-line no-console
    console.error(
      `\n[H-043] Environment validation failed:\n${messages.map((m) => `  - ${m}`).join('\n')}\n`,
    );
    process.exit(1);
  }
}
