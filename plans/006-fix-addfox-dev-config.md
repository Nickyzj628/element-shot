# 计划 006：修复 addfox dev 启动配置

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。

## 状态

- **优先级**：P2
- **工作量**：S
- **风险**：LOW
- **依赖**：001
- **类别**：dev 体验 / 配置
- **计划时间**：2026-06-18
- **问题**：_未发布_

## 背景与意义

`pnpm dev` 启动时无法拉起 CentBrowser，错误信息：

```
chrome path not found; set browserPath.chrome in addfox.config,
or install the browser at a default location
```

工作区未提交的 `addfox.config.js` 改动尝试两项内容：(1) 引入 firefox 变体的 `action → browser_action` 拆分，(2) 用 `process.env.CHROMIUM_PATH` 配合 `.env` 文件承载浏览器路径。两项都基于对 addfox 0.1.1 行为的误读，叠加导致两个独立故障：

1. **构建失败**：`firefoxManifest = { ...manifestBase, browser_action: action }` 在 `manifest_version: 3` 下被 addfox schema 校验拒绝（`MV3 does not support "browser_action" or "page_action"; use "action"`）。
2. **dev 启动失败**：`browserPath` 字段被写成字符串（`"C:\\...\\chrome.exe"`），但 addfox 期望 `BrowserPathConfig` 对象（`{ chrome, chromium, edge, ... }`），导致 `getLaunchPathFromOptions("chrome", pathOpts)` 取到 `undefined`，落到默认路径探测后失败。

两个故障的修复都已落在当前 `addfox.config.js` 中。本计划把它们正式归档。

## 现状

文件：`addfox.config.js`

```js
import { existsSync } from "node:fs";
import { defineConfig } from "addfox";

const manifest = { /* ... 不变 ... */ };

const browserPath = process.env.LOCALAPPDATA
  ? { chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe` }
  : undefined;

export default defineConfig({
  manifest: { chromium: manifest, firefox: { ...manifest } },
  ...(browserPath && existsSync(browserPath.chrome) && { browserPath }),
});
```

两项修复相对 d7d3025 的 diff：

```diff
- browserPath: {
-   chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe`,
- },
+ const browserPath = process.env.LOCALAPPDATA
+   ? { chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe` }
+   : undefined;
+ // ... spread 出来，传给 defineConfig
```

`existsSync` 守卫确保 `CentBrowser\Application\chrome.exe` 不存在时不传 `browserPath` 字段，让 addfox 走默认探测。

## 你将用到的命令

| 用途 | 命令 | 预期成功结果 |
|------|------|--------------|
| 静态检查 | `grep -n "browserPath\|firefoxManifest" addfox.config.js` | 出现 `browserPath` 引用，无 `firefoxManifest` |
| 验证对象形态 | `grep -n "browserPath.chrome\|browserPath:" addfox.config.js` | 看到 `browserPath.chrome` 字段访问 |
| 构建 | `pnpm build` | 退出 0 |
| Dev 启动 | `pnpm dev` | 拉起 CentBrowser，无 "chrome path not found" 错误 |

## 范围

**在范围内**（修改的文件）：
- `addfox.config.js`

**不在范围内**（即使看起来相关，也不要触碰）：
- `app/content/index.js` — 001 范围，不动
- `app/background/index.js` — 预先存在的工作区修改，与本计划无关
- `.env` / `.env.example` — 决定保留原状（addfox 不读 `.env` 到 Node 进程的 `process.env`；如果未来要清理应另开计划）

## 步骤

### 步骤 1：删除 debug 输出

如果当前 `addfox.config.js` 中还有 `console.log(123, browserPath)` 一行（验证 001 时加的），删除它。`addfox.config.js` 是配置阶段代码，每次 `pnpm dev` / `pnpm build` 都会执行，不应留有 debug 输出。

**验证**：`grep -n "console.log" addfox.config.js` 无输出。

### 步骤 2：确认 `browserPath` 是对象形态

确认 `addfox.config.js` 第 32-34 行是：

```js
const browserPath = process.env.LOCALAPPDATA
  ? { chrome: `${process.env.LOCALAPPDATA}\\CentBrowser\\Application\\chrome.exe` }
  : undefined;
```

而不是字符串模板直接赋值。

**验证**：`grep -n "browserPath.chrome" addfox.config.js` 显示 2 处（`existsSync` 调用 + 模板字符串内 `browserPath.chrome` 不会命中；模板内是 `\`\${...}\CentBrowser\``，不包含 `browserPath.chrome`）。预期 1 处命中（`existsSync(browserPath.chrome)` 那一行）。

### 步骤 3：确认 firefox 变体未拆分

确认 `addfox.config.js` 中：

```js
manifest: { chromium: manifest, firefox: { ...manifest } }
```

不出现 `firefoxManifest`、`browser_action` 字样。

**验证**：`grep -n "firefoxManifest\|browser_action" addfox.config.js` 无输出。

### 步骤 4：构建验证

**验证**：`pnpm build` 退出 0。`.addfox/extension/extension-chromium/content/index.js` 存在。

### 步骤 5：Dev 启动验证（手动）

执行 `pnpm dev`。预期：

1. Rsbuild 启动 dev server，无 schema 校验错误
2. CentBrowser 自动启动并加载 `chrome://extensions`
3. 扩展出现在 `chrome://extensions` 列表，状态为"已加载"
4. 控制台无 "chrome path not found" 警告

5 秒手动冒烟测试不可自动化；请在提交信息中记录执行者已实际拉起 CentBrowser 并在 `chrome://extensions` 看到扩展已加载。

## 测试计划

仓库还没有测试运行器（计划 004 将建立）。验证方式是构建 + 手动冒烟（记录在提交信息中）。计划 004 落地后，可选添加一个针对 `addfox.config.js` 形态的单元测试（验证 `browserPath` 字段在 `LOCALAPPDATA` 存在时是对象）。

## 完成标准

- [ ] `grep -n "console.log" addfox.config.js` 无输出
- [ ] `grep -n "browserPath.chrome" addfox.config.js` 命中 `existsSync` 调用那一行
- [ ] `grep -n "firefoxManifest\|browser_action" addfox.config.js` 无输出
- [ ] `pnpm build` 退出 0
- [ ] `pnpm dev` 拉起 CentBrowser（手动验证）
- [ ] `plans/README.md` 中 006 的状态行已更新为 DONE
- [ ] 提交信息中记录手动验证结果

## 停止条件

在以下情况下停止并报告（不要变通）：

- addfox 升级后 `BrowserPathConfig` 接口字段名变更（`chrome` 改名等）—— 需要重新对齐。
- `existsSync` 在跨平台下行为不一致（Windows 路径分隔符等）—— 改用 `path.join`。
- 修复似乎需要触碰 `app/content/index.js` 或 `app/background/index.js` —— 不应如此，这些是 001 / 预先存在的工作区修改。
- `pnpm build` 失败原因非本计划范围内的 schema 变化 —— 另开计划。

## 维护说明

- 升级 addfox 时检查 `BrowserPathConfig` 类型定义是否变更（`types.d.ts:7-21`）。
- 换浏览器时改 `browserPath` 字段：填 `chrome` 字段保持 CentBrowser；填 `edge` 字段改用 Edge；CLI 加 `--browser edge` 触发。
- 如果未来扩展到多浏览器，`.env` 文件和 `CHROMIUM_PATH` 仍是死路（addfox 不会把 `.env` 注入 Node 进程 `process.env`）。正确做法是在 `addfox.config.js` 顶部读 `.env`（用 `dotenv` 包或手写 fs parser），或继续用 OS 环境变量。
- 跨平台：当前路径用 `\\` 是 Windows 专用。如果需要 macOS / Linux 支持，替换为 `path.join(process.env.LOCALAPPDATA, "CentBrowser", "Application", "chrome.exe")`。
