# 计划 002：停止滚轮处理器在水平手势上阻止页面滚动

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **漂移检查（首先运行）**：`git diff --stat d7d3025..HEAD -- app/content/index.js` 应为空。如果非空，将下面的"现状"代码片段与实际文件对比；不匹配时视为"停止条件"。

## 状态

- **优先级**：P1
- **工作量**：S
- **风险**：LOW
- **依赖**：无
- **类别**：bug
- **计划时间**：提交 `d7d3025`，2026-06-17
- **问题**：_未发布_

## 背景与意义

滚轮处理器在选择模式下无条件调用 `e.preventDefault()`。这会阻止页面在**垂直**轴上滚动（这是设计意图 — 用户用滚轮在祖先链之间切换，而非滚动页面），但它同时也会阻止**水平**滚动以及任何纯 `deltaX` 的触控板手势。在精确触控板上，"两指横向滑动"会触发 `deltaX ≠ 0` 且 `deltaY === 0` 的滚轮事件；当前代码会吞掉它们，所以用户在选择元素时无法水平滚动宽页面。修复方式是：只有在我们真正消费了手势时才调用 `preventDefault`。

## 现状

文件：`app/content/index.js`，第 123–149 行：

```js
document.addEventListener("wheel", (e) => {
  if (!isSelecting || !hoverOrigin) return;

  e.preventDefault();             // ← 始终触发，即使我们什么也不做
  e.stopPropagation();

  if (e.deltaY < 0) {
    // 向上滚动 → 父元素
    const nextDepth = depth + 1;
    const parent = getAncestor(hoverOrigin, nextDepth);
    if (parent) {
      depth = nextDepth;
      highlight(parent);
    }
  } else if (e.deltaY > 0) {
    // 向下滚动 → 子元素
    if (depth > 0) {
      depth--;
      const child = getAncestor(hoverOrigin, depth);
      if (child) {
        highlight(child);
      }
    }
  }
}, { passive: false });
```

在选择模式下，滚轮事件有三种相关情况：

1. `e.deltaY < 0`（垂直向上滚动）：扩展接管。`preventDefault` 正确。
2. `e.deltaY > 0`（垂直向下滚动）：扩展接管。`preventDefault` 正确。
3. `e.deltaY === 0`（纯水平、缩放、纯惯性）：扩展**什么也不做**。`preventDefault` 错误 — 它会阻塞页面的自然水平滚动。

处理器在整个页面生命周期内都挂载在 `document` 上，所以即使在用户**未**选择时，门控检查 `if (!isSelecting || !hoverOrigin) return;` 已短路，页面正常滚动。Bug 专门出现在选择模式下的 `deltaY === 0` 情况。

## 你将用到的命令

| 用途   | 命令                                  | 预期成功结果 |
|--------|---------------------------------------|--------------|
| 构建   | `pnpm build`                          | 退出 0 |
| 静态检查 | `grep -n "preventDefault\|deltaY" app/content/index.js` | 三条 deltaY 行，三处 preventDefault（click、keydown、wheel）— 本计划后：四处（每个 wheel 分支各一） |

## 范围

**在范围内**（你应修改的唯一文件）：
- `app/content/index.js`

**不在范围内**（即使看起来相关，也不要触碰）：
- `mouseover`、`click`、`keydown` 监听器 — 它们正确地使用 `e.stopPropagation()`，因为扩展消费了这些事件。只有 wheel 处理器条件错误。
- `getAncestor` 辅助函数 — 无关。
- 添加 `useCapture: true` 或以其他方式改变监听器运行阶段 — 超出范围，会以微妙方式改变行为。

## 步骤

### 步骤 1：仅在实际使用手势时调用 `preventDefault`

将 `e.preventDefault()` 调用移到两个作用于 `deltaY` 的分支内。`stopPropagation` 调用应保持原位（位于顶部、门控之后），使页面永远看不到我们的滚轮事件。

将处理器主体（第 125–148 行）替换为：

```js
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
```

**验证**：`grep -n "preventDefault" app/content/index.js` 显示 wheel 处理器内两处调用（每个分支各一）、`click` 处理器一处（基线第 106 行）、`keydown` Escape 分支一处（基线第 117 行）。合计：四处。

### 步骤 2：构建并确认无回归

**验证**：`pnpm build` 退出 0。手动冒烟测试（记录在提交信息中）：

1. 加载已解压的扩展。
2. 打开宽页面（例如带有水平滚动容器的文档站），点击扩展图标进入选择模式。
3. 在触控板上两指横向滑动 — 页面应水平滚动。修复前不会。
4. 在触控板上两指纵向滑动 — 选择仍应在祖先 / 子代之间切换，且页面**不**会垂直滚动。修复前后这一行为不变。

## 测试计划

还没有测试运行器（计划 004）。计划 004 落地后，添加一个单元测试：在存根的 `document` 上挂载 wheel 监听器，派发一个合成的 `WheelEvent`（`{ deltaY: 0, deltaX: 5, cancelable: true }`），然后断言：

- `event.defaultPrevented === false`
- 没有调用 `highlight`（即祖先链未变）。

本计划不添加测试文件 — 保持 diff 小，等待测试运行器。

## 完成标准

- [ ] `pnpm build` 退出 0
- [ ] `grep -nc "preventDefault" app/content/index.js` 返回 4（wheel 上行分支、wheel 下行分支、click 处理器、keydown Escape 分支）
- [ ] `grep -nc "stopPropagation" app/content/index.js` 与基线相同（4：mouseover、click、keydown、wheel）
- [ ] 未修改其他文件（`git status` 仅显示 `app/content/index.js` 已修改）
- [ ] `plans/README.md` 中 002 的状态行已更新为 DONE

## 停止条件

在以下情况下停止并报告（不要变通）：

- 实际文件中的 wheel 处理器与"现状"片段不匹配（代码库已漂移）。
- 修复需要同时移动 `stopPropagation` — 设计是：选择期间我们*总是*阻止冒泡，只有 `preventDefault` 是有条件的；不要混淆两者。
- 后续提交添加了另一个也需要 `preventDefault` 的分支（例如 Ctrl+wheel 缩放处理器）。停止并报告 — 扩展此策略是另一项计划。
- 你发现同一监听器家族中的另一个事件（触控板捏合等）有同样的"我们不消费但仍取消它"问题。停止并报告 — 将本计划严格限定于 wheel 事件。

## 维护说明

- 如果扩展之后添加 `Ctrl+wheel` 缩放或 `Shift+wheel` 水平祖先切换，则必须重新评估 `preventDefault` 策略：新分支需要自己的 `preventDefault`（已有两个不变）。
- 评审者应验证 `e.stopPropagation()` 仍在 `deltaY === 0` 情况下触发 — 按设计，页面不应看到我们的滚轮事件，即使我们不消费它们。这避免了未来某版本的页面在 document 级别监听滚轮事件时出现双重处理。
