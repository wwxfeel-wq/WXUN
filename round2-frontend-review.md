# EchoLife 第2轮代码审查报告 - 前端核心逻辑

**审查范围**: `apps/web/src/` 前端核心逻辑
**审查日期**: 2026-08-08
**审查轮次**: Round 2 / 5

---

## 1. 新发现的 Bug

### Bug #1 [Critical] - `useSSEChat` Hook 默认参数导致无限重渲染循环

**文件**: `apps/web/src/hooks/use-sse-chat.ts`
**行号**: 第49行 + 第70-73行

**描述**:

`useSSEChat` 的函数签名使用了默认参数解构:

```typescript
export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const { interviewId, initialMessages = [] } = options;
```

当组件以 `useSSEChat()` 无参调用时（如 `HomeChatOverlay` 组件，第344行），每次渲染都会创建新的 `{}` 对象和新的 `[]` 数组引用。

随后在 `useEffect` 中:

```typescript
useEffect(() => {
  setMessages(initialMessages);
  messagesRef.current = initialMessages;
}, [initialMessages]);
```

由于 `initialMessages` 每次渲染都是新引用，`useEffect` 的依赖检查（使用 `Object.is`）判定依赖已变化，effect 在每次渲染后都会触发。`setMessages([])` 传入新数组引用，React 判定状态已变化（`Object.is([], [])` 为 `false`），触发重渲染。新渲染中 `initialMessages` 又是新引用，effect 再次触发，形成无限循环。

**触发路径**: `HomeChatOverlay` 组件（`apps/web/src/components/home/home-chat-overlay.tsx` 第344行）调用 `useSSEChat()` 无参。`SpatialHome` 中的输入框输入或任何状态变化都会触发 `HomeChatOverlay` 重渲染，立即启动无限循环。React 将在约50次迭代后抛出 "Maximum update depth exceeded" 错误，导致首页崩溃。

**影响**: 首页（`SpatialHome`）在用户输入或任何重渲染触发后崩溃。

---

### Bug #2 [High] - SSE `createSSEStream` 401 处理未调用 `handleUnauthorized()`

**文件**: `apps/web/src/lib/api-client.ts`
**行号**: 第374-382行

**描述**:

在 `createSSEStream` 函数中，当 SSE 连接收到 401 状态码后，token 刷新失败或刷新后重试仍返回 401 时，代码仅通过 `callbacks.onError` 显示错误消息，但未调用 `handleUnauthorized()`:

```typescript
// 第374-382行
if (!response.ok || !response.body) {
  if (response.status === 401) {
    callbacks.onError?.('登录已过期，请重新登录', 40101);
    // 缺少: handleUnauthorized();
  } else {
    callbacks.onError?.(`AI服务返回错误: ${response.status}`, response.status);
  }
  safeClose();
  return;
}
```

对比普通 API 请求的 401 处理（第196-203行）:

```typescript
} else {
  handleUnauthorized();  // 正确: 清除 token + 重定向
  throw new ApiError('登录已过期，请重新登录', 40101, 401);
}
```

**影响**: SSE 流式对话中 token 过期时，用户看到错误提示但不会被重定向到登录页，token 也不会被清除。用户停留在页面上，后续所有 API 请求都会继续返回 401，且 Zustand store 中的 `isAuthenticated` 仍为 `true`，造成不一致状态。

---

### Bug #3 [Medium] - `createGETSSEStream` 重连时错误调用 `onClose`

**文件**: `apps/web/src/lib/api-client.ts`
**行号**: 第711-717行

**描述**:

在 `createGETSSEStream` 的 `catch` 块中，当发生非 Abort 错误时，代码同时调度重连和调用 `onClose`:

```typescript
} catch (err) {
  if ((err as Error).name !== 'AbortError' && !isAborted) {
    onError?.('数据流中断');
    reconnectTimer = setTimeout(() => connect(), 5000);  // 调度重连
  }
  onClose?.();  // 但同时也调用 onClose，语义矛盾
}
```

调用方在 `onClose` 回调中通常会清理资源或调用 `abort()`。如果调用方在 `onClose` 中调用 `abort()`，则 `isAborted` 被设为 `true`，`reconnectTimer` 被清除，重连永远不会发生。

即使调用方不在 `onClose` 中调用 `abort()`，调用方也可能认为连接已关闭而停止处理后续事件，导致重连后的事件无法被正确消费。

**影响**: GET SSE 流（如微信消息流、agent 活动流）在网络抖动后无法自动重连，或重连后调用方无法正确处理事件。

---

### Bug #4 [Medium] - 访谈页持久化 `streaming: true` 状态的消息到 localStorage

**文件**: `apps/web/src/app/(app)/interview/page.tsx`
**行号**: 第157-169行

**描述**:

访谈页将消息防抖保存到 localStorage，但未清除 `streaming` 标志:

```typescript
React.useEffect(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
      // messages 中可能包含 streaming: true 的消息
    } catch {
      // ...
    }
  }, 500);
  // ...
}, [messages]);
```

当页面在流式回复过程中被刷新，`streaming: true` 的消息被持久化。恢复时（第138-146行），消息原样加载:

```typescript
const [initialMessages] = React.useState<ChatMessage[]>(() => {
  // ...
  return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
});
```

恢复的消息中 `streaming` 仍为 `true`，但没有活跃的 SSE 连接。该消息会永远显示"正在输入"动画，且 `useSSEChat` 的 `onClose` 不会被触发来清除该标志。

**影响**: 页面刷新后，上次未完成的 AI 回复永远显示为"流式传输中"状态。

---

### Bug #5 [Medium] - API 客户端 401 拦截器对登录/注册端点产生错误行为

**文件**: `apps/web/src/lib/api-client.ts`
**行号**: 第179-203行

**描述**:

`request` 函数对所有 401 响应统一处理: 尝试刷新 token，失败后调用 `handleUnauthorized()` 并抛出 "登录已过期，请重新登录"。但登录/注册端点返回 401 表示"凭据错误"而非"token 过期"。

当登录端点返回 401（如密码错误）时:
1. `tryRefreshToken()` 被调用 - 由于用户未登录，没有 refreshToken，返回 `null`
2. `handleUnauthorized()` 被调用 - 清除不存在的 token，不重定向（已在 `/login`）
3. 抛出 `ApiError('登录已过期，请重新登录', 40101, 401)`
4. 后端返回的实际错误消息（如"邮箱或密码错误"）被丢弃

登录页捕获错误并显示 "登录已过期，请重新登录"，而非后端提供的准确错误信息。

**影响**: 登录失败时用户看到误导性错误消息（"登录已过期"而非"邮箱或密码错误"）。

---

### Bug #6 [Low] - `spatial-home.tsx` 中 `sending` 状态无效

**文件**: `apps/web/src/components/home/spatial-home.tsx`
**行号**: 第81-91行

**描述**:

```typescript
const submit = async (event: FormEvent) => {
  event.preventDefault();
  const value = message.trim();
  if (!value || sending) return;
  setSending(true);
  setChatMessage(value);
  setChatOpen(true);
  setMessage('');
  setSending(false);  // 立即设回 false，sending 从未真正为 true
};
```

`setSending(true)` 和 `setSending(false)` 在同一同步执行栈中，React 18 批处理会将它们合并，`sending` 状态永远不会实际变为 `true`。因此 `if (!value || sending) return;` 中的 `sending` 守卫始终为 `false`，无法防止重复提交。

**影响**: 理论上可能重复触发聊天面板打开，但实际影响较小（仅打开面板，不发送网络请求）。

---

### Bug #7 [Low] - `initAuth` 未在无 token 时清除过期的认证状态

**文件**: `apps/web/src/stores/auth-store.ts`
**行号**: 第122-133行

**描述**:

```typescript
export function initAuth(): void {
  if (typeof window === 'undefined') return;
  const token = getToken();
  if (token) {
    const state = useAuthStore.getState();
    if (!state.accessToken) {
      useAuthStore.setState({ accessToken: token, isAuthenticated: !!state.user });
    }
  }
  // 缺少: else 分支 - 当 token 不存在但 isAuthenticated 为 true 时，不清除状态
  useAuthStore.getState().setHydrated();
}
```

如果 localStorage 中 `echolife-auth`（Zustand 持久化数据）存在且 `isAuthenticated: true`，但 `echolife_access_token` 已被清除（如被其他标签页清除、浏览器存储清理等），`initAuth` 不会将 `isAuthenticated` 重置为 `false`。AppShell 认证守卫会放行用户进入应用，直到首个 API 请求返回 401 才触发重定向。

**影响**: 用户可能在页面加载后短暂看到应用界面，随后被重定向到登录页。

---

### Bug #8 [Low] - `useSSEChat` 中 `upsertMessage` 为死代码且出现在依赖数组中

**文件**: `apps/web/src/hooks/use-sse-chat.ts`
**行号**: 第90-98行 + 第282行

**描述**:

`upsertMessage` 使用 `useCallback` 定义，但在 `sendMessage` 中从未被调用（所有消息更新均直接使用 `setMessages` 回调形式）。同时它出现在 `sendMessage` 的依赖数组中:

```typescript
// 第282行
[isStreaming, upsertMessage],
```

`upsertMessage` 也未被导出供外部使用。这是死代码，虽然不影响运行时行为（`upsertMessage` 引用稳定），但增加了代码维护负担。

**影响**: 无运行时影响，仅为代码整洁性问题。

---

## 2. 修复建议

### Bug #1 修复 [Critical]

在模块级别定义稳定的空数组常量:

```typescript
// 模块级别
const EMPTY_MESSAGES: ChatMessage[] = [];

export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const { interviewId, initialMessages = EMPTY_MESSAGES } = options;
  // ...
}
```

这样 `initialMessages` 默认引用稳定，`useEffect` 不会在每次渲染时触发。

### Bug #2 修复 [High]

在 `createSSEStream` 的 401 错误处理中添加 `handleUnauthorized()` 调用:

```typescript
if (!response.ok || !response.body) {
  if (response.status === 401) {
    handleUnauthorized();  // 添加: 清除 token + 重定向
    callbacks.onError?.('登录已过期，请重新登录', 40101);
  } else {
    callbacks.onError?.(`AI服务返回错误: ${response.status}`, response.status);
  }
  safeClose();
  return;
}
```

### Bug #3 修复 [Medium]

重连时不调用 `onClose`，仅在真正关闭时调用:

```typescript
} catch (err) {
  if ((err as Error).name !== 'AbortError' && !isAborted) {
    onError?.('数据流中断，正在重连...');
    reconnectTimer = setTimeout(() => connect(), 5000);
    // 不调用 onClose，因为连接正在重连
  } else {
    onClose?.();  // 仅在终止/中止时调用 onClose
  }
}
```

### Bug #4 修复 [Medium]

持久化前清除 `streaming` 标志:

```typescript
saveTimerRef.current = setTimeout(() => {
  try {
    const toSave = messages.slice(-50).map(m => ({ ...m, streaming: false }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ...
  }
}, 500);
```

### Bug #5 修复 [Medium]

为 `request` 函数添加 `skipAuthRefresh` 选项，在 auth 端点跳过 401 拦截:

```typescript
async function request<T>(
  method: string,
  endpoint: string,
  options: {
    params?: QueryParams;
    body?: unknown;
    headers?: HeadersInit;
    signal?: AbortSignal;
    raw?: boolean;
    skipAuthRefresh?: boolean;  // 新增
  } = {},
): Promise<T> {
  // ...
  if (response.status === 401 && !options.skipAuthRefresh) {
    // 现有的 401 处理逻辑
  } else if (response.status === 401) {
    // 对于 auth 端点，直接解析后端错误
    // 不调用 handleUnauthorized，不尝试刷新
  }
  // ...
}
```

在 `auth-store.ts` 的 `login`/`register` 方法中传入 `skipAuthRefresh: true`，或在 `apiClient.post` 中添加选项透传。

### Bug #6 修复 [Low]

移除无效的 `sending` 状态，或改为异步跟踪:

```typescript
const submit = (event: FormEvent) => {
  event.preventDefault();
  const value = message.trim();
  if (!value) return;  // 移除 sending 检查
  setChatMessage(value);
  setChatOpen(true);
  setMessage('');
};
```

### Bug #7 修复 [Low]

在 `initAuth` 中添加无 token 时的状态清理:

```typescript
export function initAuth(): void {
  if (typeof window === 'undefined') return;
  const token = getToken();
  if (token) {
    const state = useAuthStore.getState();
    if (!state.accessToken) {
      useAuthStore.setState({ accessToken: token, isAuthenticated: !!state.user });
    }
  } else {
    // 无 token 但状态显示已认证 - 清除不一致状态
    const state = useAuthStore.getState();
    if (state.isAuthenticated && !state.accessToken) {
      useAuthStore.setState({ isAuthenticated: false, user: null });
    }
  }
  useAuthStore.getState().setHydrated();
}
```

### Bug #8 修复 [Low]

移除 `upsertMessage` 函数及其在依赖数组中的引用:

```typescript
const sendMessage = useCallback(
  (content: string) => {
    // ...
  },
  [isStreaming],  // 移除 upsertMessage
);
```

---

## 3. 审查结论

| 严重级别 | 数量 | Bug 编号 |
|---------|------|---------|
| Critical | 1 | #1 |
| High | 1 | #2 |
| Medium | 3 | #3, #4, #5 |
| Low | 3 | #6, #7, #8 |
| **总计** | **8** | |

### 判定: **FAIL**

存在 1 个 Critical 和 1 个 High 级别 Bug:

- **Bug #1 (Critical)**: `useSSEChat` 的默认参数导致 `HomeChatOverlay` 无限重渲染，首页在用户交互后直接崩溃。
- **Bug #2 (High)**: SSE 流式连接的 401 处理未清理认证状态，用户 token 过期后无法正确登出。

建议优先修复 Bug #1 和 Bug #2 后重新提交审查。
