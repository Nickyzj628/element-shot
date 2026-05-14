# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Chrome 浏览器扩展（Manifest V3），功能为"元素截图"。点击扩展图标后，用户可以在页面上悬停高亮元素，点击左键即可将该元素的截图保存到剪贴板。

## 技术栈

- 纯原生 JavaScript（无框架、无构建工具、无包管理器）
- Chrome Extension Manifest V3
- `app/` 目录及其子目录目前为空，实际代码文件在根目录下

## 常用开发命令

本项目无构建流程，开发方式如下：

1. 在 Chrome 中打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"，选择本项目根目录
4. 修改代码后点击扩展卡片上的刷新按钮，或重新加载扩展

## 架构说明

### 通信流程

整个截图流程涉及三次跨上下文通信，阅读代码时需注意消息发送者和接收者：

1. **background.js → content.js**：用户点击扩展图标时，`chrome.action.onClicked` 触发，向当前标签页发送 `{ action: "select" }`，启动元素选择模式。
2. **content.js → background.js**：用户点击目标元素后，content script 计算元素的 `getBoundingClientRect()`，发送 `{ action: "shot", data: { x, y, width, height } }`。
3. **background.js → content.js（inject）**：background 使用 `chrome.tabs.captureVisibleTab` 截取整个可见页面，通过 `OffscreenCanvas` 裁剪目标区域，然后调用 `chrome.scripting.executeScript` 向页面注入 `writeDataUrlToClipboard` 函数，将裁剪后的图像写入剪贴板。

### 关键实现细节

- **双击 requestAnimationFrame**：content.js 在点击元素后使用了嵌套的 `requestAnimationFrame`，目的是确保高亮样式（`.highlight`）的 `::before` 伪元素已从 DOM 中移除后再截图，避免蓝色覆盖层被截入图像。
- **剪贴板写入方式**：由于 Manifest V3 的 Service Worker 无法直接访问 `navigator.clipboard.write`，background.js 将图像裁剪为 Blob 后，通过 `executeScript` 将数据传入页面上下文，在页面中执行 `ClipboardItem` 写入操作。
- **错误/成功提示**：background.js 在截图处理失败或剪贴板写入失败时，会通过 `sendMessage` 向 content script 发送 `{ action: "error" }` 或 `{ action: "success" }` 消息，但当前 content.js 并未监听这些消息（会落入 `default` 分支并 `console.log`）。
