# EchoLife · 启动操作文档

> **AI 数字生命操作系统** — 会保存家庭温度的数字伙伴
>
> 版本：v1.0.0 | 更新日期：2026-08-02

---

## 一、项目简介

EchoLife（岁言）是一款面向家庭的 AI 数字生命操作系统，核心理念是"会保存家庭温度的数字伙伴，而非 AI 工具"。项目融合了粒子神经元生命可视化、情感化 AI 对话、童忆引擎（家庭温暖记忆系统）、IoT 智能设备联动等能力。

### 核心功能

| 模块 | 说明 |
|------|------|
| 生命核粒子云 | 3D 粒子神经元树，复刻 Bilibili BV1ow4m1Y7qu 效果，支持拖拽旋转/缩放 |
| 时墨 AI 陪伴 | 6 维情感状态机（温暖/好奇/平静/喜悦/怀旧/关切），DeepSeek V4-Pro 深度思考模式 |
| 心情心电图 | V15 真随机动态心电图，余弦钟形 R 波 + 极端 HRV + 每拍形态变化 |
| 童忆引擎 | 5 大能力：记忆故事重构、家庭温暖瞬间、每日温暖提醒、记忆胶囊、情感叙事 |
| 家庭记忆图谱 | 所有数据进入 Family Memory Graph，连接人物/时间/地点/情绪 |
| IoT 智能设备 | 小米米家 + Apple HomeKit 统一接口，`/devices` 管理页面 |
| 微信 ClawBot | 通过 OpenClaw 网关连接微信家庭群，Agent 实时联动 |
| 截图能力 | Puppeteer + Chromium，网页截图 5 分钟缓存 |

### 技术栈

- **前端**: Next.js 15 + React 19 + TypeScript + Tailwind CSS + Framer Motion
- **后端**: NestJS + Prisma ORM + PostgreSQL (pgvector) + Redis
- **AI**: DeepSeek V4-Pro (reasoning_content 支持) + GLM-4-Plus 备选
- **可视化**: Canvas 2D 粒子系统 + Apple Liquid Glass 设计语言
- **部署**: Docker Compose + Nginx + GitHub Actions CI/CD
- **包管理**: pnpm workspace + Turborepo

---

## 二、环境要求

| 软件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | ≥ 20.0.0 | 推荐 LTS 版本 |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm@9.15.0` |
| Docker | ≥ 24.0 | 仅 Docker 部署需要 |
| Docker Compose | ≥ 2.20 | 仅 Docker 部署需要 |
| Git | ≥ 2.40 | 版本控制 |

---

## 三、快速启动（本地开发）

### 3.1 克隆 & 安装

```bash
# 1. 进入项目目录
cd echolife

# 2. 安装所有依赖
pnpm install

# 3. 生成 Prisma Client
pnpm db:generate
```

### 3.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，至少配置以下项：
```

**必填项：**

```env
# 数据库
DATABASE_URL=postgresql://echolife:echolife_pass@localhost:5432/echolife?schema=public
REDIS_URL=redis://localhost:6379

# JWT 密钥（可用以下命令生成）
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# 加密密钥（必须 64 位 hex）
ENCRYPTION_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2

# AI API Key（至少配置一个）
DEEPSEEK_API_KEY=your-deepseek-api-key

# 前端 API 地址
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### 3.3 启动数据库

**方式一：Docker 快速启动（推荐）**

```bash
docker run -d --name echolife-postgres \
  -e POSTGRES_USER=echolife \
  -e POSTGRES_PASSWORD=echolife_pass \
  -e POSTGRES_DB=echolife \
  -p 5432:5432 \
  pgvector/pgvector:pg16

docker run -d --name echolife-redis \
  -p 6379:6379 \
  redis:7-alpine
```

**方式二：本地已安装 PostgreSQL & Redis**

确保 PostgreSQL 运行在 5432 端口，Redis 运行在 6379 端口。

### 3.4 初始化数据库

```bash
# 执行数据库迁移
pnpm db:migrate

# 生成种子数据（管理员账号 + 演示数据）
pnpm db:seed
```

种子数据会创建：
- 管理员账号：`admin@echolife.ai`（密码见终端输出）
- 演示账号：`demo@echolife.ai`（密码见终端输出）
- 15 条家庭记忆、10 条温暖瞬间等演示数据

### 3.5 启动开发服务器

```bash
# 同时启动前端 (3000) 和后端 (3001)
pnpm dev
```

启动后访问：
- 前端：http://localhost:3000
- 后端 API：http://localhost:3001/api/v1/health
- API 文档：http://localhost:3001/api/v1

---

## 四、Docker 一键部署

### 4.1 准备环境变量

```bash
cp .env.example .env.production

# 编辑 .env.production，填入生产环境配置
# 特别注意配置 DEEPSEEK_API_KEY
```

### 4.2 启动所有服务

```bash
# 使用部署配置启动
docker compose -f docker-compose.deploy.yml --env-file .env.production up -d

# 查看服务状态
docker compose -f docker-compose.deploy.yml ps
```

### 4.3 服务架构

```
用户 → Nginx (:80/:443)
         ├── / → Next.js Web (:3000)
         └── /api/ → NestJS API (:3001)
                        ├── PostgreSQL (:5432)
                        └── Redis (:6379)
```

### 4.4 常用运维命令

```bash
# 查看日志
docker compose -f docker-compose.deploy.yml logs -f api
docker compose -f docker-compose.deploy.yml logs -f web

# 重启服务
docker compose -f docker-compose.deploy.yml restart api
docker compose -f docker-compose.deploy.yml restart web

# 更新部署
docker compose -f docker-compose.deploy.yml --env-file .env.production up -d --build

# 停止所有服务
docker compose -f docker-compose.deploy.yml down
```

---

## 五、生产环境部署（GitHub Actions CI/CD）

### 5.1 前置条件

- GitHub 仓库（已有：https://github.com/wwxfeel-wq/WXUN）
- 阿里云 ACR 镜像仓库
- 阿里云 ECS 服务器（IP: 47.103.20.211）

### 5.2 配置 GitHub Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置：

| Secret 名称 | 说明 |
|-------------|------|
| ACR_USERNAME | ACR 用户名 |
| ACR_PASSWORD | ACR 密码 |
| ACR_NAMESPACE | ACR 命名空间（unnamed） |
| SSH_HOST | 服务器 IP |
| SSH_USER | SSH 用户名（root） |
| SSH_PASSWORD | SSH 密码 |
| NEXT_PUBLIC_API_URL | 前端 API 地址 |
| DEEPSEEK_API_KEY | DeepSeek API Key |

### 5.3 自动部署流程

```
git push origin main
    ↓
GitHub Actions 触发
    ↓
构建 Docker 镜像 → 推送到阿里云 ACR
    ↓
SSH 连接服务器 → 拉取新镜像 → 重启容器
    ↓
部署完成（约 5-10 分钟）
```

### 5.4 服务器环境变量

服务器 `/www/wwwroot/echolife/.env.production` 需包含：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AI_ACTIVE_PROVIDER=deepseek
DEEPSEEK_API_URL=https://api.deepseek.com/v1
# ... 其余参考 .env.example
```

---

## 六、项目结构

```
echolife/
├── apps/
│   ├── api/                    # NestJS 后端
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 数据库 Schema
│   │   │   ├── migrations/     # 数据库迁移
│   │   │   └── seed.ts         # 种子数据
│   │   └── src/
│   │       ├── common/         # 公共模块（JWT、加密、拦截器）
│   │       └── modules/
│   │           ├── agent/      # Agent 运行时（情感引擎、习惯分析、工具注册）
│   │           ├── ai/         # AI 适配器（DeepSeek、GLM、截图）
│   │           ├── auth/       # 认证授权
│   │           ├── family/     # 家庭管理
│   │           ├── familyhub/  # 家庭中心（技能进化、垃圾过滤）
│   │           ├── iot/        # IoT 设备（米家、HomeKit）
│   │           ├── kindness/   # 童忆引擎
│   │           ├── memory/     # 记忆系统
│   │           └── wechat/     # 微信 ClawBot
│   │
│   └── web/                    # Next.js 前端
│       └── src/
│           ├── app/            # 页面路由（17 个页面）
│           ├── components/
│           │   ├── glass/      # 液态玻璃组件库
│           │   ├── home/       # 首页组件
│           │   ├── layout/     # 布局外壳
│           │   └── life-core/  # 生命核粒子云 + 心电图
│           └── stores/         # Zustand 状态管理
│
├── packages/
│   └── shared/                 # 共享类型和常量
│
├── infra/
│   ├── docker/                 # Dockerfile
│   └── nginx/                  # Nginx 配置
│
├── .github/workflows/          # CI/CD 流水线
├── docker-compose.yml          # 开发环境
├── docker-compose.deploy.yml   # 生产部署
└── package.json                # Monorepo 根配置
```

---

## 七、核心页面说明

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 空间化首页 | 粒子生命核 + 心情心电图 + 家庭入口 + AI 对话 |
| `/interview` | AI 陪伴 | 与时墨深度对话，支持思考模式 |
| `/center` | 数字生命中心 | 家庭记忆库，记忆图谱可视化 |
| `/kindness` | 童忆引擎 | 温暖瞬间、每日提醒、家庭故事 |
| `/family` | 家庭 | 成员管理、关系网络 |
| `/capsules` | 时间胶囊 | 写给未来的记忆胶囊 |
| `/devices` | 智能设备 | 米家/HomeKit 设备管理 |
| `/skills` | 能力 | 时墨掌握的能力和成长 |
| `/life-tree` | 生命树 | 粒子神经元树全屏交互 |
| `/knowledge` | 知识库 | 家庭知识管理 |
| `/wechat-bot` | 微信 Bot | 扫码连接微信家庭群 |
| `/admin` | 系统管理 | API Key、Agent 管理（管理员） |
| `/settings` | 设置 | 个人资料、偏好、安全 |

---

## 八、演示账号

| 角色 | 邮箱 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | admin@echolife.ai | ChangeMe@2026!FirstLogin | 可访问系统管理 |
| 演示用户 | demo@echolife.ai | Demo2026! | 含 15 条记忆 + 10 条温暖瞬间 |

> 体验地址：http://47.103.20.211（建议使用 Ctrl+Shift+F 强制刷新）

---

## 九、常见问题

### Q: 页面打开是白屏/旧版本？

**A:** 浏览器缓存问题。按 `Ctrl+Shift+F`（Mac: `Cmd+Shift+F`）强制刷新，或使用无痕窗口。

### Q: AI 聊天一直显示"加载中"？

**A:** 检查以下几点：
1. `.env.production` 中 `DEEPSEEK_API_KEY` 是否正确
2. 服务器上执行 `docker compose -f docker-compose.deploy.yml --env-file .env.production restart api`
3. 查看 API 日志：`docker compose -f docker-compose.deploy.yml logs api`

### Q: 心电图看起来不自然？

**A:** 心电图已迭代到 V15 版本，每次刷新页面随机序列不同。如果仍有问题，检查 `consciousness-panel.tsx` 中的 `buildBeatSchedule` 函数。

### Q: 微信 Bot 无法登录？

**A:** 微信 ClawBot 需要通过 OpenClaw 网关运行。确保：
1. OpenClaw 容器正常运行
2. 前端 `/wechat-bot` 页面扫码绑定
3. 使用旧微信号（2017 年前注册）成功率更高

### Q: 粒子动画卡顿？

**A:** 降低粒子数量。编辑 `life-core-canvas.tsx` 中的 `MAX_PARTICLES` 常量（默认 12000，可降到 5000）。

### Q: 数据库迁移失败？

**A:** 确保 PostgreSQL 安装了 pgvector 扩展：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 十、关键技术亮点

### 10.1 DeepSeek V4-Pro 思考模式

```typescript
// llm-adapter.service.ts
// 分离 reasoning_content 和 content，前端显示"深度思考"动画
yield { reasoning: chunk.reasoning_content, content: chunk.content };
```

### 10.2 童忆引擎

5 大核心能力均基于现有 Memory 系统，数据自动进入 Family Memory Graph：
- Memory Story Reconstruction
- Family Kindness Moments
- Daily Warm Reminder
- Memory Capsule
- SuiYan Emotional Narrative

### 10.3 心电图 V15

- 余弦钟形 R 波（不尖锐）
- 随机游走 HRV（R-R 间隔 0.4x-2.2x）
- 15% 概率快拍 + 12% 概率长停顿
- 每拍 PQRST 形态独立随机
- P 波 40% 概率消失

### 10.4 6 维情感状态机

温暖、好奇、平静、喜悦、怀旧、关切 — 带自然衰减和关键词触发，影响心电图心率和波形。

---

## 十一、开发指南

### 添加新 Agent

1. 在 `AGENT_DEFINITIONS` 中注册 Agent 定义
2. 在 `tool-registry/tools/` 下创建工具文件
3. 在 `McpToolRegistry` 中注册工具
4. 重启 API 服务，Agent 自动同步到数据库

### 添加新页面

1. 在 `apps/web/src/app/(app)/` 下创建路由目录
2. 创建 `page.tsx`
3. 页面自动获得 AppShell 布局（Dock 导航 + 液态玻璃背景）

### 修改粒子系统

编辑 `apps/web/src/components/life-core/life-core-canvas.tsx`：
- 粒子数量：调整 `MAX_PARTICLES`
- 粒子大小：调整 `baseSize`
- 颜色梯度：调整 `tempColor()` 函数
- 交互：调整 `pointer-events` 和事件处理

---

## 十二、联系方式

- GitHub: https://github.com/wwxfeel-wq/WXUN
- 线上地址: http://47.103.20.211

---

*EchoLife — 让 AI 拥有家庭的温度*
