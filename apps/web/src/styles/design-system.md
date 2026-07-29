# Design System: 岁言（SuiYan）V3 — Apple Liquid Glass Dark for Family AI OS

> 本文档是 `design-tokens.css` 的说明性镜像。所有 token 以 CSS 文件为唯一真相来源。
> 任何 UI 实现必须引用 `var(--*)`，禁止硬编码。

## Brand Direction

- **Project**: 岁言（SuiYan）/ EchoLife — Family AI Operating System
- **Mascot**: 时墨
- **Aesthetic**: Minimal, Premium, Soft, Organic, AI Native, Calm, Elegant, Modern, Future, Living
- **Color philosophy**: Warm obsidian canvas with soft liquid-glass refraction and warm organic life accents
- **Motion philosophy**: Springy, calm, liquid-like transitions with subtle hover feedback
- **Reference**: Apple Intelligence / VisionOS / iOS26 / Apple官网

## Design Principles

1. **Family-first**: 不是后台，是家庭成长空间。温暖、安静、有生命感。
2. **Dark-first**: 整个应用生活在近黑暖调画布上，所有表面如半透明玻璃悬浮其上。
3. **One life accent**: 生命绿 `#00D4AA` 是主色。天空蓝与暖琥珀仅作状态与温暖点缀。
4. **Generous radius**: 大圆角（14–32px）呼应 Apple Liquid Glass 语言。
5. **Layered depth**: 玻璃使用 backdrop-filter blur +  subtle borders + 内侧顶部高光 + Fresnel 边缘模拟折射。
6. **Calm motion**: 所有过渡使用 liquid/spring easing，时长克制。
7. **No hardcoded values**: 颜色、间距、字体、圆角、阴影、动效、玻璃参数全部引用 token。
8. **Agent hidden**: 用户永远只看到"时墨"，技术细节（Agent/Runtime/Tool）不可见。

## Color Tokens

```css
/* Primary — Life Green */
--color-primary: #00d4aa;
--color-primary-hover: #00f0c0;
--color-primary-active: #00b898;
--color-primary-disabled: rgba(0, 212, 170, 0.35);
--color-primary-glow: rgba(0, 212, 170, 0.28);
--color-primary-soft: rgba(0, 212, 170, 0.14);
--color-primary-faint: rgba(0, 212, 170, 0.08);

/* Secondary — Soft Sky */
--color-secondary: #7ab8f0;
--color-secondary-hover: #9ccbff;
--color-secondary-active: #5fa3d8;
--color-secondary-glow: rgba(122, 184, 240, 0.28);

/* Highlight — Warm Amber */
--color-highlight: #f5b23d;
--color-highlight-hover: #ffc95c;
--color-highlight-glow: rgba(245, 178, 61, 0.28);

/* Warm accents */
--color-warm: #f4a27a;
--color-rose: #f2828c;

/* Semantic */
--color-success: #34d399;
--color-warning: #fbbf24;
--color-error: #fb7185;
--color-info: #7ab8f0;

/* Neutral (white opacity scale) */
--color-gray-50: rgba(255, 255, 255, 0.96);
--color-gray-100: rgba(255, 255, 255, 0.88);
--color-gray-200: rgba(255, 255, 255, 0.72);
--color-gray-300: rgba(255, 255, 255, 0.56);
--color-gray-400: rgba(255, 255, 255, 0.42);
--color-gray-500: rgba(255, 255, 255, 0.30);
--color-gray-600: rgba(255, 255, 255, 0.20);
--color-gray-700: rgba(255, 255, 255, 0.13);
--color-gray-800: rgba(255, 255, 255, 0.08);
--color-gray-900: rgba(255, 255, 255, 0.05);
--color-gray-950: rgba(255, 255, 255, 0.03);

/* Surface */
--color-bg: #030305;
--color-bg-elevated: #07070a;
--color-bg-warm: #0d0b0a;
--color-surface: rgba(255, 255, 255, 0.045);
--color-surface-raised: rgba(255, 255, 255, 0.07);
--color-surface-overlay: rgba(255, 255, 255, 0.10);

/* Glass */
--color-glass: rgba(255, 255, 255, 0.06);
--color-glass-hover: rgba(255, 255, 255, 0.10);
--color-glass-strong: rgba(255, 255, 255, 0.10);
--color-glass-strong-hover: rgba(255, 255, 255, 0.15);
--color-glass-extreme: rgba(255, 255, 255, 0.14);
--color-glass-extreme-hover: rgba(255, 255, 255, 0.20);
--color-glass-border: rgba(255, 255, 255, 0.10);
--color-glass-border-hover: rgba(255, 255, 255, 0.16);
--color-glass-border-strong: rgba(255, 255, 255, 0.20);
--color-glass-highlight: rgba(255, 255, 255, 0.18);

/* Text */
--color-text-primary: rgba(255, 255, 255, 0.94);
--color-text-secondary: rgba(255, 255, 255, 0.60);
--color-text-tertiary: rgba(255, 255, 255, 0.38);
--color-text-muted: rgba(255, 255, 255, 0.28);
--color-text-inverse: #06060e;

/* Border */
--color-border: rgba(255, 255, 255, 0.08);
--color-border-strong: rgba(255, 255, 255, 0.12);
--color-border-focus: rgba(0, 212, 170, 0.45);
```

## Family Member Colors

```css
--color-family-father: #7ab8f0;
--color-family-mother: #f2828c;
--color-family-child: #f5b23d;
--color-family-elder: #b8a2f0;
--color-family-pet: #9de0b8;
--color-family-other: #a8a8a8;
```

## Life Tree Colors

```css
--color-tree-root: #8b6f4e;
--color-tree-trunk: #6b5a4a;
--color-tree-branch: #7a6b5a;
--color-tree-leaf: #00d4aa;
--color-tree-flower: #f2828c;
--color-tree-fruit: #f5b23d;
--color-tree-sap: #5dd3e8;
--color-tree-neural: rgba(200, 190, 255, 0.16);
```

## Spacing Tokens

```css
--space-0: 0px;
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
--space-2xl: 32px;
--space-3xl: 48px;
--space-4xl: 64px;
--space-5xl: 96px;
--space-6xl: 128px;
```

## Typography Scale

```css
--font-display: 'SF Pro Display', 'Inter', 'HarmonyOS Sans SC', 'Noto Sans CJK SC', ...;
--font-body: 'SF Pro Text', 'Inter', 'HarmonyOS Sans SC', 'Noto Sans CJK SC', ...;
--font-mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;

--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: clamp(1.5rem, 4vw, 1.875rem);
--text-4xl: clamp(1.875rem, 5vw, 2.25rem);
--text-5xl: clamp(2.25rem, 6vw, 3rem);
--text-6xl: clamp(2.5rem, 8vw, 3.75rem);
--text-hero: clamp(3rem, 10vw, 5rem);
```

## Border Radius Tokens

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-2xl: 24px;
--radius-3xl: 32px;
--radius-4xl: 44px;
--radius-full: 9999px;
```

## Shadow System

```css
--shadow-xs: ...;
--shadow-sm: ...;
--shadow-md: ...;
--shadow-lg: ...;
--shadow-xl: ...;
--shadow-2xl: ...;
--shadow-glass-soft: ...;
--shadow-glass-medium: ...;
--shadow-glass-strong: ...;
--shadow-glass-extreme: ...;
--shadow-glow-primary: 0 0 24px var(--color-primary-glow);
--shadow-glow-primary-sm: 0 0 16px var(--color-primary-glow);
--shadow-glow-primary-lg: 0 0 32px var(--color-primary-glow);
--shadow-glow-secondary: 0 0 24px var(--color-secondary-glow);
--shadow-glow-highlight: 0 0 24px var(--color-highlight-glow);
```

## Z-Index Layers

```css
--z-base: 0;
--z-background: -1;
--z-dropdown: 100;
--z-sticky: 200;
--z-fixed: 300;
--z-overlay: 400;
--z-modal: 1000;
--z-popover: 1100;
--z-toast: 2000;
--z-tooltip: 2100;
```

## Motion Tokens

```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
--duration-slower: 600ms;

--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-liquid: cubic-bezier(0.22, 1, 0.36, 1);
--ease-organic: cubic-bezier(0.4, 0, 0.2, 1.2);

--transition-fast: all var(--duration-fast) var(--ease-out);
--transition-liquid: all var(--duration-slow) var(--ease-liquid);
```

## Component States

```css
--state-hover-lift: -2px;
--state-hover-scale: 1.02;
--state-active-scale: 0.97;
--state-disabled-opacity: 0.45;
--state-focus-ring-width: 3px;
```

## Liquid Glass Effects

```css
--glass-blur: blur(32px) saturate(1.6) brightness(1.04);
--glass-blur-strong: blur(44px) saturate(1.8) brightness(1.06);
--glass-blur-extreme: blur(60px) saturate(2.0) brightness(1.08);
--glass-blur-subtle: blur(20px) saturate(1.4) brightness(1.02);
--glass-blur-radius: 32px;
--glass-blur-radius-strong: 44px;
--glass-blur-radius-extreme: 60px;
--glass-blur-radius-subtle: 20px;
--glass-blur-radius-mobile: 8px;

/* Dynamic — updated by JS on mouse/scroll */
--glass-light-x: 0.5;
--glass-light-y: 0.3;
--glass-light-intensity: 1;
--glass-fresnel: 0.18;
--glass-refraction-shift-x: 0px;
--glass-refraction-shift-y: 0px;
```

## Component Recipes

### Glass Card
```css
background: var(--color-glass);
backdrop-filter: var(--glass-blur);
border: 1px solid var(--color-glass-border);
box-shadow: var(--shadow-glass-medium);
border-radius: var(--radius-2xl);
transition: var(--transition-liquid);
hover: background var(--color-glass-hover), border var(--color-glass-border-hover), translateY var(--state-hover-lift);
```

### Glass Button
```css
background: var(--color-glass-strong);
backdrop-filter: var(--glass-blur);
border: 1px solid var(--color-glass-border-strong);
color: var(--color-text-primary);
border-radius: var(--radius-lg);
transition: var(--transition-fast);
hover: background var(--color-glass-strong-hover);
active: scale var(--state-active-scale);
```

### Primary Button
```css
background: var(--color-primary);
color: var(--color-text-inverse);
border-radius: var(--radius-lg);
transition: var(--transition-fast);
hover: background var(--color-primary-hover), translateY -1px;
active: scale var(--state-active-scale);
```

### Input
```css
background: var(--color-glass);
backdrop-filter: blur(18px) saturate(1.5);
border: 1px solid var(--color-glass-border);
border-radius: var(--radius-lg);
color: var(--color-text-primary);
transition: var(--transition-fast);
focus-within: border var(--color-border-focus), box-shadow var(--shadow-focus);
```

## Liquid Glass React Components

所有玻璃表面必须使用 `components/glass/*` 中的组件，避免手写 CSS glass 类。

### GlassLayer

基础玻璃层。支持 4 种强度与动态光照。

```tsx
import { GlassLayer } from '@/components/glass';

<GlassLayer intensity="default" interactive caustic fresnel specular>
  Content
</GlassLayer>
```

Props:
- `intensity`: `subtle` | `default` | `strong` | `modal`
- `interactive`: hover 时抬起 + 背景变亮
- `caustic`: 焦散色 tint
- `specular`: 顶部镜面高光
- `fresnel`: Fresnel 边缘
- `noise`: 微噪点（默认 true）
- `shadow`: 底部环境阴影（默认 true）
- `dispersion`: 微弱色散（默认 false，保持克制）
- `asChild`: 将玻璃效果合并到唯一子元素上（用于 button/link）
- 动态光照：`trackMouse` `trackScroll` `trackOrientation` `damping` `maxShift` `baseFresnel`

### GlassCard

语义化卡片，替代旧的 `Card`。

```tsx
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from '@/components/glass';

<GlassCard hoverable>
  <GlassCardHeader>
    <GlassCardTitle>家庭记忆</GlassCardTitle>
  </GlassCardHeader>
  <GlassCardContent>...</GlassCardContent>
</GlassCard>
```

### GlassButton

```tsx
import { GlassButton } from '@/components/glass';

<GlassButton variant="primary" size="md">开始对话</GlassButton>
<GlassButton variant="secondary" size="lg">查看全部</GlassButton>
<GlassButton variant="ghost" size="sm">取消</GlassButton>
```

Variants: `primary` | `secondary` | `ghost` | `outline` | `danger`
Sizes: `sm` | `md` | `lg` | `icon`

### Select

```tsx
import { Select } from '@/components/ui/select';

<Select
  label="性别"
  value={gender}
  onChange={(e) => setGender(e.target.value)}
  options={[
    { value: '', label: '不愿透露' },
    { value: 'male', label: '男' },
  ]}
/>
```

### Switch

```tsx
import { Switch } from '@/components/ui/switch';

<Switch checked={enabled} onCheckedChange={setEnabled} />
```

### DOs and DON'Ts

- DO: 用 `GlassCard` 替换所有旧 `Card`。
- DO: 用 `GlassButton` 替换所有旧 `Button` 的玻璃外观场景。
- DO: 保持 `dispersion={false}`，色散只用于特殊强调元素。
- DON'T: 不要手写 `backdrop-filter: blur(...)` 或硬编码玻璃色值。
- DON'T: 不要在同一个页面堆叠超过 3 层不同强度的 glass，避免视觉噪音。
- DON'T: 不要把玻璃放在太亮的背景上，暗色画布是 Liquid Glass 的前提。

## Accessibility Notes

- Primary `#00D4AA` on `#030305`: contrast ~7.5:1, passes WCAG AA.
- Secondary text 60% white on `#030305`: contrast ~6.9:1.
- Tertiary text 38% white on `#030305`: contrast ~4.5:1, 仅用于大号/非关键文案。
- 所有可交互元素必须有可见 focus ring。
- 尊重 `prefers-reduced-motion`，禁用动画并降低 blur。
