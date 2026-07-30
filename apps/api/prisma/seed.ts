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

  // ===== Create demo regular user =====
  // 默认只在非生产环境创建；生产环境需显式设置 SEED_DEMO_DATA=true 才会铺体验数据，
  // 避免线上意外出现测试账号。
  const seedDemo =
    process.env.SEED_DEMO_DATA === 'true' || process.env.NODE_ENV !== 'production';
  if (seedDemo) {
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

    // 给体验账号铺一层默认家庭数据，避免首次登录看到空白界面
    await seedDemoExperience(demoUser.id);
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

/**
 * 为体验账号铺默认数据。
 *
 * 空账号登录后首页所有卡片都是 0，粒子云也没有节点可以绑定，
 * 体验感很差。这里补一套「三口之家」的最小可信数据集：
 * 家庭 → 记忆 → 生命树 → 人格画像 → 时间胶囊。
 *
 * 全部走「先查后写」，重复执行不会产生脏数据。
 */
async function seedDemoExperience(userId: string) {
  // ===== 家庭 =====
  let family = await prisma.family.findFirst({ where: { creatorId: userId } });
  if (!family) {
    family = await prisma.family.create({
      data: {
        name: '示例之家',
        description: '一个用来体验岁言的三口之家',
        creatorId: userId,
      },
    });
  }

  await prisma.familyMember.upsert({
    where: { familyId_userId: { familyId: family.id, userId } },
    update: {},
    create: {
      familyId: family.id,
      userId,
      role: 'owner',
      wechatNickname: '体验用户',
    },
  });

  // ===== 记忆 =====
  const demoMemories = [
    {
      title: '第一次带孩子看海',
      content:
        '周末带小满去了北戴河。他站在浅水里不肯走，说想把海带回家。回程车上睡着了，手里还攥着一枚贝壳。',
      type: 'story',
      emotion: 'joy',
      emotionScore: 0.86,
      importance: 0.9,
      occurredAt: new Date('2024-07-13'),
      memoryLayer: 'episodic',
    },
    {
      title: '妈妈的红烧肉配方',
      content:
        '妈妈终于把红烧肉的做法讲清楚了：冰糖先炒到琥珀色，肉要焯水两遍，最后一定要收汁到挂勺。她说这是外婆教她的。',
      type: 'knowledge',
      emotion: 'warmth',
      emotionScore: 0.78,
      importance: 0.85,
      occurredAt: new Date('2024-03-02'),
      memoryLayer: 'semantic',
    },
    {
      title: '爸爸退休那天',
      content:
        '爸爸把工牌摘下来放进抽屉，很平静地说"该歇歇了"。晚上他一个人在阳台待了很久。我们决定每周固定回家吃一次饭。',
      type: 'story',
      emotion: 'bittersweet',
      emotionScore: 0.42,
      importance: 0.88,
      occurredAt: new Date('2024-05-20'),
      memoryLayer: 'episodic',
    },
    {
      title: '家里的三条约定',
      content:
        '一、晚饭时不看手机。二、吵架不过夜。三、每年至少一次全家旅行。写在冰箱贴上，谁都不许撕。',
      type: 'value',
      emotion: 'calm',
      emotionScore: 0.7,
      importance: 0.95,
      occurredAt: new Date('2023-12-31'),
      memoryLayer: 'semantic',
    },
    {
      title: '小满第一次自己骑车',
      content:
        '扶了三次，第四次松手他就骑走了，还回头喊"别追我"。那一刻突然意识到他真的在长大。',
      type: 'story',
      emotion: 'pride',
      emotionScore: 0.82,
      importance: 0.8,
      occurredAt: new Date('2024-09-08'),
      memoryLayer: 'episodic',
    },
  ];

  const existingMemoryCount = await prisma.memory.count({ where: { userId } });
  if (existingMemoryCount === 0) {
    for (const m of demoMemories) {
      await prisma.memory.create({
        data: {
          userId,
          ...m,
          visibility: 'family',
          sourceType: 'chat',
        },
      });
    }
    console.log(`Seeded ${demoMemories.length} demo memories`);
  }

  // ===== 生命树 =====
  const existingNodes = await prisma.lifeTreeNode.count({ where: { userId } });
  if (existingNodes === 0) {
    const branches = [
      { title: '家庭', description: '家人、关系与共同经历', memoryCount: 3 },
      { title: '成长', description: '孩子的每一个第一次', memoryCount: 2 },
      { title: '传承', description: '手艺、配方与家规', memoryCount: 2 },
    ];
    for (const b of branches) {
      await prisma.lifeTreeNode.create({
        data: { userId, type: 'category', ...b },
      });
    }
    console.log(`Seeded ${branches.length} life tree branches`);
  }

  // ===== 人格画像 =====
  const existingProfile = await prisma.personalityProfile.findFirst({ where: { userId } });
  if (!existingProfile) {
    await prisma.personalityProfile.create({
      data: {
        userId,
        openness: 0.72,
        conscientiousness: 0.68,
        extraversion: 0.55,
        agreeableness: 0.81,
        neuroticism: 0.34,
        analysis:
          '从已记录的家庭故事看，你重视亲密关系的稳定性，愿意为家人调整自己的节奏；对新体验保持开放，但更偏好有安全感的探索方式。',
      },
    });
    console.log('Seeded demo personality profile');
  }

  // ===== 时间胶囊 =====
  const existingCapsules = await prisma.timeCapsule.count({ where: { userId } });
  if (existingCapsules === 0) {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const tenYears = new Date();
    tenYears.setFullYear(tenYears.getFullYear() + 10);

    await prisma.timeCapsule.createMany({
      data: [
        {
          userId,
          title: '写给一年后的自己',
          content: '希望那三条约定还贴在冰箱上。如果撕了，记得贴回去。',
          type: 'personal',
          openAt: nextYear,
        },
        {
          userId,
          title: '给十八岁的小满',
          content:
            '你六岁那年在北戴河说想把海带回家。现在你应该知道了，带不回来的东西可以记住。',
          type: 'family',
          openAt: tenYears,
        },
      ],
    });
    console.log('Seeded 2 demo time capsules');
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
