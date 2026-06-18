# Plan 009：点击后锁定 target，防止 debugger 横幅导致的布局偏移覆盖选中元素

> **Executor instructions**：严格按照本计划逐步执行，每步执行验证命令并确认预期结果后再继续下一步。若触发"停止条件"，停止并报告，不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **Drift check（开始时先执行）**：
> ```
> git diff --stat 70ee6c4..HEAD -- app/content/select.js app/content/index.js app/background/index.js
> ```
> 预期输出仅 `a5a6a64` 一次提交的改动（即 plan 008 的落地）。若还有额外变更，视为停止条件。

## Status

- **优先级**：P1
- **工作量**：S
- **风险**：LOW
- **依赖**：008（本计划在 008 的 deferred measurement 基础上修补遗漏）
- **分类**：bug
- **计划编写于**：提交 `9e65f35`（HEAD），2026-06-18
- **Issue**：（未通过 `--issues` 发布）

## Why this matters

Plan 008 将元素坐标测量推迟到 debugger 横幅出现之后，思路正确，但遗漏了一个关键问题：

当 `chrome.debugger.attach` 成功后，Chrome 会在页面顶部注入黄色调试横幅。该横幅会**挤占页面空间**，导致页面内容整体下移约 30px。此时用户的鼠标光标**物理位置未动**，但下方对应的 DOM 元素已经变了——浏览器检测到光标下方元素变化，会**自动触发 `mouseover` 事件**。

由于 plan 008 让 `onClick` 不再调用 `teardown()`，`mouseover` 事件监听器仍在活跃状态。这个意外的 `mouseover` 事件会调用 `onMouseOver` → `highlight(newElement)` → **`target = newElement`**，把用户原本点击的 target 覆盖为新元素。后续 `getRect` 测量的是错误元素，导致截图内容与用户预期不符。

**修复**：在 `onClick` 中增加 `locked` 标志，禁止 `mouseover` 和 `wheel` 事件在点击后修改 `target`，直到 `teardown()` 重置。

## Current state

涉及一个文件：`app/content/select.js`。

### `app/content/select.js` — 元素选择状态机

当前代码（plan 008 落地后）如下。

`onMouseOver`（第 46–52 行）—— 无锁定检查：

```javascript
  const onMouseOver = (e) => {
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };
```

`onClick`（第 54–61 行）—— 发送 shot 消息但不锁定：

```javascript
  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    // 仅发送触发信号，坐标由 background 稍后通过 getRect 消息主动获取。
    // 这样可以在 debugger 横幅出现、页面重新布局之后再测量元素位置。
    chrome.runtime.sendMessage({ action: "shot" });
  };
```

`onWheel`（第 71–93 行）—— 通过 `highlight()` 修改 `target`，无锁定检查：

```javascript
  const onWheel = (e) => {
    if (!hoverOrigin) return;

    e.stopPropagation();

    if (e.deltaY < 0) {
      e.preventDefault();
      // 向上滚动 → 父元素
      const nextDepth = depth + 1;
      const parent = getAncestor(hoverOrigin, nextDepth);
      if (parent) {
        depth = nextDepth;
        highlight(parent);
      }
    } else if (e.deltaY > 0) {
      e.preventDefault();
      // 向下滚动 → 子元素
      if (depth > 0) {
        depth--;
        const child = getAncestor(hoverOrigin, depth);
        if (child) {
          highlight(child);
        }
      }
    }
    // deltaY === 0：纯水平 / 缩放 / 惯性 — 让页面自行处理。
  };
```

`teardown`（第 95–103 行）—— 无 `locked` 重置：

```javascript
  const teardown = () => {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("wheel", onWheel);
    removeOverlay();
    target = null;
    hoverOrigin = null;
    depth = 0;
  };
```

**`locked` 变量不存在**于当前代码中。

### 需遵循的仓库约定

- 原生 JavaScript ES Module，箭头函数 `const fn = () => {}`
- 缩进 2 空格，分号，双引号
- 代码风格参考：`app/content/select.js` 现有函数
- 验证命令：`pnpm lint`（Biome）、`pnpm typecheck`（tsc --noEmit）、`pnpm build`（Addfox）

## Commands you will need

| 用途 | 命令 | 成功预期 |
|------|------|----------|
| 安装依赖 | `pnpm install` | exit 0 |
| Lint 检查 | `pnpm lint` | exit 0，无警告 |
| 类型检查 | `pnpm typecheck` | exit 0，无错误 |
| 构建 | `pnpm build` | exit 0，输出到 `.addfox/extension/` |

## Scope

**In scope（允许修改的文件）**：
- `app/content/select.js`

**Out of scope（禁止修改）**：
- `app/content/index.js` — 消息路由，本计划无需改动
- `app/background/index.js` — 截图逻辑，本计划无需改动
- `app/content/styles.css` — 纯样式
- `addfox.config.js` — 构建配置
- 任何其他文件

## Git 工作流

- 分支：`advisor/009-lock-target-after-click`
- 提交信息风格：`fix: <描述>`（与现有历史一致）
- 本计划仅涉及 1 个文件，单次提交
- 不要推送或发起 PR，除非操作者明确指示

## Steps

### Step 1：`select.js` — 新增 `locked` 标志，在 mouseover / wheel 中检查，在 onClick 中设置，在 teardown 中重置

修改 `app/content/select.js`，五处改动。

**改动 A**：在变量声明区（`let target = null` 下方）新增 `locked` 变量：

```javascript
let target = null;
let hoverOrigin = null;
let depth = 0;
let overlayEl = null;
```
改为：
```javascript
let target = null;
let hoverOrigin = null;
let depth = 0;
let overlayEl = null;
let locked = false;
```

**改动 B**：`onMouseOver` 开头增加锁定检查：

```javascript
  const onMouseOver = (e) => {
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };
```
改为：
```javascript
  const onMouseOver = (e) => {
    if (locked) return;
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };
```

**改动 C**：`onClick` 中在 `removeOverlay()` 后增加 `locked = true`：

```javascript
  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    // 仅发送触发信号，坐标由 background 稍后通过 getRect 消息主动获取。
    // 这样可以在 debugger 横幅出现、页面重新布局之后再测量元素位置。
    chrome.runtime.sendMessage({ action: "shot" });
  };
```
改为：
```javascript
  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    // 锁定 target，防止后续 mouseover / wheel 事件（如 debugger 横幅
    // 导致的布局偏移触发意外 mouseover）覆盖掉用户点击时选中的元素。
    locked = true;
    // 仅发送触发信号，坐标由 background 稍后通过 getRect 消息主动获取。
    // 这样可以在 debugger 横幅出现、页面重新布局之后再测量元素位置。
    chrome.runtime.sendMessage({ action: "shot" });
  };
```

**改动 D**：`onWheel` 开头增加锁定检查：

```javascript
  const onWheel = (e) => {
    if (!hoverOrigin) return;

    e.stopPropagation();
```
改为：
```javascript
  const onWheel = (e) => {
    if (locked) return;
    if (!hoverOrigin) return;

    e.stopPropagation();
```

**改动 E**：`teardown` 中增加 `locked = false` 重置（在 `depth = 0` 后加一行）：

```javascript
    target = null;
    hoverOrigin = null;
    depth = 0;
```
改为：
```javascript
    target = null;
    hoverOrigin = null;
    depth = 0;
    locked = false;
```

**Verify**：
```bash
pnpm build
```
→ exit 0，构建成功。

### Step 2：质量校验

```bash
pnpm lint
```
→ exit 0，无 lint 错误。

```bash
pnpm typecheck
```
→ exit 0，无类型错误。

## Test plan

本项目尚无自动化测试框架（plan 004 被跳过），采用手动验证。

**核心验证**（验证本计划修复的 bug）：
1. `pnpm dev` 启动开发服务器，加载扩展到 Chrome
2. 打开一个较长页面（有足够垂直空间的页面，推荐 `https://example.com` 或任意长文章页面）
3. 点击扩展图标 → 悬停到页面**中下部**某个元素 → **点击**触发截图
4. 观察：debugger 横幅出现后，高亮 overlay **不会**重新出现在其他元素上
5. 验证：截图内容精确对应**用户点击时选中的元素**，无误截其他元素
6. 粘贴剪贴板确认截图内容

**高频回归场景**（确保未破坏 plan 007 和 plan 008 的修复）：
- 选择模式下点击 `<a>` 链接元素 → 不跳转（plan 007）
- 选择模式下点击元素 → 截图成功，toast 显示"写入剪贴板成功！"
- 粘贴剪贴板 → 截图内容正确
- `Esc` 退出选择模式 → 正常退出
- 滚轮切换祖先/子元素 → 层级导航正常（点击前）
- 连续两次截图（不同元素）→ 均正常（第二次 `setup()` 重新挂载时 `locked` 已由上一轮 `teardown()` 重置为 `false`）
- 截图页面顶部元素 → 坐标正确（plan 008 的 deferred measurement 仍在生效）

**异常路径验证**：
- 选择模式下点击元素后、在 toast 出现前按 `Esc` → 截图失败（`getRect` 返回 null），toast 显示错误，选择模式正确退出
- 点击后立即滚动滚轮 → 截图仍捕获点击时选中的元素（滚轮被 `locked` 忽略）

## Done criteria

全部必须满足：

- [ ] `pnpm build` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm typecheck` exit 0
- [ ] `git diff --stat` 仅涉及 `app/content/select.js`
- [ ] 手动验证：debugger 横幅出现后，overlay 不会重新出现，截图内容精确对应点击时选中的元素
- [ ] 手动验证：成功/失败 toast 正常显示
- [ ] 手动验证：选择模式正常退出（`Esc`、完成截图后均不残留）
- [ ] 手动验证：滚轮层级导航在**点击前**正常工作
- [ ] `plans/README.md` 中本计划状态行已更新

## STOP conditions

出现以下任一情况请停止并报告：

- drift check 发现 `app/content/select.js` 自 `70ee6c4` 以来有 plan 008 之外的额外变更
- `pnpm build`、`pnpm lint`、`pnpm typecheck` 任一失败，且一次合理修复尝试后仍然失败
- 修改涉及 `app/content/select.js` 以外的任何文件
- 手动验证发现 debugger 横幅出现后 overlay 仍然重新出现（`locked` 未生效）
- 手动验证发现滚轮层级导航在**点击前**不工作（`locked` 检查位置有误）
- 手动验证发现第二次截图时滚轮层级导航不工作（`locked` 未在 teardown 中重置）

## Maintenance notes

- **`locked` 的语义**：`locked` 表示"用户已确认选择，禁止任何事件处理器修改 `target`"。它在 `onClick` 中设为 `true`，在 `teardown` 中重置为 `false`。`setup` 不需要重置——`teardown` 总是先于 `setup` 调用，且 `setup` 时 `locked` 应为 `false`。
- **`locked` 与 `onKeyDown`(Esc) 的交互**：用户点击后按 `Esc`，`onKeyDown` 直接调用 `teardown()`，不经过 `locked` 检查。这是正确的——Esc 是显式取消操作，应始终生效。
- **plan 008 兼容性**：本计划仅在 `select.js` 中增加了保护性检查，不影响 `getRect` 的 deferred measurement 逻辑、content/index.js 的消息路由、background/index.js 的截图流程。两个计划正交叠加。
- **未来考虑**：若后续引入"双击确认"或"截图前预览"等交互，`locked` 标志可作为状态机的一部分扩展。当前实现保持最小化。
