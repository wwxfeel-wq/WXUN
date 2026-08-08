# EchoLife 全量 BUG 修复 + 5 轮复审 + 部署计划

## 一、当前状态总览

### 1.1 原始 123 项 BUG 修复进度

| 批次 | 已完成 | 部分完成 | 未完成 | 小计 |
|------|--------|---------|--------|------|
| Critical 安全 (C-001~C-006) | 5 | 1 (C-002 SSL) | 0 | 6 |
| Critical BUG (C-007~C-016) | 9 | 1 (C-008 SSE Token) | 0 | 10 |
| High 安全 (H-001~H-015) | 8 | 3 (H-006/007/037) | 4 | 15 |
| High 前端 (H-016~H-045) | 11 | 0 | 8 | 19 |
| Medium (M-001~M-048) | 0 | 0 | 48 | 48 |
| Low (L-001~L-014) | 0 | 0 | 14 | 14 |
| 基础设施 | 4 | 3 | 0 | 7 |
| **合计** | **37** | **8** | **70** | **123** (去重) |

### 1.2 5 轮复审进度

| 轮次 | 审查重点 | 状态 | 结果 |
|------|---------|------|------|
| Round 1 | 后端安全 | ✅ 完成 | **FAIL** — 7 Bug (1C/2H/4M) |
| Round 2 | 前端核心逻辑 | ✅ 完成 | **FAIL** — 8 Bug (1C/1H/3M/3L) |
| Round 3 | SSE/实时通信 | ✅ 完成 | **FAIL** — 9 Bug (0C/1H/4M/4L) |
| Round 4 | IoT/Agent 模块 | ⏳ 待启动 | — |
| Round 5 | 全栈集成 | ⏳ 待启动 | — |

### 1.3 复审新发现 BUG 汇总（截至 Round 3）

#### Round 1 — 后端安全（7 项）

| 编号 | 级别 | 文件 | 问题 |
|------|------|------|------|
| R1-001 | **Critical** | `api-key.service.ts` + `encryption.util.ts` | 加密密钥轮换后 `this.key`（readonly）未更新，所有 DB API Key 解密失败 |
| R1-002 | **High** | `admin.service.ts` + `admin.controller.ts` | `listSystemConfigs` 返回加密 Key 给 operator；`updateSystemConfig` 允许 operator 覆盖 `ai_api_key_*` |
| R1-003 | **High** | `wechat.controller.ts` | 所有 WeChat 端点无 RBAC，任何已认证用户可读取他人聊天记录 |
| R1-004 | Medium | `llm-adapter.service.ts:427` | debug 日志输出 API Key 前 8 位 + 后 4 位 |
| R1-005 | Medium | `api-key.controller.ts:93-109` | `deleteKey`/`testKey` 缺少 provider 参数校验 |
| R1-006 | Medium | `encryption.util.ts:175` | `rotateKey` 中 `plaintext;` 空操作，未清零明文 |
| R1-007 | Medium | `api-key.service.ts:334` | `clearCache()` 从未被调用 |

#### Round 2 — 前端核心逻辑（8 项）

| 编号 | 级别 | 文件 | 问题 |
|------|------|------|------|
| R2-001 | **Critical** | `use-sse-chat.ts:49` | `initialMessages = []` 默认参数导致无限重渲染循环，首页崩溃 |
| R2-002 | **High** | `api-client.ts:374-382` | SSE 401 未调用 `handleUnauthorized()`，token 不清除 |
| R2-003 | Medium | `api-client.ts:711-717` | `createGETSSEStream` 重连时错误调用 `onClose` 阻止重连 |
| R2-004 | Medium | `interview/page.tsx:157-169` | 持久化 `streaming: true` 消息到 localStorage |
| R2-005 | Medium | `api-client.ts:179-203` | 401 拦截器对登录端点产生错误行为，丢弃后端错误消息 |
| R2-006 | Low | `spatial-home.tsx:81-91` | `sending` 状态同步设置无效 |
| R2-007 | Low | `auth-store.ts:122-133` | `initAuth` 未在无 token 时清除过期认证状态 |
| R2-008 | Low | `use-sse-chat.ts:90-98` | `upsertMessage` 死代码 |

#### Round 3 — SSE/实时通信（9 项）

| 编号 | 级别 | 文件 | 问题 |
|------|------|------|------|
| R3-001 | **High** | `api-client.ts:711-717` | `createGETSSEStream` 重连时过早调用 `onClose`，破坏重连逻辑 |
| R3-002 | Medium | `api-client.ts:374-382` | `createSSEStream` 401 未调用 `handleUnauthorized()`（与 R2-002 重复） |
| R3-003 | Medium | `api-client.ts:714` | 重连无指数退避和最大重试限制 |
| R3-004 | Medium | `api-client.ts:663/673/710/716` | `createGETSSEStream` 缺少 `safeClose` 防重入保护 |
| R3-005 | Medium | `openclaw.provider.ts:558-565` + `use-sse-chat.ts:164-220` | 后端错误后继续发送事件，前端回调重置 `streaming: true` |
| R3-006 | Low | `api-client.ts:338` | `createSSEStream` 初始 fetch 连接无超时保护 |
| R3-007 | Low | `api-client.ts:533` | `parseSSEEvent` 多行 `data:` 拼接未加 `\n` 分隔 |
| R3-008 | Low | `openclaw.provider.ts` 多处 | 全局超时 signal 未传播到 DB/planning/tool 等操作 |
| R3-009 | Low | `ai.controller.ts:62/110` | 使用 `type: 'error' as never` 绕过类型检查 |

---

## 二、执行计划

### 阶段 1: 完成剩余复审（Round 4-5）

> Round 1-3 已完成。启动 Round 4 和 Round 5 并行复审。

| 步骤 | 操作 | 预计时间 |
|------|------|---------|
| 1.1 | ✅ Round 1 后端安全复审完成（7 Bug） | 完成 |
| 1.2 | ✅ Round 2 前端核心逻辑复审完成（8 Bug） | 完成 |
| 1.3 | ✅ Round 3 SSE/实时通信复审完成（9 Bug） | 完成 |
| 1.4 | 启动 Round 4: IoT/Agent 模块复审（用户隔离、工具调用安全、配额管理、设备控制、提示词注入） | 5-10 min |
| 1.5 | 启动 Round 5: 全栈集成复审（端到端流程、数据一致性、部署配置、CI/CD、性能） | 5-10 min |
| 1.6 | 汇总 Round 4-5 新发现 BUG，更新 BUG 清单 | 2 min |

### 阶段 2: 修复所有 BUG

> 按优先级分批修复：Critical → High → Medium → Low
> 使用 3 个并行 sub-agent 分别处理独立模块

#### 批次 1: Critical 修复（原始剩余 + 复审新发现）

| 编号 | 文件 | 修复方案 |
|------|------|---------|
| C-002 | `nginx.conf` | 文档化 SSL 部署步骤，或在服务器安装证书后启用 |
| C-008 | `api-client.ts` | SSE 流 401 时调用 `tryRefreshToken`，成功后重建连接 |
| R1-001 | `api-key.service.ts` + `encryption.util.ts` | 轮换后更新 `this.key`，或返回需重启警告 |
| R2-001 | `use-sse-chat.ts` | 模块级定义 `const EMPTY_MESSAGES: ChatMessage[] = []` |

#### 批次 2: High 修复

| 编号 | 文件 | 修复方案 |
|------|------|---------|
| H-005 | `auth.service.ts` | 密码重置令牌不通过 API 返回，仅日志/邮件 |
| H-006 | `openclaw.provider.ts` | AbortSignal 传递给 `llmAdapter.chat()` |
| H-007 | `tool-calling.service.ts` | JSON Schema 参数校验 |
| H-009 | `redis.service.ts` | `KEYS` → `SCAN` 迭代器 |
| H-013~H-016 | 前端各文件 | 登录按钮禁用、输入框值丢失、路由重定向、访谈页跳转 |
| H-017 | `use-sse-chat.ts` | `onReasoning` 接收 content 参数累积到 reasoning |
| H-019 | `family-hub-store.ts` | API 失败时不模拟成功 |
| H-021 | `use-glass-lighting.ts` | 全局单 mousemove 监听器 |
| H-023 | `devices/page.tsx` | alert() → Toast 组件 |
| H-025 | `home-chat-overlay.tsx` | open=false 时重置 sentRef |
| H-026 | `auth-store.ts` | 统一 token 存储路径 |
| H-027 | `skills/page.tsx` | 调用 API 持久化新增技能 |
| H-030 | `page.tsx` | 合并双轮询 useEffect |
| H-033 | `iot.service.ts` | AES-256 加密 IoT 凭证（部分已完成） |
| H-036 | `openclaw-webhook.controller.ts` | Webhook 异步处理 |
| H-037 | `interview/page.tsx` | 流式时 `behavior: 'auto'` + RAF 节流（部分已完成） |
| H-038 | 认证守卫/过滤器 | 401 返回 JSON 体 |
| H-039 | `iot.service.ts` | 设备列表 name 非 null |
| H-040 | `ai.controller.ts` | SSE 端点 `@HttpCode(200)` |
| H-041 | `api-client.ts` | createGETSSEStream onClose + 重连（部分已完成） |
| H-042 | `homekit.provider.ts` | SSRF 防护，验证内网地址 |
| H-043 | `main.ts` | 启动时验证必需环境变量 |
| H-044 | `openclaw.provider.ts` | 优化 IOT_PATTERNS 正则 |
| R1-002 | `admin.service.ts` | 敏感配置 key 过滤，仅 super_admin 可读写 |
| R1-003 | `wechat.controller.ts` | 添加 `@Roles('super_admin')` 守卫 |
| R2-002 | `api-client.ts` | SSE 401 分支添加 `handleUnauthorized()` |

#### 批次 3: Medium 修复（48 项 + 复审新发现 7 项 = 55 项）

按模块分组批量处理：

| 模块 | 编号 | 数量 |
|------|------|------|
| 认证模块 | M-001~M-004 | 4 |
| Agent/SSE | M-005~M-008 | 4 |
| UI 组件 | M-009~M-011 | 3 |
| 数据库/配置 | M-012~M-016 | 5 |
| UX 修复 | M-017~M-020 | 4 |
| 性能优化 | M-021~M-024 | 4 |
| 其他 Medium | M-025~M-048 | 24 |
| 复审 R1-004~R1-007 | 后端安全 | 4 |
| 复审 R2-003~R2-005 | 前端逻辑 | 3 |

#### 批次 4: Low 修复（14 项 + 复审新发现 3 项 = 17 项）

| 类型 | 编号 | 数量 |
|------|------|------|
| 原 Low | L-001~L-014 | 14 |
| 复审 R2-006~R2-008 | 前端逻辑 | 3 |

### 阶段 3: 验证检查点

> 每个批次完成后执行

| 检查项 | 命令 |
|--------|------|
| TypeScript 编译 | `pnpm tsc --noEmit` |
| ESLint 检查 | `pnpm lint` |
| 构建测试 | `pnpm build` |
| 关键功能验证 | 手动检查认证/SSE/IoT 流程 |

### 阶段 4: 上传服务器并等待部署成功

> **用户明确要求：修复审查完记得上传服务器然后要等部署成功**

| 步骤 | 操作 | 说明 |
|------|------|------|
| 4.1 | `git add` 所有修改文件 | 逐个添加，避免 `git add -A` |
| 4.2 | `git commit` | 提交信息: `fix: 全量BUG修复 - 安全漏洞+前端逻辑+SSE+IoT+性能优化` |
| 4.3 | `git push origin main` | 推送到 GitHub |
| 4.4 | 监控 GitHub Actions CI/CD | `gh run watch` 或查看 Actions 页面 |
| 4.5 | 等待 Docker 构建完成 | 关注 build 日志中的错误 |
| 4.6 | 等待 ECS 部署完成 | 关注 deploy 步骤 |
| 4.7 | 验证 http://47.103.20.211 | 检查首页加载、登录、SSE、IoT 等关键功能 |
| 4.8 | 报告部署结果 | 向用户确认部署成功/失败 |

---

## 三、并行化策略

### Sub-Agent 分工

| Agent | 负责模块 | 修复范围 |
|-------|---------|---------|
| Agent 1 (后端) | 认证、Agent、IoT、数据库、Redis | C-002, C-008, H-005~H-044, R1-001~R1-007, M-001~M-016 |
| Agent 2 (前端) | 组件、页面、Store、Hooks | H-013~H-037, R2-001~R2-008, M-009~M-011, M-017~M-024 |
| Agent 3 (基础设施) | Nginx、Docker、配置 | C-002, H-043, docker-compose 修复, nginx 配置 |

### 依赖关系

```
Round 3-5 复审完成
    ↓
汇总所有 BUG 清单
    ↓
批次 1: Critical 修复（3 个 Agent 并行）
    ↓
验证检查点
    ↓
批次 2: High 修复（3 个 Agent 并行）
    ↓
验证检查点
    ↓
批次 3: Medium 修复（3 个 Agent 并行）
    ↓
验证检查点
    ↓
批次 4: Low 修复（3 个 Agent 并行）
    ↓
最终验证（tsc + lint + build）
    ↓
Git commit + push
    ↓
监控 CI/CD 部署
    ↓
验证线上服务
```

---

## 四、风险评估与决策

### 4.1 已知风险

1. **SSL 证书**: 服务器尚未安装 SSL 证书，HTTPS 配置已准备好但被注释。需用户在服务器上执行 `certbot` 安装。
2. **邮件服务**: 密码重置通过日志输出令牌（开发环境），生产环境需配置 SMTP。
3. **加密密钥轮换 (R1-001)**: 修复方案需确保 `EncryptionUtil` 支持运行时密钥更新，或要求重启。
4. **WeChat RBAC (R1-003)**: 添加角色限制可能影响现有微信集成测试。
5. **数据库迁移**: Medium 修复中如果涉及 Prisma schema 变更，需生成并应用迁移。

### 4.2 决策点

1. **SSL**: 先部署 HTTP，后续再启用 HTTPS？还是等 SSL 准备好再部署？
   - 建议: 先 HTTP 部署验证功能，SSL 作为后续任务
2. **Medium/Low 批量处理**: 是否全部修复，还是仅修复影响功能的？
   - 建议: 全部修复，用户要求"修复所有发现的bug"
3. **复审标准**: 每轮复审无新增 Critical/High 才算通过
   - 如果 Round 3-5 发现新 Critical/High，需追加修复轮次

---

## 五、预计工作量

| 阶段 | 内容 | 预计项数 |
|------|------|---------|
| 阶段 1 | 完成复审 Round 4-5 | 2 轮 |
| 阶段 2-批次1 | Critical 修复 | 4 项 |
| 阶段 2-批次2 | High 修复 | ~26 项 |
| 阶段 2-批次3 | Medium 修复 | ~59 项 |
| 阶段 2-批次4 | Low 修复 | ~21 项 |
| 阶段 3 | 验证检查 | 4 次 |
| 阶段 4 | 部署 | 1 次 |
| **总计** | | **~110 项修复 + 2 轮复审 + 1 次部署** |
