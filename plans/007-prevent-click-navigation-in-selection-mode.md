# Plan 007：在选择模式下阻止点击元素触发页面跳转

> **Executor instructions**：严格按照本计划逐步执行，每步执行验证命令并确认预期结果后再继续下一步。若触发"停止条件"，停止并报告，不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **Drift check（开始时先执行）**：`git diff --stat d5ccad6..HEAD -- app/content/select.js`
> 若 `app/content/select.js` 在此计划编写后被修改过，将"当前状态"中的代码摘录与实时代码对比；若不一致，视为停止条件。

## Status

- **优先级**：P1
- **工作量**：S
- **风险**：LOW
- **依赖**：无（独立修改，不依赖其他计划）
- **分类**：bug
- **计划编写于**：提交 `d5ccad6`，2026-06-18
- **Issue**：（未通过 `--issues` 发布）

## 为什么需要这个修复

在选择元素模式下，用户通过鼠标悬停高亮目标元素，点击左键确认截图。然而当前实现中，click 事件监听器以**冒泡阶段**注册在 `document` 上，这导致事件在到达我们的处理器之前，已经先经过了目标元素的捕获和冒泡阶段——页面上元素自身的 click 处理器和浏览器的默认行为（如 `<a href>` 导航、`<button>` 表单提交、`window.location` 跳转等）会先于我们的拦截逻辑执行。

后果：用户在选取元素时，点击链接型元素会触发页面跳转，打断选择流程，严重影响使用体验。修复后，选择模式下的任何点击都会被**捕获阶段**拦截，点击事件不会传播到页面元素，彻底杜绝意外导航。

## 当前状态

相关文件及角色：

- `app/content/select.js` — 元素选择状态机；包含 `setup()`/`teardown()` 及 `onClick` 处理器（第 61–73 行）。**本计划唯一需修改的文件。**

关键代码摘录（`app/content/select.js`）：

```javascript
// 第 61–73 行：当前的 onClick 处理器
const onClick = (e) => {
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
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

```javascript
// 第 95–99 行：当前的 setup() —— click 以冒泡阶段注册
const setup = () => {
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("click", onClick);           // ← 冒泡阶段，问题所在
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
};
```

```javascript
// 第 101–108 行：当前的 teardown()
const teardown = () => {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click", onClick);        // ← 需同步修改
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("wheel", onWheel);
    removeOverlay();
    target = null;
    hoverOrigin = null;
    depth = 0;
};
```

需遵循的仓库约定：
- 原生 JavaScript ES Module，使用 `const` / 箭头函数风格
- JSDoc 注释用于类型标注（但本次修改无需新增注释）
- 缩进：2 空格
- 字符串：双引号
- 代码风格参考：`app/content/select.js` 本身各函数的现有写法
- 验证命令：`pnpm lint`（Biome）、`pnpm typecheck`（tsc --noEmit）、`pnpm build`（Addfox 构建）

## 你将用到的命令

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
- `app/content/index.js` — 消息路由，与本问题无关
- `app/content/styles.css` — 样式文件
- `app/background/index.js` — 后台脚本，不参与点击拦截
- 任何其他文件

## Git 工作流

- 分支：`advisor/007-prevent-click-navigation`
- 提交信息风格：`fix: <描述>`（遵循项目约定，参考 `git log --oneline -10` 确认）
- 每个逻辑修改分一次提交；本计划仅一处修改，一次提交即可
- 不要推送或发起 PR，除非操作者明确指示

## Steps

### Step 1：将 click 监听器改为捕获阶段注册

修改 `app/content/select.js` 中三处位置：

**位置 1**：`onClick` 函数体内，将 `e.stopPropagation()` 替换为 `e.stopImmediatePropagation()`。

原因：在捕获阶段，`stopImmediatePropagation()` 能同时阻止同元素上其他捕获阶段监听器以及后续所有传播（包括目标阶段和冒泡阶段），比 `stopPropagation()` 更安全。`preventDefault()` 保留作为双重保险（belt-and-suspenders）。

修改前（第 63 行）：
```javascript
    e.stopPropagation();
```
修改后：
```javascript
    e.stopImmediatePropagation();
```

**位置 2**：`setup()` 函数中，将 `document.addEventListener("click", onClick)` 改为捕获阶段。

修改前（第 97 行）：
```javascript
    document.addEventListener("click", onClick);
```
修改后：
```javascript
    document.addEventListener("click", onClick, true);
```

**位置 3**：`teardown()` 函数中，将 `document.removeEventListener("click", onClick)` 同步改为捕获阶段。

修改前（第 103 行）：
```javascript
    document.removeEventListener("click", onClick);
```
修改后：
```javascript
    document.removeEventListener("click", onClick, true);
```

> **注意**：`addEventListener` 的第三个参数 `true` 等价于 `{ capture: true }`。对应的 `removeEventListener` 也必须传入 `true`，否则监听器不会被正确移除，导致内存泄漏。

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

## 测试计划

本项目尚无自动化测试框架（plan 004 被跳过），因此采用手动验证：

1. 运行 `pnpm dev` 启动开发服务器
2. 在 Chrome 中加载 `.addfox/extension/extension-chromium/` 扩展
3. 打开一个包含 `<a>` 链接的页面（例如任意博客、文档站点）
4. 点击扩展图标进入元素选择模式
5. 悬停到链接元素上确认高亮正常
6. **点击链接元素** → 验证：
   - 不会发生页面跳转
   - Toast 提示"写入剪贴板成功！"（若截图成功）
   - 选择模式正常退出
7. 再次进入选择模式，点击普通 `<div>` 或 `<p>` 元素 → 验证截图仍然正常
8. 按 `Esc` → 验证退出选择模式正常
9. 滚轮切换祖先/子元素 → 验证层级导航正常

额外验证（防御性回归）：
- 在带有 `onclick` JS 处理器的元素上点击（例如 `<button onclick="alert(1)">`） → alert 不应弹出，截图正常
- 在 `<form>` 中的 `<button type="submit">` 上点击 → 不应触发表单提交

## Done criteria

全部必须满足：

- [ ] `pnpm build` exit 0
- [ ] `pnpm lint` exit 0
- [ ] `pnpm typecheck` exit 0
- [ ] `git diff --stat` 仅 `app/content/select.js` 被修改
- [ ] 手动验证：选择模式下点击 `<a>` 链接不跳转，截图正常
- [ ] 手动验证：选择模式下 `Esc` 退出、滚轮层级切换均正常
- [ ] `plans/README.md` 中本计划状态行已更新

## STOP conditions

出现以下任一情况请停止并报告：

- drift check 发现 `app/content/select.js` 自 `d5ccad6` 以来有变更，且代码摘录与实时代码不匹配
- `pnpm build` 或 `pnpm lint` 或 `pnpm typecheck` 失败，且一次合理修复尝试后仍然失败
- 修改涉及 `app/content/select.js` 以外的文件
- 手动验证发现捕获阶段拦截导致 click 事件完全无法触发截图流程（例如 `target` 为 null、截图请求未发出）

## Maintenance notes

- 捕获阶段 click 拦截意味着在选择模式下，页面**完全**不会收到任何 click 事件。这是预期行为——选择模式本就是"独占"的操作状态。未来如果需要在选择模式下放行特定类型的点击（如"点击空白处退出"的 UX 改进），需在 `onClick` 中增加条件判断并在满足放行条件时**不调用** `stopImmediatePropagation()`。
- `mouseover` 目前仍以冒泡阶段注册——这是正确的，因为我们需要页面元素正常接收 mouseover 以触发高亮。未来不要将 mouseover 改为捕获阶段，否则可能意外阻止页面的 hover 效果。
- `wheel` 事件已在 plan 002 中修复为仅在 `deltaY !== 0` 时 preventDefault。本计划不改变 wheel 的注册方式。
