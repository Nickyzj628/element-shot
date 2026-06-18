# 计划 003：仅在选择模式下挂载内容脚本事件监听器

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **漂移检查（首先运行）**：`git diff --stat d7d3025..HEAD -- app/content/index.js` 应为空。如果非空，将下面的"现状"代码片段与实际文件对比；不匹配时视为"停止条件"。计划 001 和 002 也应已落地；它们的 diff 应仅修改 `toastTimer` 行和 wheel 处理器主体。

## 状态

- **优先级**：P2
- **工作量**：M
- **风险**：MED
- **依赖**：计划 001、002（使吐司和滚轮的修复在本次重组时已就位）
- **类别**：tech-debt（也涉及性能）
- **计划时间**：提交 `d7d3025`，2026-06-17
- **问题**：_未发布_

## 背景与意义

`app/content/index.js` 在脚本加载时在 `document` 上注册了四个全局事件监听器（`mouseover`、`click`、`keydown`、`wheel`），并在页面整个生命周期内保持挂载。它们在 `!isSelecting` 时短路，但短路仍然是每次事件都要执行的工作 — 而 `mouseover` 在页面上**每一次指针移动**都会触发。在一个长生命周期的页面上（例如挂了好几小时的文档站），为了随时能响应一次扩展图标点击，我们付出了非零的性能税。

最干净的修复是：在用户真正进入选择模式时挂载监听器（`chrome.runtime.onMessage` 的 `select` 分支），在选择结束时（成功、Escape、错误）解绑。重构后，唯一持久化的监听器是 `chrome.runtime.onMessage` 本身，这是 Chrome 在同一标签页内的导航之间保持内容脚本"存活"所需要的。

本次重构还把模块的状态收拢到一个对象中，使新的辅助函数可以显式接收状态而不是闭包到模块级 `let` 变量 — 这是为计划 004 落地后的可测试性而做的小但持久的胜利。

## 现状

文件：`app/content/index.js`（完整文件 166 行，引用关键部分）：

状态（第 1–7 行）：

```js
import "./styles.css";

let isSelecting = false;
let target = null;
let hoverOrigin = null;
let depth = 0;
let toastEl = null;
let overlayEl = null;
```

DOM 辅助函数（第 9–55 行）：`getOverlay`、`removeOverlay`、`getAncestor`、`highlight`、`resetSelection`、`shot`、`showToast`。

监听器注册（第 88–149 行）：四个 `document.addEventListener` 调用，处理器主体以 `isSelecting`（或 `isSelecting && target` / `isSelecting && hoverOrigin`）为门。

`chrome.runtime.onMessage`（第 151–166 行）：唯一的跨上下文钩子；`select` 分支将 `isSelecting = true`。

"始终挂载"模式就是问题所在。页面上每一次 `mouseover`（频率极高）和每一次 `keydown` 都会穿过我们的门。

## 你将用到的命令

| 用途   | 命令                                  | 预期成功结果 |
|--------|---------------------------------------|--------------|
| 构建   | `pnpm build`                          | 退出 0 |
| 静态   | `grep -n "addEventListener\|removeEventListener" app/content/index.js` | 4 处 `addEventListener` + 1 处新 `chrome.runtime.onMessage` + 4 处新 `removeEventListener` |
| 冒烟   | 手动：加载已解压扩展，进入选择，悬停，点击，Escape | 四条路径全部正常 |

## 范围

**在范围内**：
- `app/content/index.js` — 监听器注册方式的整体重构。
- 可选但推荐：把文件拆分为 `app/content/index.js`（入口，约 30 行）与 `app/content/select.js`（选择状态机 + 监听器）。这与 Addfox 为 popup 页生成的结构一致；扩展规模也允许保留单文件。

**不在范围内**（不要触碰）：
- `app/content/styles.css` — 类名是契约；不要重命名。
- `app/background/index.js` — 其请求流没问题。
- `addfox.config.js` — 基于文件路径的内容入口已正确。
- 吐司行为（保持不变；其生命周期从"始终挂载"改为"按需创建"**不**属于本计划 — 见"停止条件"）。

## 步骤

### 步骤 1：将选择状态提取为 `createSelection` 工厂

用工厂函数替换模块级 `let`（第 3–7 行）和 `resetSelection` 函数（第 45–51 行），工厂返回状态对象加上四个监听器。工厂位于文件顶部（或如果你选择拆分，则位于新的 `app/content/select.js` 中）。

形态：

```js
const createSelection = () => {
  let target = null;
  let hoverOrigin = null;
  let depth = 0;
  let overlayEl = null;

  const getOverlay = () => {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.className = "element-shot-overlay";
      document.body.appendChild(overlayEl);
    }
    return overlayEl;
  };

  const removeOverlay = () => {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  };

  const highlight = (element) => {
    target = element;
    const rect = element.getBoundingClientRect();
    const overlay = getOverlay();
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };

  const onMouseOver = (e) => {
    e.stopPropagation();
    const element = e.target;
    if (element === target) return;
    hoverOrigin = element;
    depth = 0;
    highlight(element);
  };

  const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    removeOverlay();
    const rect = target.getBoundingClientRect();
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

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      teardown();
    }
  };

  const onWheel = (e) => {
    if (!hoverOrigin) return;
    e.stopPropagation();
    if (e.deltaY < 0) {
      e.preventDefault();
      const nextDepth = depth + 1;
      const parent = getAncestor(hoverOrigin, nextDepth);
      if (parent) {
        depth = nextDepth;
        highlight(parent);
      }
    } else if (e.deltaY > 0) {
      e.preventDefault();
      if (depth > 0) {
        depth--;
        const child = getAncestor(hoverOrigin, depth);
        if (child) highlight(child);
      }
    }
  };

  const teardown = () => {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("wheel", onWheel);
    removeOverlay();
    target = null;
    hoverOrigin = null;
    depth = 0;
  };

  const setup = () => {
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
  };

  return { setup, teardown };
};
```

工厂返回 `{ setup, teardown }` — 正是消息处理器所需的两个函数。

将现有的 `getAncestor` 辅助函数保留在模块作用域（它是纯函数且无状态），或移到 `createSelection` 旁；任选其一皆可。

**验证**：`grep -n "let target\|let hoverOrigin\|let depth" app/content/index.js` 在模块作用域无匹配（三者现在都在工厂内部）。

### 步骤 2：用单个 `chrome.runtime.onMessage` switch 替换四个顶层 `addEventListener` 调用

新的顶层结构：

```js
import "./styles.css";
import { createSelection } from "./select.js";   // 仅当你选择拆分时

const showToast = /* 与当前代码（或计划 001 的输出）保持不变 */;
const selection = createSelection();

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

注意：吐司应按需创建（非模块加载时）。如果你想在同一计划中做此修改，请做；否则全局 `toastEl` 暂时保留。

**验证**：`grep -n "document.addEventListener" app/content/index.js` 返回 0。`grep -n "document.addEventListener" app/content/select.js`（或选择块）返回 4，均在 `setup()` 内。

### 步骤 3：构建并确认无回归

**验证**：`pnpm build` 退出 0。手动冒烟测试（记录在提交信息中）：

1. 打开任意页面，点击扩展图标，悬停 — 浮层跟随指针。✓
2. 点击一个元素 — 吐司显示，浮层消失，监听器已解绑（在 devtools 中通过 `document.getEventListeners && console.log(...)` 确认无残留，或直接触发一个滚轮事件观察页面滚动）。
3. 再次点击扩展图标，按 Esc — 浮层消失，监听器解绑，滚轮可正常滚动页面。
4. 打开 background service worker 控制台 — 整个流程无错误。

## 测试计划

尚无测试运行器（计划 004）。计划 004 落地后，工厂让这部分测试变得轻而易举。单元测试可：

1. 在存根的 `document` 上构造 `createSelection()`，并对 `addEventListener` / `removeEventListener` 注入 spy。
2. 调用 `setup()`，派发合成的 `MouseEvent` "mouseover"，断言 `highlight` 被调用。
3. 调用 `teardown()`，再派发 `MouseEvent`，断言无后续 `highlight` 调用。
4. 连续调用 `teardown()` 两次 — 断言不报错（幂等性）。

本计划不添加测试文件 — 保持 diff 聚焦于重构。

## 完成标准

- [ ] `pnpm build` 退出 0
- [ ] `grep -nc "document.addEventListener" app/content/index.js` 返回 0
- [ ] `grep -nc "document.removeEventListener" app/content/index.js`（若拆分还包括 `select.js`）返回 4
- [ ] 手动冒烟测试（悬停、点击、Escape、滚轮）行为与之前一致
- [ ] `plans/README.md` 中 003 的状态行已更新为 DONE

## 停止条件

在以下情况下停止并报告（不要变通）：

- "现状"片段与实际文件不匹配（计划 001、002 落地后，wheel 处理器和 `toastTimer` 行应是相对本计划基线的唯一差异）。
- 你发现吐司在用户进入选择模式前就需可见（例如权限被拒的通知）— 这要求保留全局 `toastEl`，是另一项计划。
- 工厂因不明确的原因需要跨文件暴露（例如另一个内容脚本 import 它）。不要投机性拆分文件；对本项目规模来说单文件就够。
- `pnpm build` 失败，错误不在基线中。清理 `.addfox/cache` 后再跑一次，然后报告。
- 用户希望即便不在选择模式也保持 `mouseover` 监听器挂载（例如显示悬停提示）— 停止，这是产品决策。

## 维护说明

- 重构后，`chrome.runtime.onMessage` 监听器是内容脚本中唯一长寿的部分。如果未来某项功能希望内容脚本在后台做事（例如 `chrome.storage.onChanged` 监听器），应在同一工厂模式或其自身的 `setup` / `teardown` 中挂载。
- 评审者应验证 `teardown` 在每条退出路径都被调用：`onClick`（成功截图后）、`onKeyDown`（Escape）。如果未来提交添加了第三条退出路径（例如超时、失焦），它也必须调用 `teardown()` — 否则陈旧的监听器会跨选择累积。
- `teardown` 解绑以 `{ passive: false }` 添加的 `wheel` 监听器；`removeEventListener` 不需要相同的 options 对象（这是规范允许的），所以这种非对称签名是正常的。
