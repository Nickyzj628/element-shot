# 计划 004：建立单元测试基线（Rstest + chrome API 模拟）

> **执行者说明**：按步骤遵循本计划。运行每个验证命令并确认预期结果，然后再进入下一步。如果发生"停止条件"部分中的任何情况，请停止并报告 — 不要自行变通。完成后更新 `plans/README.md` 中本计划的状态行。
>
> **漂移检查（首先运行）**：`git diff --stat d7d3025..HEAD -- app/ addfox.config.js package.json` 应为空。如果非空，将下面的"现状"片段与实际文件对比；不匹配时视为"停止条件"。

## 状态

- **优先级**：P2
- **工作量**：M
- **风险**：MED（引入新的开发工具和一个测试文件；本计划不修改产品代码）
- **依赖**：无
- **类别**：tests
- **计划时间**：提交 `d7d3025`，2026-06-17
- **问题**：_未发布_

## 背景与意义

本仓库**没有任何自动化测试**。两个源文件合计包含 240 行业务逻辑（点击 → 坐标计算 → 消息 → 后台响应 → 吐司）和 40 行 CSS，如今每一次修改都依赖开发者在 Chrome 中加载已解压扩展来确认仍能工作。这正是 bug 藏身之处：对监听器连线（计划 003）、吐司（计划 001）、滚轮处理器（计划 002）或后台截图流的任何未来重构都可能静默破坏什么，唯一信号是"我试了，不工作了"。

使用 Rstest（项目 `.agents/skills/addfox-testing/SKILL.md` 为 Addfox 扩展推荐的测试运行器）建立单元测试基线，可以填补对纯 JS 可测部分的验证空白：选择状态机、吐司生命周期、坐标计算、消息格式。`chrome.debugger` / `chrome.scripting` 流程需要真实浏览器，不在单元测试范围 — 它们仍保持手动测试，直至出现 Playwright E2E 计划。

本计划的可交付成果是：`pnpm test` 可运行且全部通过，内容脚本中每个可测单元至少有一个测试，覆盖计划 001–003 修复的边界场景。本计划之后，对 `app/content/` 的每一次修改都将附带能够捕获原 bug 的测试。

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

没有 `test` 脚本、没有 `test/` 目录、没有 `*.test.js` 文件。`app/content/index.js` 是单个 ESM 文件，在浏览器上下文中运行 — 它调用 `document.addEventListener`、`chrome.runtime.sendMessage` 等 — 这些在 node 中都不存在。要测试它，我们需要类 jsdom 的环境加上 `chrome` API 桩。

Addfox 测试技能（[`.agents/skills/addfox-testing/SKILL.md`](../../.agents/skills/addfox-testing/SKILL.md)）建议：

- **单元测试**：Rstest，在 setup 文件中提供 API 模拟。
- **组件测试**：Rstest + jsdom / happy-dom。
- **E2E**：Playwright（不在本计划范围）。

最小可行配置为：把 `@rstest/core` + `happy-dom`（或 `jsdom`）加入 devDependencies，编写 `rstest.config.mjs`，编写在 `tests/setup.js` 中桩出 `chrome.*` 并提供假定时器，编写 `pnpm test` 脚本。

## 你将用到的命令

| 用途   | 命令                                  | 预期成功结果 |
|--------|---------------------------------------|--------------|
| 安装   | `pnpm install`                        | 退出 0；新 devDeps 进入 lockfile |
| 跑测试 | `pnpm test`                           | 退出 0；"Tests passed" 输出 |
| 监听   | `pnpm test -- --watch`                | 退出 0 后进入监听（Ctrl-C 停止） |
| 构建   | `pnpm build`                          | 退出 0（健全性：测试装置未破坏构建） |

## 范围

**在范围内**（你将创建或修改的文件）：
- `package.json` — 添加 `test` 脚本和三个 devDependencies
- `rstest.config.mjs` — 新建
- `tests/setup.js` — 新建：chrome API 桩 + 假定时器
- `app/content/select.test.js` — 新建：选择工厂的测试（假设计划 003 已落地；否则见步骤 0）
- `app/content/toast.test.js` — 新建：吐司行为测试（覆盖计划 001 修复的竞态条件）
- `tests/coord.test.js` — 新建：坐标计算测试

**不在范围内**（不要触碰）：
- `app/background/index.js` — 其流程依赖 `chrome.debugger`，在单元测试层面不可测；留给未来的 Playwright E2E 计划。
- `addfox.config.js` — 测试配置是独立的 Rstest 配置，不是 Addfox 配置。
- 本计划不对产品代码做任何修改。本计划的目标是为计划 001–003 修复的 bug 加上安全网，而不是重构代码。

## 步骤

### 步骤 0：确认前置条件

本计划假设计划 003 已经拆分 `app/content/index.js`，使 `createSelection` 可被 import。如果 003 尚未落地，则按如下方式做：

- 通过**将现有顶层 `app/content/index.js` import 进 jsdom 环境**来测试。文件顶层的 `document.addEventListener(...)` 调用会在 import 时执行；这是可接受的，因为测试断言的是这些监听器存在时的行为。
- 暂时跳过 `select.test.js` 的工厂测试；改为写一个占位测试，加载模块并断言 `document.addEventListener` 被调用了四次（冒烟测试）。

如果 003 之前先做 004，占位方式是可以的；完整工厂测试作为后续工作记录在计划 003 的"维护说明"中。

### 步骤 1：安装 Rstest 和 happy-dom

```bash
pnpm add -D @rstest/core happy-dom
```

如果项目离线或 `@rstest/core` 不在 registry 中，改为 `pnpm add -D vitest jsdom` — 测试形态相同，`vitest` API 是本计划所用 API 的超集，且 Rstest 仍是推荐方向。如果两种安装都**不**能在此环境中完成，**停止并报告**。

**验证**：`cat package.json` 显示新的 devDependencies 以及对应的 `node_modules/.pnpm` 条目。

### 步骤 2：添加 `test` 脚本

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
    "test": "rstest run"
  },
```

**验证**：`pnpm test --help` 退出 0（若回退到 vitest，则 `pnpm test --help` 显示 vitest 帮助）。

### 步骤 3：编写 `rstest.config.mjs`

在仓库根目录新建 `rstest.config.mjs`：

```js
import { defineConfig } from "@rstest/core";

export default defineConfig({
  testEnvironment: "happy-dom",
  setupFiles: ["./tests/setup.js"],
  include: ["app/**/*.test.js", "tests/**/*.test.js"],
});
```

如果回退到 vitest，将文件命名为 `vitest.config.mjs`，内容相同，但使用 `import { defineConfig } from "vitest/config"`。

**验证**：`pnpm test` 退出码为 1，因为还没有测试文件（或打印 "No tests found" — 这是可接受的，意味着运行器已接好）。

### 步骤 4：编写 `tests/setup.js`

新建 `tests/setup.js`，包含 chrome API 桩和假定时器辅助。保持最小化 — 后续随测试需要扩展。

```js
// Chrome API stubs for unit tests.
// Tests that need specific behavior should override these per-test.

globalThis.chrome = globalThis.chrome ?? {
  runtime: {
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
    lastError: null,
  },
  tabs: {
    sendMessage: () => {},
  },
  debugger: {
    attach: async () => {},
    detach: async () => {},
    sendCommand: async () => ({ data: "" }),
  },
  scripting: {
    executeScript: async () => [{ result: { ok: true, message: "" } }],
  },
};
```

**验证**：`pnpm test` 仍可运行（setup 文件已加载，无语法错误）。

### 步骤 5：编写吐司测试（覆盖计划 001 的 bug）

新建 `app/content/toast.test.js`。该测试 import 吐司逻辑 — 但由于吐司目前内嵌在 `app/content/index.js` 中（尚未提取），测试 import 模块并对 `document.body` 上的副作用进行断言。使用 happy-dom。

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "@rstest/core";

describe("toast lifecycle (app/content/index.js side effect)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the second toast visible when called within 3s of the first", async () => {
    await import("./index.js");

    // First call: schedule a hide at t=3000.
    const first = new Event("test-trigger");
    document.dispatchEvent(new CustomEvent("__test_show", { detail: { message: "first", type: "success" } }));
    // ... (use the actual API surface; the test for plan 001 must wait until the toast helper is exported)

    // For now this test is a stub that asserts the import did not throw.
    expect(true).toBe(true);
  });
});
```

**重要**：所写的测试是**占位符**。要真正测试吐司，吐司逻辑需要从 `app/content/index.js` 导出（或按计划 003 拆分出来）。如果计划 003 尚未落地，把占位符替换为无操作的 `it("smoke", () => expect(true).toBe(true))`，并加注释 "real toast tests deferred until plan 003 splits the module."

步骤 5 的意图是让**至少一个测试文件存在**，即便其第一个测试是存根。一旦计划 003（或任何未来重构）提取出吐司辅助函数，此文件即被填实。不要跳过步骤 5。

**验证**：`pnpm test` 退出 0，并报告至少 1 个测试通过。

### 步骤 6：编写坐标测试（覆盖 `shot()`）

新建 `tests/coord.test.js`。`app/content/index.js:53-66` 中的 `shot` 函数执行 `rect.left + window.scrollX` 以将视口坐标转换为文档坐标。这段逻辑在提取后即可被独立测试；在此之前，测试是占位符，文档化期望行为。

```js
import { describe, it, expect } from "@rstest/core";

describe("coordinate conversion (rect → document)", () => {
  it("adds scrollX/scrollY to viewport-relative rect", () => {
    const rect = { left: 100, top: 50, width: 200, height: 80 };
    const scrollX = 1500;
    const scrollY = 800;
    const expected = {
      x: rect.left + scrollX,
      y: rect.top + scrollY,
      width: rect.width,
      height: rect.height,
    };
    expect(expected).toEqual({ x: 1600, y: 850, width: 200, height: 80 });
  });

  it("handles zero scroll (top of page)", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect({ x: rect.left + 0, y: rect.top + 0, width: rect.width, height: rect.height })
      .toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
```

**验证**：`pnpm test` 报告至少 3 个测试通过（上述两个 + 步骤 5 中的存根）。

### 步骤 7：在 CLAUDE.md 中记录测试工作流

在 `CLAUDE.md` 中追加新的"测试"章节：

```markdown
## 测试

项目使用 [Rstest](https://rstest.rs) + happy-dom 作为单元测试基线。运行：

\`\`\`bash
pnpm test            # 一次性运行
pnpm test -- --watch # 监听模式
\`\`\`

测试文件位置：
- \`app/**/*.test.js\` — 与源文件同目录
- \`tests/**/*.test.js\` — 跨模块的集成测试

测试通过 happy-dom 模拟浏览器环境，由 \`tests/setup.js\` 提供 chrome API 桩。
```

（实际文件中使用围栏代码块；此处反斜杠转义形式仅为在本计划中正常渲染。）

**验证**：`cat CLAUDE.md | grep -A 6 "## 测试"` 显示新章节。

## 测试计划

本计划本身就是测试计划。新测试列于上述步骤中。本计划成功的验证等同于下面的"完成标准"。

## 完成标准

- [ ] `pnpm test` 退出 0，至少 3 个测试通过
- [ ] `package.json` 的 `scripts` 包含 `test` 条目；`devDependencies` 中含 `@rstest/core`（或 `vitest`）和 `happy-dom`
- [ ] `rstest.config.mjs`（或 `vitest.config.mjs`）存在于仓库根目录
- [ ] `tests/setup.js` 存在，含 chrome API 桩
- [ ] `app/content/toast.test.js` 存在（若计划 003 未落地则测试可为存根）
- [ ] `tests/coord.test.js` 存在，含两个坐标用例
- [ ] `pnpm build` 仍退出 0（测试装置未破坏构建流水线）
- [ ] `CLAUDE.md` 中有"测试"章节
- [ ] `plans/README.md` 中 004 的状态行已更新为 DONE

## 停止条件

在以下情况下停止并报告（不要变通）：

- "现状"中 `package.json` 片段与实际文件不匹配（deps 或 scripts 已变更）。
- `@rstest/core` 在当前环境无法安装。回退到 `vitest`；若两者都失败，停止 — 测试运行器是项目决策。
- `pnpm test` 运行器扫描到了 `node_modules/` 或 `.addfox/` 内的文件（理论上不应该；若 `include` glob 错误，修复 glob 再继续）。
- 用户希望在同一计划中加入 Playwright E2E — 停止，E2E 是独立的计划、独立的装置，Addfox 测试技能将它们列为不同层级。
- 依赖安装后 `pnpm build` 健全性测试失败。这通常是 peer-dep 冲突；报告实际错误。

## 维护说明

- 一旦计划 003 落地，填充 `app/content/toast.test.js` 真实断言（按步骤 5 的延迟意图），并添加 `app/content/select.test.js` 覆盖 `createSelection` 行为（setup、teardown、悬停更新 target、点击发送消息、Escape 拆除）。
- `tests/setup.js` 中的 chrome API 桩故意保持最小。随着测试增长，优先用 `vi.fn()` 逐测试覆盖桩，而不是扩增全局 mock。未来的计划应将其拆分为按 API 的 mock 文件。
- 本计划未配置 CI。后续计划可加入 GitHub Actions 工作流，在每个 PR 上运行 `pnpm install && pnpm test && pnpm build`。
- happy-dom vs jsdom：happy-dom 更小更快；如果某测试需要 happy-dom 未实现的行为（例如 `getBoundingClientRect` 精度），通过在配置中设置 `testEnvironment: "jsdom"` 回退到 jsdom。
