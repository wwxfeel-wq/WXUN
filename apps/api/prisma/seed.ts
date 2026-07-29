import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // ===== Create Roles =====
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'super_admin' },
      update: {},
      create: { name: 'super_admin', description: '超级管理员 - 拥有所有权限' },
    }),
    prisma.role.upsert({
      where: { name: 'operator' },
      update: {},
      create: { name: 'operator', description: '运营人员 - 管理用户和内容' },
    }),
    prisma.role.upsert({
      where: { name: 'support' },
      update: {},
      create: { name: 'support', description: '客服人员 - 处理用户问题' },
    }),
    prisma.role.upsert({
      where: { name: 'finance' },
      update: {},
      create: { name: 'finance', description: '财务人员 - 管理订阅和支付' },
    }),
    prisma.role.upsert({
      where: { name: 'auditor' },
      update: {},
      create: { name: 'auditor', description: '审计人员 - 查看审计日志' },
    }),
    prisma.role.upsert({
      where: { name: 'user' },
      update: {},
      create: { name: 'user', description: '普通用户' },
    }),
  ]);
  console.log(`Created ${roles.length} roles`);

  // ===== Create Permissions =====
  const permissionDefinitions = [
    { name: 'user:read', resource: 'user', action: 'read' },
    { name: 'user:write', resource: 'user', action: 'write' },
    { name: 'user:delete', resource: 'user', action: 'delete' },
    { name: 'memory:read', resource: 'memory', action: 'read' },
    { name: 'memory:write', resource: 'memory', action: 'write' },
    { name: 'memory:delete', resource: 'memory', action: 'delete' },
    { name: 'admin:access', resource: 'admin', action: 'access' },
    { name: 'prompt:manage', resource: 'prompt', action: 'manage' },
    { name: 'system:config', resource: 'system', action: 'config' },
    { name: 'audit:read', resource: 'audit', action: 'read' },
    { name: 'announcement:manage', resource: 'announcement', action: 'manage' },
  ];

  const permissions = await Promise.all(
    permissionDefinitions.map((p) =>
      prisma.permission.upsert({
        where: { name: p.name },
        update: {},
        create: p,
      }),
    ),
  );
  console.log(`Created ${permissions.length} permissions`);

  // ===== Assign all permissions to super_admin =====
  const superAdminRole = roles[0];
  await Promise.all(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: superAdminRole.id, permissionId: p.id },
        },
        update: {},
        create: { roleId: superAdminRole.id, permissionId: p.id },
      }),
    ),
  );
  console.log('Assigned all permissions to super_admin');

  // ===== Assign operator permissions =====
  const operatorRole = roles[1];
  const operatorPermissions = permissions.filter((p) =>
    ['user:read', 'user:write', 'memory:read', 'memory:write', 'admin:access', 'announcement:manage'].includes(p.name),
  );
  await Promise.all(
    operatorPermissions.map((p) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: operatorRole.id, permissionId: p.id },
        },
        update: {},
        create: { roleId: operatorRole.id, permissionId: p.id },
      }),
    ),
  );
  console.log('Assigned permissions to operator');

  // ===== Create admin user (password from env or auto-generated) =====
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@echolife.ai';
  const adminPasswordRaw = process.env.SEED_ADMIN_PASSWORD || generateSecurePassword();
  const adminPassword = await bcrypt.hash(adminPasswordRaw, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminPassword,
      status: 'active',
      emailVerified: true,
      profile: {
        create: {
          nickname: '系统管理员',
          bio: 'EchoLife 系统管理员',
        },
      },
      settings: {
        create: {},
      },
      subscription: {
        create: {
          tier: 'lifetime',
          status: 'active',
        },
      },
      userRoles: {
        create: {
          roleId: superAdminRole.id,
        },
      },
    },
  });
  console.log(`Created admin user: ${adminUser.email}`);

  // ===== Create demo regular user (only in non-production) =====
  if (process.env.NODE_ENV !== 'production') {
    const userEmail = process.env.SEED_USER_EMAIL || 'demo@echolife.ai';
    const userPasswordRaw = process.env.SEED_USER_PASSWORD || generateSecurePassword();
    const userPassword = await bcrypt.hash(userPasswordRaw, 12);
    const userRole = roles[5];

    const demoUser = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: {
        email: userEmail,
        passwordHash: userPassword,
        status: 'active',
        emailVerified: true,
        profile: {
          create: {
            nickname: '体验用户',
            bio: '探索数字生命的奥秘',
            birthDate: new Date('1990-01-01'),
            gender: 'male',
            location: '北京',
            occupation: '产品经理',
          },
        },
        settings: {
          create: {
            theme: 'dark',
            language: 'zh-CN',
          },
        },
        subscription: {
          create: {
            tier: 'pro',
            status: 'active',
          },
        },
        userRoles: {
          create: {
            roleId: userRole.id,
          },
        },
      },
    });
    console.log(`Created demo user: ${demoUser.email}`);
  }

  // ===== Create system configs =====
  const systemConfigs = [
    { key: 'maintenance_mode', value: 'false', type: 'boolean', description: '系统维护模式' },
    { key: 'max_upload_size', value: '10485760', type: 'number', description: '最大上传文件大小(字节)' },
    { key: 'ai_model_default', value: 'glm-4-plus', type: 'string', description: '默认 AI 模型' },
    { key: 'embedding_model', value: 'embedding-3', type: 'string', description: '向量嵌入模型' },
    { key: 'rate_limit_per_minute', value: '100', type: 'number', description: '每分钟请求限制' },
  ];

  await Promise.all(
    systemConfigs.map((c) =>
      prisma.systemConfig.upsert({
        where: { key: c.key },
        update: {},
        create: c,
      }),
    ),
  );
  console.log(`Created ${systemConfigs.length} system configs`);

  // ===== Create default agent configs =====
  const agentConfigs = [
    { agentType: 'life_coach', model: 'glm-4-plus', temperature: 0.3, maxTokens: 2048 },
    { agentType: 'story_agent', model: 'glm-4-plus', temperature: 0.8, maxTokens: 4096 },
    { agentType: 'memory_agent', model: 'glm-4-plus', temperature: 0.2, maxTokens: 4096 },
    { agentType: 'emotion_agent', model: 'glm-4-plus', temperature: 0.5, maxTokens: 2048 },
    { agentType: 'knowledge_agent', model: 'glm-4-plus', temperature: 0.2, maxTokens: 2048 },
    { agentType: 'summary_agent', model: 'glm-4-plus', temperature: 0.6, maxTokens: 4096 },
    { agentType: 'relationship_agent', model: 'glm-4-plus', temperature: 0.4, maxTokens: 2048 },
  ];

  await Promise.all(
    agentConfigs.map((c) =>
      prisma.agentConfig.upsert({
        where: { agentType: c.agentType },
        update: {},
        create: c,
      }),
    ),
  );
  console.log(`Created ${agentConfigs.length} agent configs`);

  // ===== Create welcome announcement =====
  await prisma.announcement.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      title: '欢迎来到 EchoLife 人生回响',
      content: 'EchoLife 是全球首个 AI 数字生命操作系统。通过持续学习您的人生经历、价值观、性格和家庭关系，形成可持续成长的数字生命。开始您的第一次 AI 访谈，让记忆成为永恒。',
      type: 'info',
      isPublished: true,
      publishedAt: new Date(),
    },
  });
  console.log('Created welcome announcement');

  console.log('\nDatabase seed completed successfully!');
  // Only print credentials if password came from env (not auto-generated)
  if (process.env.SEED_ADMIN_PASSWORD) {
    console.log(`\nAdmin account: ${adminEmail}`);
  } else {
    console.log(`\nAdmin account: ${adminEmail}`);
    console.log(`Admin password (auto-generated): ${adminPasswordRaw}`);
    console.log('⚠️  Please change this password immediately after first login!');
  }
}

function generateSecurePassword(): string {
  const crypto = require('crypto');
  const length = 20;
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
