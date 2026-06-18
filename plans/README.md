# 实施计划 — element-shot

由 `improve` 技能于 2026-06-17 基于提交 `d7d3025`（HEAD）生成。工作区中 `addfox.config.js`、`app/background/index.js` 和 `CLAUDE.md` 有尚未提交的本地修改，这些已在上文"当前状态"中体现。

本仓库是一个微型 Chrome MV3 扩展（源码约 280 行：`app/background/index.js` 74 行，`app/content/index.js` 166 行，CSS 40 行），功能是将元素截图保存到剪贴板。它使用 Addfox 0.1.1 框架（基于 Rsbuild），原生 ES Module，无 TypeScript，无测试运行器，无 lint 配置。Git 历史（自 2025-05-16 起的 16 次提交）显示这是一个正在持续打磨的小型项目。

开始前请完整阅读每个计划；遵守其"停止条件"；完成后更新对应的状态行。

## 执行顺序与状态

| 计划 | 标题 | 优先级 | 工作量 | 依赖 | 状态 |
|------|------|--------|--------|------|------|
| 001  | 修复吐司计时器竞态条件 | P1 | S | — | DONE |
| 002  | 停止滚轮处理器在水平手势上阻止页面滚动 | P1 | S | — | TODO |
| 003  | 仅在选择模式下挂载内容脚本事件监听器 | P2 | M | 001, 002 | TODO |
| 004  | 建立单元测试基线（Rstest + chrome API 模拟） | P2 | M | — | TODO |
| 005  | 在 package.json 中添加 lint 和 typecheck 脚本 | P3 | S | — | TODO |

状态值：TODO | IN PROGRESS | DONE | BLOCKED（附一行原因） | REJECTED（附一行理由）。

## 依赖说明

- 003 应在 001 和 002 之后落地，因为本次重构会重新组织吐司重置路径；先做小的 bug 修复便于评审。
- 004 和 005 独立于 001–003，可按任意顺序；建议在 003 之前完成，因为 003 引入的新辅助模块受益于测试覆盖。
- 004 和 005 都修改 `package.json` — 分两次提交，保持 diff 易评审。

## 已审议但拒绝的发现

- **`<all_urls>` 主机权限**（安全，MED）：Addfox 最佳实践建议将 `host_permissions` 收窄到不包含 `<all_urls>`，但本扩展的全部用途就是在任何页面上工作；内容脚本的 `matches` 与 `chrome.debugger` / `chrome.scripting` 的主机范围都合理地需要它。重构以去掉 `<all_urls>` 是一项重大的功能权衡，不是 bug。
- **消息缺少 `from` 字段**（消息传递，LOW）：Addfox 消息传递规则建议使用 `{ from: "background" }` / `{ from: "content" }`。这是一个小清晰度提升，但对一个两上下文项目并非关键 — 留给未来清理，不做计划。
- **`pnpm audit` 中 `addfox` 0.1.1 的传递性漏洞**：全部仅在开发期相关（lint 插件、构建工具）。漏洞真实但应通过升级 `addfox` 自身解决，而非给传递依赖打补丁。本次审查范围之外。
- **缺少 `editorconfig`、`CHANGELOG`、CI 配置**：对一个 16 次提交的私人项目影响较低。不做计划。
- **吐司 / UI 中硬编码的中文字符串**（i18n，LOW 方向）：项目明显是维护者个人面向中文用户的工具；i18n 是产品决策，不是修复。

## 方向（暂不规划）

- **高 DPI 截图保真度（DIR-01）**。`Page.captureScreenshot` 在 `app/background/index.js:42-48` 中以 `scale: 1` 调用，忽略 `window.devicePixelRatio`。在 Retina / HiDPI 显示屏上，最终 PNG 在物理上会比用户看到的元素更小。一个调研计划应考察是否向 content 端请求 `devicePixelRatio` 并传 `scale: dpr`，或使用 `clip.scale`。本次审查范围之外，因为这是功能决策而非 bug。
- **捕获模式**（DIR-02）：Firefox 内置支持整页和矩形区域捕获，与元素捕获并列。架构已将矩形计算（`shot` 在 `app/content/index.js:53-66`）与实际捕获分离，所以添加模式主要是 UI 工作。
- **除剪贴板外也保存到文件**（DIR-03）：`chrome.downloads` 权限未使用；在"复制"旁添加"保存"操作仅需一个选项页。
