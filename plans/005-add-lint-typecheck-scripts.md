# 计划 005：在 package.json 中添加 lint 和 typecheck 脚本

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **漂移检查（首先运行）**：`git diff --stat d7d3025..HEAD -- package.json` 应为空（除了对 `addfox.config.js` 的本地修改，那不影响本文件）。如果 `package.json` 有未提交的本地修改，停止 — 执行者与本地工作树在基线上不一致。

## 状态

- **优先级**：P3
- **工作量**：S
- **风险**：LOW
- **依赖**：无（独立提交，*早于*或*晚于*计划 004 均可，不要合入同一提交）
- **类别**：dx
- **计划时间**：提交 `d7d3025`，2026-06-17
- **问题**：_未发布_

## 背景与意义

本仓库没有任何静态分析。没有 `lint` 脚本、没有 `format` 脚本、没有 `typecheck` 脚本、没有 `.eslintrc`、没有 `tsconfig.json`、没有 `prettier` 配置。开发者获得的唯一反馈是"加载已解压的扩展试试"。这意味着 `chrome.runtime.sendMessage` 负载中的拼写错误、变量未定义、忘记 `await` 都会漏到手动测试阶段 — 计划 001 和 002 中那些 bug 的失败模式正是如此。

两个低投入高产出的工具就能覆盖大部分问题：

- **通过 JSDoc + `tsc --noEmit` 进行类型检查** — 无需 TypeScript 重写。给两个源文件加上 `@param` 与 `@type` JSDoc 注解，`tsc --checkJs --noEmit` 即可捕获拼写错误和未定义引用。总成本：1 个 devDependency（`typescript`）+ 1 个配置文件（`jsconfig.json`）。
- **通过 ESLint flat config 进行 lint** — 捕获未使用变量、缺失的 `await`、`==` 与 `===` 等。总成本：1 个 devDependency（`eslint`）+ 1 个配置文件（`eslint.config.js`）。

本计划有意保持最小：让工具*可运行*并证明现有代码通过它们。更严格的规则（例如 "no `any`"、"产品代码中禁止 `console.log`"）留给后续计划。

## 现状

`package.json`：

```json
{
  "name": "element-shot",
  "version": "1.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "addfox dev",
    "build": "addfox build --no-open"
  },
  "devDependencies": {
    "addfox": "^0.1.1"
  }
}
```

没有 `.eslintrc*`，没有 `eslint.config.js`，没有 `jsconfig.json`，没有 `tsconfig.json`。源文件是纯 ESM JavaScript。

## 你将用到的命令

| 用途   | 命令                                  | 预期成功结果 |
|--------|---------------------------------------|--------------|
| 安装   | `pnpm install`                        | 退出 0；新 devDeps 进入 lockfile |
| Lint   | `pnpm lint`                           | 退出 0；"no problems" 或类似 |
| 类型检查 | `pnpm typecheck`                    | 退出 0；无错误 |
| 构建   | `pnpm build`                          | 退出 0（健全性） |

## 范围

**在范围内**：
- `package.json` — 添加 `lint`、`typecheck`、`format:check` 脚本及相应 devDependencies
- `eslint.config.js` — 新建
- `jsconfig.json` — 新建
- `.prettierrc.json` — 新建（可选但推荐用于 format:check）
- `app/**/*.js` — *不修改源码*；若 linter 抱怨，修复 lint 问题；若 typecheck 抱怨，添加 JSDoc 类型或 `// @ts-ignore`，仅作为最后手段。

**不在范围内**（不要触碰）：
- `.addfox/**` 和 `dist/**` — 自动生成，由 ESLint 配置忽略。
- `node_modules/**` — 标准。
- 添加 React / Vue / Svelte 专用 lint 插件 — 项目是纯 JS。
- 把 `prettier` 加入 pre-commit 钩子 — 另一项计划。
- 将源文件切换为 TypeScript — 对"工具改进"计划而言幅度过大。

## 步骤

### 步骤 1：安装 TypeScript、ESLint、Prettier

```bash
pnpm add -D typescript eslint @eslint/js eslint-plugin-import globals prettier
```

若因 `addfox` 的 peer-dep 冲突安装失败，停止并报告。本计划假定项目的 `pnpm-workspace.yaml`（仅设置 `allowBuilds`）没有固定这些工具的版本。

**验证**：`pnpm exec tsc --version` 输出版本号。`pnpm exec eslint --version` 输出版本号。

### 步骤 2：编写 `jsconfig.json`

在仓库根目录新建 `jsconfig.json`。它告诉 TypeScript 用宽松但有用的默认设置对 `app/` 下的 JS 文件进行类型检查。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "strict": true,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome"]
  },
  "include": ["app/**/*.js", "app/**/*.d.ts"],
  "exclude": ["node_modules", "dist", ".addfox"]
}
```

`types: ["chrome"]` 要求安装 `@types/chrome`：

```bash
pnpm add -D @types/chrome
```

**验证**：`pnpm typecheck` 退出 0。若现有代码报错（例如 `chrome.runtime` 部分类型缺失），在那一行加 `// @ts-expect-error` 并附一行注释，然后在提交信息中报告。不要通过放宽配置来消除错误。

### 步骤 3：编写 `eslint.config.js`

在仓库根目录用 flat config（ESLint 9+）新建 `eslint.config.js`：

```js
import js from "@eslint/js";
import globals from "globals";
import importPlugin from "eslint-plugin-import";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly",
      },
    },
    plugins: { import: importPlugin },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "off", // TypeScript handles this via `checkJs`
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", ".addfox/**", "**/*.test.js"],
  },
];
```

`no-undef: off` 是有意的：TypeScript 加 `checkJs` 已经覆盖了未定义引用；ESLint 的 `no-undef` 不理解 JSDoc 类型，开启它会产生重复错误。

**验证**：`pnpm lint` 退出 0。如果它报告现有代码错误，修复*具体的*报告项（例如补一个 `await`、删一个未使用的 import）。不要放宽规则。

### 步骤 4：编写 `.prettierrc.json`

新建 `.prettierrc.json`：

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**验证**：`pnpm format:check` 在当前代码库上退出 0。若任何现有文件被报告为格式不合规，运行 `pnpm format` 修正并再次 `format:check`。不要把"格式修正"合入与 lint/typecheck 配置同一提交 — 将"配置 prettier"提交与"应用到现有代码"提交分开。

### 步骤 5：在 `package.json` 中添加脚本

将 `package.json` 的 `scripts` 块从：

```json
  "scripts": {
    "dev": "addfox dev",
    "build": "addfox build --no-open"
  },
```

改为：

```json
  "scripts": {
    "dev": "addfox dev",
    "build": "addfox build --no-open",
    "test": "rstest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
```

（注：`test` 脚本仅在计划 004 落地后添加；若尚未落地则省略该行。）

**验证**：`pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` 全部退出 0。

### 步骤 6：在 CLAUDE.md 中记录

在 `CLAUDE.md` 中追加新的"代码质量"章节：

```markdown
## 代码质量

项目使用 ESLint（flat config）、TypeScript（\`checkJs\` 模式，仅做类型检查不输出）和 Prettier 作为静态分析与格式化工具。运行：

\`\`\`bash
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit
pnpm format:check    # Prettier 校验
pnpm format          # Prettier 写入
\`\`\`

源码保持纯 JavaScript，通过 JSDoc + \`checkJs\` 提供类型提示，无需 .ts 重构。
```

（实际文件中使用围栏代码块；此处反斜杠转义形式仅为在本计划中正常渲染。）

**验证**：`cat CLAUDE.md | grep -A 8 "## 代码质量"` 显示新章节。

## 测试计划

本计划引入新脚本；不增加测试。脚本本身就是验证面。

- `pnpm lint` 在现有代码上必须退出 0（步骤 2–4 中任何最小修复后）。
- `pnpm typecheck` 在现有代码上必须退出 0（步骤 2 中任何最小 JSDoc 补充后）。
- `pnpm format:check` 在现有代码上必须退出 0。
- `pnpm build` 必须仍退出 0（这些脚本不影响构建流水线）。

## 完成标准

- [ ] `pnpm install` 退出 0
- [ ] `pnpm lint` 退出 0
- [ ] `pnpm typecheck` 退出 0
- [ ] `pnpm format:check` 退出 0
- [ ] `pnpm build` 退出 0
- [ ] `package.json` 中存在 `lint`、`typecheck`、`format`、`format:check` 脚本（若计划 004 已落地则还有 `test`）
- [ ] `eslint.config.js`、`jsconfig.json`、`.prettierrc.json` 存在于仓库根目录
- [ ] `CLAUDE.md` 中有"代码质量"章节
- [ ] `plans/README.md` 中 005 的状态行已更新为 DONE

## 停止条件

在以下情况下停止并报告（不要变通）：

- "现状"中 `package.json` 片段与实际文件不匹配。
- devDependency 安装因 `pnpm-workspace.yaml` 约束而失败。停止 — 工作区设置是项目决策。
- ESLint 在现有代码上报告超过约 5 个问题。停止 — 这意味着推荐规则与代码库不匹配；放宽配置或报告问题以待分诊，不要在"工具"PR 中修复几十个文件。
- TypeScript 报告无法用一行 JSDoc 或 `// @ts-expect-error` 消除的错误。停止 — 源码可能需要先行小重构，那是另一项计划。
- 用户希望使用 TypeScript 源文件（`.ts` 后缀）而非 JSDoc。停止 — 那是迁移计划，而非"添加工具"计划。

## 维护说明

- `eslint.config.js` 排除了 `**/*.test.js`，因为测试文件有不同的约定（例如 `describe` / `it` 是全局变量而非 import）。若计划 004 先落地，重新评估此排除项 — Rstest / Vitest 测试文件可能仍需在宽松规则下 lint。
- `tsc --noEmit` 速度很快（本代码库亚秒级）。它可以以低成本加到未来的 pre-commit 钩子中。
- `@types/chrome` 是社区维护的类型定义。若未来 Chrome 版本添加了新 `chrome.*` API，扩展会用到，类型定义会滞后；本地加 `// @ts-expect-error` 并向上游报告。
- Prettier 配置（`semi`、`singleQuote`、`trailingComma`、`printWidth`）与现有代码风格匹配。若维护者偏好不同，修改 `.prettierrc.json` 并重跑 `pnpm format` — 单独提交。
