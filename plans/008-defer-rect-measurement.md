# Plan 008：将元素坐标测量推迟到 debugger 横幅出现之后

> **Executor instructions**：严格按照本计划逐步执行，每步执行验证命令并确认预期结果后再继续下一步。若触发"停止条件"，停止并报告，不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **Drift check（开始时先执行）**：
> ```
> git diff --stat 70ee6c4..HEAD -- app/content/select.js app/content/index.js app/background/index.js
> ```
> 若上述三个文件在此计划编写后被修改过，将"当前状态"中的代码摘录与实时代码对比；若不一致，视为停止条件。

## Status

- **优先级**：P1
- **工作量**：M
- **风险**：MED
- **依赖**：无
- **分类**：bug
- **计划编写于**：提交 `70ee6c4`，2026-06-18
- **Issue**：（未通过 `--issues` 发布）

## Why this matters

当前截图流程中，content script 在点击时**立即**测量元素的 `getBoundingClientRect()` 并发送坐标给 background，然后 background 才 `chrome.debugger.attach`。attach 成功后 Chrome 会在页面顶部显示黄色的"Element Shot 已开始调试此浏览器"横幅，该横幅会**挤占视口空间**，导致页面内容整体下移。但此时截图使用的坐标是横幅出现**之前**测量的，造成截图区域相对于目标元素向上偏移——用户看到的是元素上方等高度的无关内容，而非目标元素本身。

修复后，坐标测量推迟到 debugger 横幅出现、页面完成重新布局（reflow）**之后**进行。截图区域将与用户看到的目标元素精确吻合。

## Current state

涉及三个文件，当前代码摘录如下。

### `app/content/select.js` — 元素选择状态机

第 55–75 行 `onClick`：点击时立即测量坐标、发送含坐标的 `shot` 消息、然后调用 `teardown()` 清理：

```javascript
  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    const rect = target.getBoundingClientRect();
    // 转换为文档绝对坐标，以支持超出视口的元素截图
    chrome.runtime.sendMessage({
      action: "shot",
      data: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
    });
    teardown();   // ← 立即清理，background 再也拿不到 target
  };
```

第 101–116 行 `teardown` / `setup`：

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

  const setup = () => {
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
  };

  return { setup, teardown };
```

当前 `createSelection()` 只暴露 `{ setup, teardown }`，未暴露 target 引用。

### `app/content/index.js` — content script 入口（消息路由）

第 26–37 行：当前消息监听不接收 `sendResponse`，也不处理 `getRect` / `teardown` 消息：

```javascript
chrome.runtime.onMessage.addListener((message) => {
  const { action, data } = message;

  switch (action) {
    case "select":
      selection.setup();
      break;
    case "success":
      showToast(data, "success");
      break;
    case "error":
      showToast(data, "error");
      break;
  }
});
```

### `app/background/index.js` — Service Worker（截图执行）

第 30–59 行 `capture()` 函数：直接从 `data` 取坐标截图，未等待 debugger 横幅：

```javascript
  const capture = async () => {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      const { x, y, width, height } = data;  // ← 这是横幅出现前的旧坐标
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: writeBase64ToClipboard,
        args: [result.data],
      });

      const res = injectionResult?.result;
      if (res?.ok) {
        sendMessage("success", res.message);
      } else {
        sendMessage("error", res?.message || "未知错误");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[background] capture error:", msg);
      sendMessage("error", `截图失败：${msg}`);
    } finally {
      capturingTabs.delete(tabId);
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
  };
```

### 需遵循的仓库约定

- 原生 JavaScript ES Module，箭头函数 `const fn = () => {}`
- 缩进 2 空格，分号，双引号
- 跨上下文消息格式：`{ action: string, data?: any }`
- 代码风格参考：`app/background/index.js` 的 `capture()` 函数和 `app/content/select.js` 的现有函数
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
- `app/content/index.js`
- `app/background/index.js`

**Out of scope（禁止修改）**：
- `app/content/styles.css` — 纯样式，无关
- `addfox.config.js` — 构建配置
- `app/global.d.ts` — 类型声明
- 任何其他文件

## Git 工作流

- 分支：`advisor/008-defer-rect-measurement`
- 提交信息风格：`fix: <描述>`（与现有历史一致，参考 `70ee6c4 fix: 选择模式下拦截元素的点击事件（阻止页面跳转）`）
- 本计划涉及 3 个文件但逻辑紧密耦合，一次提交
- 不要推送或发起 PR，除非操作者明确指示

## Steps

### Step 1：`select.js` — onClick 不再发送坐标、不再 teardown；新增 getRect()

修改 `app/content/select.js`，三处改动：

**改动 A**：`onClick` 中去掉坐标测量和 `teardown()` 调用，只发送不含 data 的触发消息。保留 `removeOverlay()`（视觉反馈：高亮消失）和事件阻止。

将第 55–75 行：
```javascript
  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    removeOverlay();
    const rect = target.getBoundingClientRect();
    // 转换为文档绝对坐标，以支持超出视口的元素截图
    chrome.runtime.sendMessage({
      action: "shot",
      data: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
    });
    teardown();
  };
```
改为：
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

**改动 B**：在 `onClick` 下方（`onKeyDown` 之前）新增 `getRect` 方法：

```javascript
  const getRect = () => {
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  };
```

**改动 C**：`return { setup, teardown }` 增加导出 `getRect`：

```javascript
  return { setup, teardown, getRect };
```

**Verify**：
```bash
pnpm build
```
→ exit 0，构建成功。

### Step 2：`index.js`（content）— 新增 getRect / teardown 消息处理

修改 `app/content/index.js`，让消息监听器接收 `sendResponse` 参数并处理两条新消息。

将第 26–37 行：
```javascript
chrome.runtime.onMessage.addListener((message) => {
  const { action, data } = message;

  switch (action) {
    case "select":
      selection.setup();
      break;
    case "success":
      showToast(data, "success");
      break;
    case "error":
      showToast(data, "error");
      break;
  }
});
```
改为：
```javascript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, data } = message;

  switch (action) {
    case "select":
      selection.setup();
      break;
    case "success":
      showToast(data, "success");
      break;
    case "error":
      showToast(data, "error");
      break;
    case "getRect":
      // 等待一帧（requestAnimationFrame），确保 debugger 横幅已渲染、
      // 页面已完成重新布局，再测量元素位置。
      requestAnimationFrame(() => {
        const rect = selection.getRect();
        sendResponse(rect);
        selection.teardown();
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
    case "teardown":
      selection.teardown();
      break;
  }
});
```

> **关键说明**：`return true` 是 Chrome Extension API 的要求——当 `sendResponse` 需要异步调用（如 rAF 回调中）时，监听器必须同步返回 `true` 以保持消息通道开启。不返回 `true` 则通道立即关闭，`sendResponse` 无效。

**Verify**：
```bash
pnpm build
```
→ exit 0。

### Step 3：`index.js`（background）— 延迟获取坐标、添加 teardown 通知

修改 `app/background/index.js` 的 `capture()` 函数。

**改动 A**：在 `chrome.debugger.attach` + `Page.enable` 之后，不再从 `data` 直接取坐标。改为：
1. `setTimeout` 100ms 等待横幅渲染
2. 向 content script 发送 `{ action: "getRect" }` 请求新坐标
3. 若获取失败（返回 null），发送错误并通知 content 清理

将 `capture` 函数（第 30–59 行）的 try 块内部替换。修改前：
```javascript
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      const { x, y, width, height } = data;
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: writeBase64ToClipboard,
        // @ts-expect-error sendCommand 返回类型根据命令不同而变化，@types/chrome 声明为通用 object
        args: [result.data],
      });

      const res = injectionResult?.result;
      if (res?.ok) {
        sendMessage("success", res.message);
      } else {
        sendMessage("error", res?.message || "未知错误");
      }
    } catch (err) {
```
改为：
```javascript
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");

      // 等待一帧让 debugger 横幅渲染、页面完成重新布局
      await new Promise((r) => setTimeout(r, 100));

      // 向 content script 请求横幅出现后的元素坐标
      const rectData = await chrome.tabs.sendMessage(tabId, { action: "getRect" });
      if (!rectData) {
        sendMessage("error", "截图取消或目标元素已失效");
        return;
      }

      const { x, y, width, height } = rectData;
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });

      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId },
        func: writeBase64ToClipboard,
        // @ts-expect-error sendCommand 返回类型根据命令不同而变化，@types/chrome 声明为通用 object
        args: [result.data],
      });

      const res = injectionResult?.result;
      if (res?.ok) {
        sendMessage("success", res.message);
      } else {
        sendMessage("error", res?.message || "未知错误");
      }
    } catch (err) {
```

**改动 B**：在 `finally` 块中，detach debugger 之前，通知 content script 清理选择状态（防止异常路径下 content 端选择模式残留）：

将 finally 块：
```javascript
    } finally {
      capturingTabs.delete(tabId);
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
```
改为：
```javascript
    } finally {
      capturingTabs.delete(tabId);
      // 通知 content script 清理选择状态（无论成功或失败）
      chrome.tabs.sendMessage(tabId, { action: "teardown" }, () => {
        void chrome.runtime.lastError;
      });
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_e) {
        // 可能已经是 detached 状态，忽略错误
      }
    }
```

**改动 C**：由于 `data` 参数不再使用（坐标改为运行时获取），可清理 `chrome.runtime.onMessage` 监听器中第 12 行的解构。将：
```javascript
  const { action, data } = message;
  if (action !== "shot") return;
```
改为：
```javascript
  const { action } = message;
  if (action !== "shot") return;
```

> **注意**：`chrome.tabs.sendMessage` 在 MV3 中返回 Promise。若 content script 的 `getRect` 处理器正确返回 `true` 并调用 `sendResponse`，此 Promise 将 resolve 为 rect 数据。若 content script 未加载或未响应，Promise 将 reject，被外层 `catch` 捕获，走错误提示路径。

**Verify**：
```bash
pnpm build
```
→ exit 0，构建成功。

### Step 4：质量校验

```bash
pnpm lint
```
→ exit 0，无 lint 错误。

```bash
pnpm typecheck
```
→ exit 0，无类型错误。

## Test plan

本项目尚无自动化测试框架（plan 004 被跳过），采用手动验证：

**核心验证**（验证本计划修复的 bug）：
1. `pnpm dev` 启动开发服务器
2. 加载扩展到 Chrome
3. 打开一个较长页面（有足够垂直空间，底部有元素的页面）
4. 点击扩展图标 → 悬停到页面底部某个元素 → **点击**触发截图
5. 验证：截图内容精确对应所选元素，无误截上方空白或偏移内容
6. 打开一个顶部有元素的页面，同样验证截图位置精确

**回归验证**（确保未破坏现有功能）：
- 选择模式下点击元素 → 截图成功，toast 显示"写入剪贴板成功！"
- 粘贴剪贴板 → 截图内容正确
- `Esc` 退出选择模式 → 正常退出
- 滚轮切换祖先/子元素 → 层级导航正常
- 连续两次截图（不同元素）→ 均正常
- 截图 `<a>` 链接元素 → 不跳转（plan 007 修复仍然有效）

**异常路径验证**：
- 点击后立即按 `Esc` → 截图可能失败（target 已清除），但不会导致扩展崩溃或选择模式残留

## Done criteria

全部必须满足：

- [ ] `pnpm build` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm typecheck` exit 0
- [ ] `git diff --stat` 仅涉及 `app/content/select.js`、`app/content/index.js`、`app/background/index.js`
- [ ] 手动验证：debugger 横幅出现后，截图内容精确对应目标元素（无偏移）
- [ ] 手动验证：成功/失败 toast 正常显示
- [ ] 手动验证：选择模式正常退出（`Esc`、完成截图后均不残留）
- [ ] `plans/README.md` 中本计划状态行已更新

## STOP conditions

出现以下任一情况请停止并报告：

- drift check 发现三个 in-scope 文件自 `70ee6c4` 以来有变更，且代码摘录与实时代码不匹配
- `pnpm build`、`pnpm lint`、`pnpm typecheck` 任一失败，且一次合理修复尝试后仍然失败
- 修改涉及三个 in-scope 文件以外的任何文件
- 手动验证发现 `getRect` 消息始终返回 `null`（target 在 rAF 回调前已被清除）
- 手动验证发现截图区域持续偏差（说明 `setTimeout(100)` 或 `rAF` 延迟不足以等待横幅渲染完成）

## Maintenance notes

- **`setTimeout(100)` 的延迟量**：当前选 100ms 作为安全余量。debugger 横幅是同步显示的（`attach` 调用后立即可见），页面 reflow 也是同步的，理论上 `setTimeout(0)` 就足够。若未来发现 100ms 在某些机器/页面上不够（例如页面有复杂布局导致 reflow 耗时 >100ms），可适当增大。相反，若用户反馈截图有明显延迟感，可减小到 50ms 或改用 `Page.domContentEventFired` 等更精确的信号。
- **content script rAF 与 background setTimeout 的双重等待**：content 端 `requestAnimationFrame` 保证至少一个渲染帧已过去（页面已 paint），background 端 `setTimeout(100)` 是兜底延迟。两者重叠不冲突——rAF 是精确的"一帧"，setTimeout 是保守的"确保横幅已显示"。未来可考虑精简为一处。
- **`getRect` 返回 null 的处理**：当前在 background 中判断 `if (!rectData)` 并发送错误。若未来增加更复杂的错误恢复（如重试），可在此处扩展。
- **plan 007 兼容性**：`onClick` 中仍保留 `e.stopImmediatePropagation()` 和 `preventDefault()`，捕获阶段拦截不受本计划影响。
- **消息通道生命周期**：content script 的 `chrome.runtime.onMessage` 监听器注册在顶层（非 selection 生命周期内），因此 `selection.teardown()` 不会影响消息接收能力。`getRect` 和 `teardown` 消息可以在 selection 已 teardown 后安全处理（`getRect` 返回 null，`teardown` 是幂等操作）。
