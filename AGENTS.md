# AGENTS.md

> 多写注释：本项目的核心难点是浏览器扩展的多上下文通信、Pointer Events 和 iframe 坐标换算。修改这些逻辑时，请用简短注释说明原因、发送方/接收方和清理时机。

## 项目定位

- 这是一个使用原生 JavaScript、Addfox 和 Manifest V3 构建的元素截图扩展；源码入口只有 `app/background/index.js`（Service Worker）和 `app/content/index.js`（页面 content script）。
- `app/content/select.js` 是选择状态机，`styles.css` 只负责高亮遮罩和结果 toast；不要把截图协议逻辑塞进样式或选择器之外的随机文件。
- `.addfox/` 是 Addfox 生成的元数据、缓存和构建产物目录；`.addfox/llms.txt` 标明为自动生成，不能手工维护。源码改动后以 `app/` 和 `addfox.config.js` 为准。

## 命令与调试

```bash
pnpm build        # 生成可加载的扩展；脚本已包含 --no-open
pnpm lint         # Biome lint + 格式检查
pnpm format:check # 只检查格式
pnpm format       # Biome 自动格式化
pnpm typecheck    # TypeScript checkJs，仅检查 app/**/*.js，不输出文件
```

- 本仓库没有测试脚本；最小验证顺序是 `pnpm lint`、`pnpm typecheck`、`pnpm build`。
- `pnpm build` 后在 Chrome `chrome://extensions/` 开发者模式加载 `.addfox/extension/extension-chromium/`，源码更新后重新 build 并点击扩展的“重新加载”。
- 运行时问题要同时检查页面 DevTools（content script）和扩展的 Service Worker 检查器（background）；截图失败通常发生在两者之间的消息或 debugger 生命周期上。
- `biome.json` 强制 2 空格、双引号、分号、尾逗号、100 列和 CRLF；不要手工引入另一套格式。

## 真实业务流程

1. 点击扩展图标后，background 用 `chrome.scripting.executeScript` 在所有 frame 派发 `element-shot-select`；content 监听它并调用 `selection.setup()`。
2. 选择模式只在 setup 后挂载 document 级监听。`mouseover` 高亮目标；向上滚轮选择祖先，向下滚轮回到原始 hover 元素。`pointerdown` 仅接受鼠标左键，锁定目标、捕获后续 pointerup 到遮罩，并发送 `attach`。
3. background 为每个 tab 用 `armedTabs` 保存 `frameId`、debugger 是否已连接、取消状态和 ready Promise；`capturingTabs` 防止同一 tab 并发截图。`attach` 会 `debugger.attach`、`Page.enable` 并等待 150ms，让调试横幅和页面重排完成。
4. `pointerup` 移除遮罩并发送 `shot`。background 等待 ready 后先向顶层 frame 发 `prepareCapture` 固定滚动条槽，再向选中 frame 发 `getRect`。目标 frame 的 content script 通过 `postMessage` 逐级把 iframe 内视口坐标换算为顶层文档坐标。
5. background 调用 `Page.captureScreenshot`，使用 PNG、`captureBeyondViewport: true`、`fromSurface: true` 截取目标区域；然后通过 `scripting.executeScript` 把页面函数 `writeBase64ToClipboard` 注入目标页，因为 MV3 Service Worker 不能直接使用页面剪贴板 API。
6. 成功或失败都向选中 frame 发送结果 toast 和 `teardown`；当目标在 iframe 时另向顶层 frame 发送 `teardown`，恢复 `scrollbarGutter`。完成后在 finally 中清理 `capturingTabs` 并 detach debugger。取消路径为 `Escape` 或 `pointercancel`，发送 `cancel` 后同样必须 detach。

## 关键约束

- manifest 在 `addfox.config.js` 中同时声明 Chromium 和 Firefox 变体；权限 `debugger`、`scripting`、`clipboardWrite` 和 `<all_urls>` content script 是当前功能所需，不要只改生成的 manifest。
- content script 配置为 `all_frames: true`、`match_about_blank: true`。消息必须带正确 `frameId`；截图结束时既通知目标 frame，也通知顶层 frame，避免 iframe 或顶层残留选择层。
- 目标矩形必须在 debugger 横幅出现后重新测量；不要缓存 `mouseover` 时的 rect。页面滚动坐标在顶层 `resolveDocumentRect` 中加入，iframe 还要考虑 `clientLeft/clientTop` 和 frame 缩放比例。
- `select.js` 里的 `stopImmediatePropagation`、捕获阶段监听和 overlay 的 `setPointerCapture` 是为了拦截页面自身事件（尤其视频控件），改动时要验证 pointerup、click、Esc、pointercancel 四条清理路径。
- 不要把 `navigator.clipboard.write` 移回 background；剪贴板写入必须发生在页面注入函数中，且函数返回 `{ ok, message }` 供 background 显示 toast。
- 源码使用 JSDoc 配合 `tsconfig.json` 的 `checkJs`；新增跨 API 数据结构时优先补 typedef/JSDoc，不要把项目改成 TypeScript 或直接编辑 `.addfox/extension/`。

## 变更检查

- 修改消息 action、frame 坐标或 debugger 状态时，检查对应发送方和接收方是否一起更新，并覆盖成功、异常、取消和重复触发。
- 修改 manifest 权限、入口或构建配置时，执行 `pnpm build` 并检查生成 manifest；`.addfox/cache/` 和 `.addfox/extension/` 是忽略的生成目录，`.addfox/llms.txt` 和 `.addfox/meta.md` 是受跟踪的自动生成元数据，不要手工维护。
- 修改页面注入代码时，确保函数仍可被 `chrome.scripting.executeScript({ func, args })` 序列化执行，不能依赖 background 模块作用域变量。
