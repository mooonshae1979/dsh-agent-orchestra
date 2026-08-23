# dsh-agent-orchestra

**dsh-agent-teams 的对话式编排进化版**（独立新仓库，插件名与工具前缀均与 `dsh-agent-teams` 区分，可并存安装）。

## 定位

在 `dsh-agent-teams` 的多 Agent 团队基础上，把协作方式升级为**对话驱动编排**：

- 在对话里 **@点名 直接给子 agent 派活**，或按成员身份自动分配/领取任务；
- 对话里默认有一个**任务分配者（队长/主模型）**，负责布置任务的拆解与分配；
- **按既定工作流**，子 agent 的答复自动打包给下一位继续下一步（工作流预置模板 + 对话覆盖）；
- **子 agent 身份不预制**，按任务现场定制（身份库模板 + 现场覆盖名字/角色/专长/模型/模式）；
- 内置**写作流（AI 小说家）**等模板，支持对话中**随时增删组员**、**轻量子流程（组内再走既定工作流）**。

## 与 dsh-agent-teams 的差异

| | dsh-agent-teams | dsh-agent-orchestra |
|---|---|---|
| 插件名 | `dsh-agent-teams` | `dsh-agent-orchestra` |
| 工具前缀 | `agent_teams_*` | `orchestra_*` |
| 状态目录 | `.agent-teams/` | `.agent-orchestra/` |
| 核心能力 | 手动编排（队长拆任务、派活、收结果） | 对话驱动 + 工作流自动接力 |

> 两者可同时安装、互不冲突。

## 状态

- [x] 设计 spec：`docs/specs/2026-08-23-conversation-orchestration-design.md`（对话编排核心）
- [x] 实现（Plan A 改名 → B1/B2 编排核心 → M1 成员气泡 → M2 气泡真实化 → M3 增强）
- [x] 测试：52 项单测全过（bubble 9 / bubble-enrich 9 / workflow 15 / persona 3 / orchestrator 12 / b2 4），宿主编译 0 诊断
- [ ] 构建与安装：需在具备完整 Node 工具链的环境执行（见下「构建与安装」）

## 构建与安装

> **重要**：本插件的 **web 端 client bundle（`lib/client.js`）不是随源码提交的**——它由 `tsdown` 打包生成（`window.__ModuleLoader__` 格式，CSS Modules 经 `lightningcss` 编译内联）。**必须先在具备完整构建工具链的环境执行 `npm install` + 构建，才能安装使用**，否则 web 端会因缺 `lib/client.js` 而无法加载本插件的 UI。

### 前提（构建环境需具备）
- Node.js + npm/pnpm
- 能访问 npm registry（安装 `typescript`、`tsdown`、`lightningcss`、`react` 等 devDependencies）
- 推荐：直接在有完整 Node 工具链的开发机 / CI 上执行

### 第 1 步：构建
```bash
# 在仓库根目录
npm install          # 或 pnpm install（安装 devDependencies：typescript/tsdown/lightningcss/react...）
npm run build        # = tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown
```
- `tsc -p tsconfig.json`：编译 host 端 `src/*` → `lib/*`
- `tsc -p tsconfig.client.json`：编译 `src/client` → `lib/client/`
- `tsdown`：打 web bundle → **`lib/client.js`**（DSH 浏览器加载入口，见 `exports.{"./client"}`）

产出物（应存在）：
```
lib/index.js                 # host 插件入口
lib/client/index.js          # tsc 编译的 client 中间产物
lib/client.js                # tsdown 打的 web bundle（DSH 实际加载）
lib/types/index.d.ts
lib/types/client/index.d.ts
```

### 第 2 步：安装
```bash
# 在具备完整工具链的环境里（或构建产物齐全后回到任一 DSH 环境）
dsh plugin --profile web add ./      # 建 symlink + 追加 bundle（官方方式，勿手动复制 node_modules）
```

### 第 3 步：验证 web 稳定性（防崩溃的最终关卡）
1. 重启 DSH web（加载新 bundle）。
2. 确认插件被识别：以 `pluginInventory` 的 `fiberPhase=active` 为准（**不看 cordis 日志**）。
3. 创建一个团队，在对话里让成员发消息 / 完成任务：
   - 出现**成员气泡**（成员消息气泡可点击跳成员转录；task-done 气泡可跳 captain 转录）
   - 气泡无正文/角色缺失时**降级显示**，页面**不崩溃**
4. 重点冒烟（历史上容易崩的点）：
   - 会话重放（打开历史会话）：气泡是否正常折叠渲染、无异常抛出
   - 畸形/缺失数据：气泡是否兜底、错误边界是否接管而非整页崩溃
   - 快速切换/滚动：ActivityPanel、卡片、气泡是否并存不崩

### 已知环境边界
- 插件源码 `src/client/*` 用 CSS Modules（`.module.css`）；web bundle 依赖 `lightningcss` 编译。若构建环境缺 `lightningcss`，`tsdown` 会报 `Cannot find module 'lightningcss'`——这是构建环境缺依赖，不是代码问题，安装 devDependencies 即可。

## License

MIT
