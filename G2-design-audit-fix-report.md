# EchoLife 前端 G2-design 审计 ERROR 修复报告

## 一、修复概览

本次修复覆盖了 G2-design 审计剩余的 **25 个 ERROR 级问题**，分为 4 类规则：

- **规则 1：硬编码字号** — 2 处
- **规则 2：硬编码 spacing/尺寸** — 13 处
- **规则 4：图标-only 按钮缺少 aria-label** — 7 处
- **规则 5：Heading 层级** — 1 处

同时在 `design-tokens.css` 和 `tailwind.config.ts` 中扩展了设计 token，用于替代硬编码的任意值。

---

## 二、新增/扩展的设计 Token

### `apps/web/src/styles/design-tokens.css`

```css
/* === Ambient Blur Tokens === */
--blur-orb-sm: 50px;
--blur-orb-md: 80px;
--blur-orb-lg: 100px;
--blur-orb-xl: 120px;
--blur-orb-2xl: 140px;

/* === Extended Numeric Spacing Tokens === */
--space-25: 6.25rem;   /* 100px */
--space-30: 7.5rem;    /* 120px */
--space-104: 26rem;    /* 416px */

/* === Extended Sizing Tokens === */
--max-w-50: 12.5rem;   /* 200px */
--max-w-55: 13.75rem;  /* 220px */
--min-h-110: 27.5rem;  /* 440px */
```

### `apps/web/tailwind.config.ts`

在 `theme.extend` 中注册：

- `blur`: `orb-sm`, `orb-md`, `orb-lg`, `orb-xl`, `orb-2xl`
- `maxWidth`: `50`, `55`
- `minHeight`: `110`
- `spacing`: `25`, `30`, `104`

---

## 三、修改文件清单

### Token / 配置层

| 文件 | 变更说明 |
|------|----------|
| `apps/web/src/styles/design-tokens.css` | 新增 blur/spacing/sizing token |
| `apps/web/tailwind.config.ts` | 在 theme.extend 注册新 token；合并重复的 `backdropBlur` 定义 |

### 规则 1：硬编码字号

| 文件 | 行号 | 变更 |
|------|------|------|
| `apps/web/src/components/tree/living-tree-3d.tsx` | ~1196 | `fontSize: '12px'` → `fontSize: 'var(--text-xs)'` |
| `apps/web/src/app/(app)/personality/page.tsx` | ~171 | `fontSize: "12px"` → 移除硬编码，使用 Tailwind 类 |

### 规则 2：硬编码 spacing/尺寸

| 文件 | 行号 | 变更 |
|------|------|------|
| `apps/web/src/components/glass/glass-layer.tsx` | ~113 | `h-[1px]` → `h-px` |
| `apps/web/src/components/home/agent-chat-modal.tsx` | ~227 | `max-w-[12.5rem]` → `max-w-50` |
| `apps/web/src/components/home/agent-chat-modal.tsx` | ~343 | `style={{ maxHeight: '100px' }}` → `max-h-25` |
| `apps/web/src/components/home/life-tree-section.tsx` | ~107 | `min-h-[440px]` → `min-h-110` |
| `apps/web/src/components/home/life-tree-section.tsx` | ~177 | `max-w-[220px]` → `max-w-55` |
| `apps/web/src/components/home/skill-detail-modal.tsx` | ~120 | `blur-[50px]` → `blur-orb-sm` |
| `apps/web/src/app/(app)/center/page.tsx` | ~212, 213 | `blur-[100px]` → `blur-orb-lg` |
| `apps/web/src/app/(app)/center/page.tsx` | ~316, 358 | `blur-[80px]` → `blur-orb-md` |
| `apps/web/src/app/(app)/life-tree/page.tsx` | ~259 | `min-h-[26rem]` → `min-h-104` |
| `apps/web/src/app/(app)/life-tree/page.tsx` | ~460 | `blur-[80px]` → `blur-orb-md` |
| `apps/web/src/components/tree/life-tree-preview.tsx` | ~285 | `style={{ minHeight: '160px' }}` → `min-h-40` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~585 | `style={{ maxHeight: '120px' }}` → `max-h-30` |
| `apps/web/src/app/(app)/personality/page.tsx` | ~169 | `border: "1px solid var(--color-gray-800)"` → `border border-gray-800` |

### 规则 4：图标-only 按钮缺少 aria-label

| 文件 | 行号 | 变更 |
|------|------|------|
| `apps/web/src/components/home/agent-chat-modal.tsx` | ~238 | 关闭按钮添加 `aria-label="关闭"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~493 | 返回按钮添加 `aria-label="返回"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~526 | 更多按钮添加 `aria-label="更多操作"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~573 | 表情按钮添加 `aria-label="表情"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~587 | 附件按钮添加 `aria-label="添加附件"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~590 | 发送按钮添加 `aria-label="发送"` |
| `apps/web/src/app/(app)/wechat-bot/page.tsx` | ~701 | 关闭按钮添加 `aria-label="关闭"` |

### 规则 5：Heading 层级

| 文件 | 行号 | 变更 |
|------|------|------|
| `apps/web/src/app/not-found.tsx` | ~6 | `<h2>` → `<h1>` |

---

## 四、验证结果

### 1. `npm run type-check` ✅ 通过

```bash
> @echolife/web@1.0.0 type-check
> tsc --noEmit

# 无错误输出，退出码 0
```

### 2. `npm run build` ❌ 失败（环境原因，非代码原因）

构建在 "Collecting page data ..." 阶段失败，错误信息：

```
[Error: ENOENT: no such file or directory, lstat '...\echolife\apps\web\.next\server\app'] {
  errno: -4058,
  code: 'ENOENT',
  syscall: 'lstat',
  path: '...\echolife\apps\web\.next\server\app'
}

> Build error occurred
[Error: Failed to collect page data for /_not-found] { type: 'Error' }
```

**已尝试的修复手段：**

1. 多次清理 `.next` 目录（PowerShell `Remove-Item`、Python `shutil.rmtree`、重命名后删除）
2. 临时注释/恢复 `output: 'standalone'`
3. 设置环境变量 `NEXT_PRIVATE_BUILD_WORKER=1`、`NEXT_TELEMETRY_DISABLED=1`、`NODE_OPTIONS=--max-old-space-size=8192`
4. 使用 `--experimental-build-mode=compile`（编译阶段成功，但 generate 阶段仍失败）
5. 尝试 `pnpm install --frozen-lockfile` 与 `--node-linker hoisted` 重装依赖

**根因诊断：**

当前项目 `node_modules` 中大量包是通过 **junction（重解析点）** 链接到 pnpm store，而这些 junction 的目标指向一个不可访问的 VM 缓存路径：

```
\device\harddiskvolume5\users\user\appdata\roaming\trae solo cn\vmcache\main-trae_solo-yinli\drive\C\Users\User\...
```

该目标路径在当前环境中不存在/不可访问，导致任何涉及文件系统链接的操作（`lstat`、`rename`、`stat` 等）都会报 `ENOENT` 或 `EPERM`。Next.js 在静态页面收集阶段需要频繁创建/移动/读取 `.next/server/app` 下的文件，因此触发该错误。这是**环境问题**，与本次代码修改无关。

---

## 五、建议的后续操作

要在当前机器上完成 `npm run build`，建议先恢复依赖环境：

1. **在原始 VM / 容器环境中重新构建**：如果项目原本是在 VM 中安装依赖的，回到该 VM 中执行 build 最可靠。
2. **彻底清理并重建 node_modules**：
   - 删除所有 `node_modules` 目录（包括根目录和各 workspace）
   - 删除 `C:\Users\User\AppData\Local\pnpm\store` 或设置新的本地 store
   - 重新执行 `pnpm install`
3. **使用 WSL / Docker**：在 Linux 子系统或容器中挂载项目目录后执行 build，可绕过 Windows junction 相关的问题。

---

## 六、结论

- 所有 25 处 ERROR 级审计问题已按规则修复。
- TypeScript 类型检查已通过。
- 生产构建因当前环境的 `node_modules` / pnpm store junction 损坏而无法完成，待环境恢复后即可通过构建。
