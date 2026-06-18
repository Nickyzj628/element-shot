# CLAUDE.md

> **语言约定（Language Convention）**：本项目**全程使用简体中文**。
>
> - 与 AI 沟通的提问、回答、说明、汇报一律使用简体中文。
> - 提交信息（commit message）、PR 描述、Issue 标题与正文使用简体中文。
> - 文档（本文件、README、`plans/`、新写入的 `.md` 等）使用简体中文。
> - 代码、文件路径、API 名称、命令、配置键、第三方库名、代码注释中的标识符保持英文原样不变。
> - 若引用第三方英文资料（官方文档、错误信息原文、Stack Overflow 等）应保留英文原文，必要时附中文说明。

本文件为 Claude Code (claude.ai/code) 提供本项目代码的上下文指导。

> **AI 快速入门**：`.addfox/llms.txt` 包含由 Addfox 框架生成的项目全局概述，可帮助 AI 快速建立对项目的整体认知。
>
> **Addfox Skills**：`.agents/skills/` 目录下存放了 Addfox 框架的 skills 指导文件（如 `addfox-best-practices`、`addfox-debugging`、`migrate-to-addfox` 等），优先参考这些文件，然后再参考本指南。

## 项目概述

这是一个 Chrome 浏览器扩展（Manifest V3），功能为"元素截图"。点击扩展图标后，用户可以在页面上悬停高亮元素，点击左键即可将该元素的截图保存到剪贴板。

## 技术栈

- 原生 JavaScript（无前端框架）
- [Addfox](https://addfox.dev) 浏览器扩展构建工具（基于 Rsbuild）
- Chrome Extension Manifest V3
- pnpm 包管理器

## 常用开发命令

```bash
# 启动开发服务器（带热重载）
pnpm dev

# 构建生产版本
pnpm build
```

开发调试方式：

1. 运行 `pnpm dev` 启动 Addfox 开发服务器
2. 在 Chrome 中打开 `chrome://extensions/`
3. 开启"开发者模式"
4. 加载 `.addfox/extension/extension-chromium/` 目录作为已解压的扩展程序
5. 修改代码后，Addfox 会自动热重载

## 项目结构

Addfox 采用约定式入口结构，源码位于 `app/` 目录，子目录自动识别为扩展入口：

```
app/
  background/    # Service Worker（后台脚本）
    index.js
  content/       # 内容脚本
    index.js
    styles.css
```

当前扩展只包含 background 和 content 两个入口。每个入口子目录需要以 `index.js` 作为入口文件，Addfox 会自动将其注入到 manifest 中。

`public/` 目录下的静态资源会被复制到构建输出目录。

## 架构说明

> 以下架构说明为当前 Addfox 框架项目的实际实现，源码位于 `app/` 目录下。

### 通信流程

整个截图流程涉及三次跨上下文通信，阅读代码时需注意消息发送者和接收者：

1. **background → content**：用户点击扩展图标时，`chrome.action.onClicked` 触发，向当前标签页发送 `{ action: "select" }`，启动元素选择模式。
2. **content → background**：用户点击目标元素后，content script 计算元素的 `getBoundingClientRect()`，将坐标转换为文档绝对坐标（加上 `window.scrollX/scrollY` 以支持超出视口的元素），发送 `{ action: "shot", data: { x, y, width, height } }`。
3. **background → content**：background 通过 `chrome.debugger.attach` + `Page.captureScreenshot`（启用 `captureBeyondViewport` 支持超视口区域）直接截取目标区域，得到 base64 PNG。然后调用 `chrome.scripting.executeScript` 向页面注入 `writeBase64ToClipboard` 函数执行剪贴板写入。注入函数返回执行结果，background 根据结果通过 `chrome.tabs.sendMessage` 向 content script 发送 `{ action: "success" }` 或 `{ action: "error" }` 消息。处理完成后无论成败都会 `chrome.debugger.detach` 释放调试会话。

### 关键实现细节

- **使用 chrome.debugger 截图**：选择 `chrome.debugger` API 而非 `chrome.tabs.captureVisibleTab`，是因为后者只能截取当前视口，无法支持超出视口范围的元素。`debugger` 每次使用会弹出"正在调试此浏览器"黄色横幅，是当前方案的已知代价。
- **并发控制**：background 维护 `capturingTabs: Set<tabId>` 防止同一标签页的并发截图请求叠加；同一 tab 的后续请求在 `finally` 中通过 `capturingTabs.delete(tabId)` 解锁。
- **元素选择交互**：content 脚本通过 `mouseover` 实时高亮、点击触发截图、`wheel` 在祖先层级之间切换（向上滚=父元素、向下滚=回到子一级）、`Esc` 退出选择模式。
- **剪贴板写入方式**：由于 Manifest V3 的 Service Worker 无法直接访问 `navigator.clipboard.write`，background.js 将 base64 数据传入页面上下文，在页面中执行 `ClipboardItem` 写入操作。
- **错误/成功提示**：content.js 收到 `success` / `error` 消息后会在页面顶部显示 toast 浮层提示，3 秒后自动消失。

## Addfox 配置

### 关键配置字段（`addfox.config.js`）

#### 必填字段

- **`manifest`** - 扩展的 manifest.json 内容
  - 支持 `chromium` 和 `firefox` 双版本变体
  - Addfox 会自动注入入口路径，无需手动填写

#### 可选字段（按需使用）

- **`appDir`** - 源码目录（默认：`"app"`）
- **`outDir`** - 构建输出目录（默认：`"dist"`）
- **`entry`** - 手动指定入口映射
- **`hotReload`** - 开发服务器热重载设置
- **`debug`** - 启用调试日志
- **`zip`** - 输出 zip 配置
- **`rsbuild`** - 覆盖 Rsbuild 配置
- **`plugins`** - 添加 Rsbuild 插件

### 浏览器扩展 API

- 可直接使用 `chrome.*` API
- 如需跨浏览器兼容，可安装 `webextension-polyfill`

### 样式

- 纯 CSS，无需预处理器
- 内容脚本样式：如需隔离，可结合 Shadow DOM 使用

## 相关资源

- [Addfox 官方文档](https://addfox.dev)
- [WebExtension API 文档](https://developer.mozilla.org/zh-CN/docs/Mozilla/Add-ons/WebExtensions/API)
