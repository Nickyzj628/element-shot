# CLAUDE.md

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
  popup/         # 弹出页面
    index.js
  options/       # 选项页面
    index.js
  sidepanel/     # 侧边栏
    index.js
```

每个入口子目录需要以 `index.js` 作为入口文件。Addfox 会自动将其注入到 manifest 中。

`public/` 目录下的静态资源会被复制到构建输出目录。

## 架构说明

> 以下架构说明为当前 Addfox 框架项目的实际实现，源码位于 `app/` 目录下。

### 通信流程

整个截图流程涉及三次跨上下文通信，阅读代码时需注意消息发送者和接收者：

1. **background → content**：用户点击扩展图标时，`chrome.action.onClicked` 触发，向当前标签页发送 `{ action: "select" }`，启动元素选择模式。
2. **content → background**：用户点击目标元素后，content script 计算元素的 `getBoundingClientRect()`，发送 `{ action: "shot", data: { x, y, width, height } }`。
3. **background → content**：background 使用 `chrome.tabs.captureVisibleTab` 截取整个可见页面，通过 `OffscreenCanvas` 裁剪目标区域，然后调用 `chrome.scripting.executeScript` 向页面注入 `writeDataUrlToClipboard` 函数执行剪贴板写入。注入函数返回执行结果，background 根据结果通过 `chrome.tabs.sendMessage` 向 content script 发送 `{ action: "success" }` 或 `{ action: "error" }` 消息。

### 关键实现细节

- **双击 requestAnimationFrame**：content.js 在点击元素后使用了嵌套的 `requestAnimationFrame`，目的是确保高亮样式（`.highlight`）的 `::before` 伪元素已从 DOM 中移除后再截图，避免蓝色覆盖层被截入图像。
- **剪贴板写入方式**：由于 Manifest V3 的 Service Worker 无法直接访问 `navigator.clipboard.write`，background.js 将图像裁剪为 Blob 后，通过 `executeScript` 将数据传入页面上下文，在页面中执行 `ClipboardItem` 写入操作。
- **错误/成功提示**：background.js 在截图处理完成或失败时，通过 `executeScript` 的返回值获取注入脚本的执行结果，再用 `chrome.tabs.sendMessage` 向 content script 发送 `{ action: "success" }` 或 `{ action: "error" }` 消息。content.js 收到后会在页面顶部显示 toast 浮层提示，3 秒后自动消失。

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
