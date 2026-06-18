# Plan 010：修复 debugger 附加后截图 x 轴偏移

> **Executor instructions**：严格按照本计划逐步执行，每步执行验证命令并确认预期结果后再继续下一步。若触发"停止条件"，停止并报告，不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **Drift check（开始时先执行）**：
> ```
> git diff --stat HEAD -- app/content/index.js app/background/index.js
> ```
> 若仅 plan 008/009 的改动，继续。若有额外未记录的变更，视为停止条件。

## Status

- **优先级**：P1
- **工作量**：S
- **风险**：LOW
- **依赖**：008、009
- **分类**：bug
- **计划编写于**：提交 `9e65f35`（HEAD），2026-06-18

## Why this matters

Plan 008 将坐标测量推迟到 debugger 附加之后，plan 009 锁定 target 防止覆盖，垂直方向的偏移已修复。但水平方向仍存在 ~15–17px 的向右偏移——恰好等于浏览器原生滚动条宽度。

**根因分析**：`chrome.debugger.attach` + `Page.enable` 会让 Chrome 进入"检查模式"，在此模式下浏览器原生滚动条被隐藏。滚动条消失后视口变宽，页面内容向右偏移。虽然 `getRect()` 在 debugger 附加之后测量，但有两个因素可能导致 x 坐标不准确：

1. **`fromSurface: true` 的坐标系差异**：`fromSurface: true`（当前值，也是默认值）从合成器表面（compositor surface）截取，该表面包含浏览器 UI（滚动条、调试横幅）。当滚动条被隐藏后，surface 尺寸变化，但 `clip` 坐标使用的页面坐标系与 surface 的实际像素映射可能出现偏差。改为 `fromSurface: false` 从"视图"截取（页面内容，不含浏览器 UI），坐标系与 `getBoundingClientRect()` 一致。

2. **单次 rAF 可能不够**：`Page.enable` 触发的滚动条隐藏是异步的（跨进程 IPC），其引发的 layout 重算可能在当前帧之后才完成。单次 `requestAnimationFrame` 仅保证"下一帧之前"，不一定覆盖异步 layout。使用双 rAF 可确保至少一个完整帧周期已过，布局彻底稳定。

## Current state

涉及两个文件。

### `app/content/index.js` — getRect handler（第 48–54 行）

当前使用单次 rAF：

```javascript
    case "getRect":
      // 等待一帧（requestAnimationFrame），确保 debugger 横幅已渲染、
      // 页面已完成重新布局，再测量元素位置。
      requestAnimationFrame(() => {
        const rect = selection.getRect();
        sendResponse(rect);
        selection.teardown();
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
```

### `app/background/index.js` — Page.captureScreenshot 调用（第 53–58 行）

当前使用 `fromSurface: true`：

```javascript
      const { x, y, width, height } = rectData;
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });
```

## Scope

**In scope**：
- `app/content/index.js`
- `app/background/index.js`

**Out of scope**：其他所有文件。

## Steps

### Step 1：content/index.js — 单 rAF 改为双 rAF

将：

```javascript
    case "getRect":
      // 等待一帧（requestAnimationFrame），确保 debugger 横幅已渲染、
      // 页面已完成重新布局，再测量元素位置。
      requestAnimationFrame(() => {
        const rect = selection.getRect();
        sendResponse(rect);
        selection.teardown();
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
```

改为：

```javascript
    case "getRect":
      // 双 rAF：确保 debugger 横幅渲染 + scrollbar 隐藏等异步布局变更
      // 全部完成后再测量元素位置。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = selection.getRect();
          sendResponse(rect);
          selection.teardown();
        });
      });
      return true; // 保持消息通道开启以支持异步 sendResponse
```

**Verify**：
```bash
pnpm build
```
→ exit 0。

### Step 2：background/index.js — `fromSurface: true` 改为 `false`

将：

```javascript
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      });
```

改为：

```javascript
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        clip: { x, y, width, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: false,
      });
```

> **说明**：`fromSurface: false` 从页面"视图"截取（不含浏览器 UI 如滚动条、调试横幅），其坐标系与 `getBoundingClientRect()` 使用的布局视口一致。`captureBeyondViewport: true` 在 `fromSurface: false` 下仍然有效——Chrome 会捕获视图在视口外的部分。

**Verify**：
```bash
pnpm build
```
→ exit 0。

### Step 3：质量校验

```bash
pnpm lint
```
→ exit 0。

```bash
pnpm typecheck
```
→ exit 0。

## Test plan

**核心验证**（本计划修复的 x 轴偏移）：
1. `pnpm dev`，加载扩展到 Chrome
2. 打开一个**有垂直滚动条的长页面**（推荐 `https://developer.mozilla.org/zh-CN/docs/Web/API/Element/getBoundingClientRect`）
3. 点击扩展图标 → 悬停到页面中部偏右的某个元素 → 点击截图
4. 粘贴到图片编辑器 → 放大观察截图左边缘是否精确对齐元素左边缘（无右侧偏移）
5. 同样测试页面顶部、底部的元素

**回归验证**：
- 截图内容精确对应目标元素（无垂直偏移——plan 008）
- debugger 横幅出现后 overlay 不重新出现（plan 009）
- 连续两次截图均正常
- `Esc` 退出正常
- 滚轮层级导航正常（点击前）

## Done criteria

- [ ] `pnpm build` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm typecheck` exit 0
- [ ] `git diff --stat` 仅涉及 `app/content/index.js` 和 `app/background/index.js`
- [ ] 手动验证：截图左边缘精确对齐目标元素左边缘（x 轴无偏移）
- [ ] 手动验证：截图顶边缘精确对齐目标元素顶边缘（y 轴无偏移——plan 008 回归）
- [ ] `plans/README.md` 中本计划状态行已更新

## STOP conditions

- drift check 发现额外未记录变更
- `pnpm build` / `pnpm lint` / `pnpm typecheck` 任一失败
- `fromSurface: false` 导致截图全黑或空白
- `captureBeyondViewport: true` 在 `fromSurface: false` 下失效（无法截取视口外内容）

## Maintenance notes

- **`fromSurface: false` 的取舍**：设为 `false` 后截图不再包含浏览器 UI（调试横幅、滚动条），对用户无影响（clip 区域本就不应包含这些 UI）。若未来需要截取包含浏览器 UI 的整页图，需恢复为 `true` 并额外计算滚动条偏移补偿。
- **双 rAF 的延迟成本**：在 60fps 下，双 rAF 增加约 32ms 的延迟（两帧），用户无感知。
- **与 plan 008 的 `setTimeout(100/500)` 关系**：background 端的 timeout 是兜底延迟，content 端的双 rAF 是精确的"帧完成后"信号。两者重叠不冲突。

## 修订记录 (2026-06-18)

**原方案**（Step 2）将 `fromSurface: true` 改为 `false`，实际执行时 Chrome 返回错误：
> `{code: -32000, message: "Only screenshots from surface are allowed"}`

CDP 在调试模式下强制要求 `fromSurface: true`。

**修订方案**：保持 `fromSurface: true`，改为在 content script 中显式计算滚动条宽度补偿。

原理：点击时（debugger 尚未附加，滚动条可见）记录 `window.innerWidth`；`getRect` 测量时（debugger 已附加，滚动条隐藏）计算 `viewportDelta = 当前innerWidth - 记录值`，从 x 坐标中减去该差值。

改动移到 `app/content/select.js`，无需改 `background/index.js`：
- 新增 `preDebugViewportWidth` 变量
- `onClick` 中记录 `preDebugViewportWidth = window.innerWidth`
- `getRect` 中计算 `viewportDelta` 并调整 x
- `teardown` 中重置为 null

`content/index.js` 的双 rAF 保留，`background/index.js` 回退为 `fromSurface: true`。
