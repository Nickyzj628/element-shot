# 计划 001：修复吐司计时器竞态条件

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **漂移检查（首先运行）**：`git diff --stat d7d3025..HEAD -- app/content/index.js` 应为空。如果非空，将下面的"现状"代码片段与实际文件对比；不匹配时视为"停止条件"。（工作区对其他文件有未提交的修改；这些不影响本计划。）

## 状态

- **优先级**：P1
- **工作量**：S
- **风险**：LOW
- **依赖**：无
- **类别**：bug
- **计划时间**：提交 `d7d3025`，2026-06-17
- **问题**：_未发布_

## 背景与意义

当用户在前一个吐司还在屏幕上的 3 秒窗口内触发第二次截图时，新的吐司会继承旧的 `setTimeout`。旧定时器触发时会把 `.show` 类从*当前*吐司上移除，远早于其自身的 3 秒结束。结果：第二个吐司短暂闪现后消失，而用户期望看到完整的"截图成功"或"截图失败"消息。这是一个小但可见的 UX bug，出现在最常见的双截图流程（失败后重试）。

## 现状

文件：`app/content/index.js`

`showToast` 函数（第 70–86 行）是唯一的吐司渲染器。它创建一个全局 `toastEl`，复用它，并在每次调用时启动新的 `setTimeout`，而不清除上一次的：

```js
// app/content/index.js:65-86
let toastEl = null;
// ...
const showToast = (message, type) => {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "element-shot-toast";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.className = `element-shot-toast ${type}`;

  requestAnimationFrame(() => {
    toastEl.classList.add("show");
  });

  setTimeout(() => {                          // ← 定时器从未被清除
    if (toastEl) {
      toastEl.classList.remove("show");
    }
  }, 3000);
};
```

共享的 `toastEl`（第 4 行）正是问题可见的原因：定时器闭包捕获的是*元素*而非*调用*，所以任何后续定时器都能拿下最新的吐司。

文件中的其他吐司调用点（`app/content/index.js:151-161`，在 `chrome.runtime.onMessage` 内）是唯一的入口，所以与 `toastEl` 同位置的一个定时器句柄就够用 — 无需重构调用点。

## 你将用到的命令

| 用途   | 命令                                  | 预期成功结果 |
|--------|---------------------------------------|--------------|
| 构建   | `pnpm build`                          | 退出 0；`.addfox/extension/extension-chromium/` 重新生成 |
| 清单   | `cat .addfox/extension/extension-chromium/manifest.json \| head -20` | 显示现有清单，版本 1.0.1 |
| 静态检查 | `grep -n "toastEl\|toastTimer" app/content/index.js` | 两条 `toastEl` 引用，一条新的 `toastTimer` 行 |

## 范围

**在范围内**（你应修改的唯一文件）：
- `app/content/index.js`

**不在范围内**（即使看起来相关，也不要触碰）：
- `app/content/styles.css` — bug 是时序问题，不是样式；`.show` 类是契约，不要重命名。
- `showToast` 的调用点（`chrome.runtime.onMessage` switch）— 不需要修改。
- CSS `.element-shot-toast` 过渡时长（0.3s）— 定时器与之独立。

## 步骤

### 步骤 1：在现有 `toastEl` 旁添加一个定时器句柄

在 `toastEl` 旁提升一个 `toastTimer` 变量（文件作用域，第 4 行）。它持有挂起的隐藏定时器。

将 `app/content/index.js:4` 从：

```js
let toastEl = null;
let overlayEl = null;
```

改为：

```js
let toastEl = null;
let toastTimer = null;
let overlayEl = null;
```

**验证**：`grep -n "let toastEl\|let toastTimer\|let overlayEl" app/content/index.js` 按相同顺序显示三行。

### 步骤 2：在安排新定时器前清除上一次的

在 `showToast` 内部，于函数顶部清除任何挂起的定时器，使第二次调用不继承第一次的定时器。然后把新定时器赋值给 `toastTimer`，使句柄始终为最新。

将 `setTimeout(...)` 块（第 83–87 行）替换为：

```js
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    if (toastEl) {
      toastEl.classList.remove("show");
    }
    toastTimer = null;
  }, 3000);
```

**验证**：`grep -n "toastTimer" app/content/index.js` 显示三处引用：步骤 1 中的声明、`clearTimeout` 行、赋值行。

### 步骤 3：构建并确认无回归

**验证**：`pnpm build` 退出 0。输出目录 `.addfox/extension/extension-chromium/content/index.js` 应存在（构建成功时始终存在）。5 秒的手动冒烟测试在此不可自动化；请在提交信息中记录执行者手动加载已解压的扩展、在 2 秒内触发两次截图、并确认两条吐司各自在完整 3 秒窗口内保持可见。

## 测试计划

仓库还没有测试运行器。计划 004 将建立。在本计划中，验证方式是构建 + 手动冒烟测试（记录在提交信息中）。计划 004 落地后，使用存根的 `document` 与 `setTimeout` / `clearTimeout` 添加一个单元测试：

1. 调用 `showToast("a", "success")`。
2. 推进伪造时钟 2000 ms。
3. 调用 `showToast("b", "error")`。
4. 再推进伪造时钟 2000 ms（这样原始定时器本应在 3000 ms 时触发）。
5. 断言 `toastEl` 仍具有 `.show` 类且仍具有 `element-shot-toast error` 类。

测试应位于计划 004 设置 Rstest 之后的 `app/content/toast.test.js`。本计划不添加测试文件 — 保持 diff 小，等待测试运行器。

## 完成标准

- [ ] `pnpm build` 退出 0
- [ ] `grep -n "toastTimer" app/content/index.js` 恰好返回三行（声明、`clearTimeout`、赋值）
- [ ] 未修改其他文件（`git status` 仅显示 `app/content/index.js` 已修改）
- [ ] `plans/README.md` 中 001 的状态行已更新为 DONE

## 停止条件

在以下情况下停止并报告（不要变通）：

- "现状"中 `showToast` 的代码片段与实际文件不匹配（自本计划编写以来代码库已漂移）。
- `pnpm build` 失败，错误不在现有基线中（清理后重跑一次以排除陈旧缓存）。
- 修复似乎需要触碰 `app/content/styles.css` 或任何清单 / background 文件 — 不应如此。
- 你发现吐司也由不同的代码路径渲染（例如，弹窗、devtools 页面）并且同样需要修复 — 那是另一项计划，不是本计划范围蔓延。

## 维护说明

- 如果未来变更从不同入口添加另一个对 `showToast` 的调用（例如，用户将吐司移至弹窗或选项页），定时器句柄仍能工作，因为它局部于内容脚本的 `toastEl`。
- 3000 ms 值在代码中重复出现；如果它之后被暴露为常量，保持 `toastTimer` 紧邻它，使两者保持同步。
