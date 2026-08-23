# dsh-agent-orchestra 全面改名实施计划（Plan A）

> **For agentic workers:** REQUIRED SUB-SKILL: Load the `sp-subagent-driven-development` skill (recommended) or `sp-executing-plans` skill via the `skill` tool to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把从 `dsh-agent-teams` 复制过来的源码全面改名为 `dsh-agent-orchestra` 的命名体系，使插件名、工具前缀、事件名、路由、CSS、状态目录、文档全部自洽，且与 `dsh-agent-teams` 可并存安装、互不冲突。**本计划不做任何功能新增**，是纯重构（功能等价）。

**Architecture:** 命名映射表唯一确定：`agent_teams_*`（工具前缀）→ `orchestra_*`；`agent-teams`（连字符形态：事件/路由/CSS/目录/模块名）→ `agent-orchestra`；`dsh-agent-teams`（包名）→ `dsh-agent-orchestra`；`AgentTeams`（组件名/概念）→ `AgentOrchestra`（或 `Orchestra`，见 Task 说明）；`.agent-teams`（状态目录）→ `.agent-orchestra`。每完成一个命名域，运行 `pnpm typecheck` + `pnpm build` + `node scripts/verify.mjs` 验证等价，再提交。

**Tech Stack:** TypeScript（node ESM + 浏览器 client 两半），`@deepseek-ai/dsh-*`，pnpm。

---

## 命名映射总表（本计划唯一事实源）

| 源串 | 目标串 | 用于 |
|---|---|---|
| `agent_teams_` | `orchestra_` | 工具前缀（9 个工具）、成员 persona 文案、systemPrompt 文案、card 判据里的工具名 |
| `agent-teams` | `agent-orchestra` | 事件名、窗口事件、路由、CSS 变量/属性、模块路径注释、活动面板日志前缀 |
| `dsh-agent-teams` | `dsh-agent-orchestra` | 包名、文档、README、安装命令 |
| `.agent-teams` | `.agent-orchestra` | 状态目录默认值（`src/index.ts`） |
| `AgentTeams` | `AgentOrchestra` | 组件名、接口名、card 渲染 key（`conversation.chat.node` 的 key） |
| `agent-teams-card-definition` | `agent-orchestra-card-definition` | client 文件名（下划线表意对应 `orchestra` 前缀） |

> 注意：`agent-teams` 与 `agent_orchestra`（文件/模块用下划线）与 `agent-orchestra`（标识符用连字符）三者在不同语境使用——**遵循源文件现有风格**：标识符/注册 key/路由/事件用连字符 `agent-orchestra`；工具名用下划线 `orchestra_`；源码文件名 `agent-teams-card-definition.ts` → `agent-orchestra-card-definition.ts`。

---

## File Structure（本计划涉改文件）

| 文件 | 改动内容 |
|---|---|
| `src/types.ts` | 模块注释 `dsh-agent-teams/types` → `dsh-agent-orchestra/types` |
| `src/events.ts` | 模块注释 + 日志前缀 `agent-teams:` → `agent-orchestra:` |
| `src/state.ts` | 模块注释 |
| `src/event-types.ts` | 模块注释；事件类型 `agent-teams/*` → `agent-orchestra/*`；`SessionEventMap` 键 |
| `src/index.ts` | `export const name='agent-teams'`→`'agent-orchestra'`；默认状态目录 `.agent-teams`→`.agent-orchestra`；usage 段工具名；systemPrompt 段名；路由 `/plugins/dsh-agent-teams/...`→`/plugins/dsh-agent-orchestra/...`；assets 目录 |
| `src/members.ts` | MEMBER_DENIED_TOOLS / MINIMAL_MEMBER_TOOLS 工具名；persona 文案；模块注释 |
| `src/tools.ts` | 9 个工具注册名；systemPrompt 引用的工具名；`@module`；日志 |
| `src/snapshot.ts` | 日志前缀 `agent-teams:`→`agent-orchestra:`；`@module` |
| `src/client/*` | 事件名、路由、CSS 变量/属性、card key、组件名、渲染判据工具名、模块注释 |
| `scripts/verify.mjs` | 引用的 `agent-teams-card-definition` 模块路径、`steerCaptainReport`（无工具名依赖）、断言文案 |
| `docs/*`、`README.md`、`skills/*/SKILL.md` | 所有 `agent_teams_*`/`dsh-agent-teams`/`agent-teams` 文案与命令 |
| `cordis.patch.yml` | 已改（首提交完成）；本计划复核即可 |

---

## Task 1: 事件系统改名（event-types / events）

**Files:**
- Modify: `src/event-types.ts`
- Modify: `src/events.ts`

- [ ] **Step 1: 改 `src/event-types.ts` 事件名与模块注释**

将文件中所有 `'agent-teams/...'` 事件键与 `agent-teams/*` 注释改为 `'agent-orchestra/...'`。具体替换（用编辑器全局替换该文件内 `agent-teams` → `agent-orchestra`）：

```diff
- * @module dsh-agent-teams/event-types
+ * @module dsh-agent-orchestra/event-types
...
-    'agent-teams/team-created': AgentTeamsTeamCreatedData
+    'agent-orchestra/team-created': AgentTeamsTeamCreatedData
-    'agent-teams/member-added': AgentTeamsMemberAddedData
+    'agent-orchestra/member-added': AgentTeamsMemberAddedData
-    'agent-teams/member-removed': AgentTeamsMemberRemovedData
+    'agent-orchestra/member-removed': AgentTeamsMemberRemovedData
-    'agent-teams/task-created': AgentTeamsTaskCreatedData
+    'agent-orchestra/task-created': AgentTeamsTaskCreatedData
-    'agent-teams/task-updated': AgentTeamsTaskUpdatedData
+    'agent-orchestra/task-updated': AgentTeamsTaskUpdatedData
-    'agent-teams/message-sent': AgentTeamsMessageSentData
+    'agent-orchestra/message-sent': AgentTeamsMessageSentData
-    'agent-teams/team-deleted': AgentTeamsTeamDeletedData
+    'agent-orchestra/team-deleted': AgentTeamsTeamDeletedData
-  | 'agent-teams/team-created'
+  | 'agent-orchestra/team-created'
...（所有 `'agent-teams/*'` 字面量同此替换）
```

> 保留 `AgentTeams*Data` 接口类型名不变（它们只是本地 TS 类型名，不改也不影响对外契约；避免无谓改动）。`AgentTeamsEventType` 联合类型值全部改为 `agent-orchestra/*`。

- [ ] **Step 2: 改 `src/events.ts` 日志前缀与模块注释**

```diff
- * @module dsh-agent-teams/events
+ * @module dsh-agent-orchestra/events
...
-      ctx.logger.debug(`agent-teams: session event "${type}" omitted because this harness does not recognize it`)
+      ctx.logger.debug(`agent-orchestra: session event "${type}" omitted because this harness does not recognize it`)
-    ctx.logger.warn(`agent-teams: session record failed after ${type}: ${String(error)}`)
+    ctx.logger.warn(`agent-orchestra: session record failed after ${type}: ${String(error)}`)
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 0 错误（事件类型改名不影响编译，因事件在宿主词表外本就被跳过）。

- [ ] **Step 4: 提交**

```bash
git add src/event-types.ts src/events.ts
git commit -m "refactor: rename agent-teams/* session events to agent-orchestra/*"
```

---

## Task 2: 工具注册名与插件名（tools / members / index 核心）

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/members.ts`
- Modify: `src/index.ts`

> 这一步是工具契约改名，是 Plan A 的核心。9 个工具名 `agent_teams_*` → `orchestra_*`，所有引用处（members 的 DENIED/MINIMAL 列表、index 的 usage 文案与工具名数组、persona 文案）必须同步。

- [ ] **Step 1: `src/tools.ts` — 9 个工具注册名改为 `orchestra_*`**

将以下 `name:` 字面量替换：

```diff
-    name: 'agent_teams_create',
+    name: 'orchestra_create',
-    name: 'agent_teams_add_member',
+    name: 'orchestra_add_member',
-    name: 'agent_teams_remove_member',
+    name: 'orchestra_remove_member',
-    name: 'agent_teams_create_task',
+    name: 'orchestra_create_task',
-    name: 'agent_teams_claim_task',
+    name: 'orchestra_claim_task',
-    name: 'agent_teams_update_task',
+    name: 'orchestra_update_task',
-    name: 'agent_teams_send_message',
+    name: 'orchestra_send_message',
-    name: 'agent_teams_status',
+    name: 'orchestra_status',
-    name: 'agent_teams_delete',
+    name: 'orchestra_delete',
```

同时在 `src/tools.ts` 内所有描述文案、`@module`、以及提及 `agent_teams_*` 的地方同步替换为 `orchestra_*`/`AgentOrchestra`（描述里的"agent_teams_status"等引用）。

> 注意 tools.ts 的描述文本里引用了其他工具名（如 add_member 描述里提到 agent_teams_add_member），都要同步。可用编辑器对该文件做 `agent_teams_` → `orchestra_` 的全局替换，再人工核对 `name:` 与描述一致。

- [ ] **Step 2: `src/members.ts` — DENIED/MINIMAL 工具列表 + persona 文案**

将 `MEMBER_DENIED_TOOLS` 与 `MINIMAL_MEMBER_TOOLS` 数组元素全部替换为 `orchestra_*`：

```diff
const MEMBER_DENIED_TOOLS = [
-  'agent_teams_create',
-  'agent_teams_add_member',
-  'agent_teams_remove_member',
-  'agent_teams_create_task',
-  'agent_teams_delete',
+  'orchestra_create',
+  'orchestra_add_member',
+  'orchestra_remove_member',
+  'orchestra_create_task',
+  'orchestra_delete',
] as const
```

```diff
const MINIMAL_MEMBER_TOOLS = [
-  'pwsh',
-  'str_replace_editor',
-  'agent_teams_claim_task',
-  'agent_teams_update_task',
-  'agent_teams_send_message',
-  'agent_teams_status',
+  'pwsh',
+  'str_replace_editor',
+  'orchestra_claim_task',
+  'orchestra_update_task',
+  'orchestra_send_message',
+  'orchestra_status',
] as const
```

将 `memberPersona` 文案里的全部 `agent_teams_*` 引用改为 `orchestra_*`（claim_task / update_task / send_message / status）。

- [ ] **Step 3: `src/index.ts` — 插件名、状态目录、usage 文案、段名**

```diff
-export const name = 'agent-teams'
+export const name = 'agent-orchestra'
```

```diff
-   * `<workspace>/<stateDir>/<teamId>/` (default `.agent-teams`).
+   * `<workspace>/<stateDir>/<teamId>/` (default `.agent-orchestra`).
-  stateDir: z.string().default('.agent-teams'),
+  stateDir: z.string().default('.agent-orchestra'),
-    stateDir: config.stateDir ?? '.agent-teams',
+    stateDir: config.stateDir ?? '.agent-orchestra',
```

将 `usageSectionText` 与工具名数组里所有 `agent_teams_*` → `orchestra_*`（9 个）；将 `ctx.systemPrompt.section({ name: 'agent-teams:usage', ... })` → `name: 'agent-orchestra:usage'`。

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: 0 错误。

- [ ] **Step 5: 跑现有离线冒烟**

Run: `node scripts/verify.mjs`
Expected: 全部 PASS 或仅有文档断言文案不匹配（若 verify 里硬编码了旧工具名则在 Task 5 修；逻辑断言应全过）。

- [ ] **Step 6: 提交**

```bash
git add src/tools.ts src/members.ts src/index.ts
git commit -m "refactor: rename agent_teams_* tools to orchestra_* and plugin name to agent-orchestra"
```

---

## Task 3: 路由/CSS/资产路径（index / client / snapshot）

**Files:**
- Modify: `src/index.ts`
- Modify: `src/snapshot.ts`
- Modify: `src/client/*`（ActivityPanel / AgentTeamsCard / artwork / index）

- [ ] **Step 1: `src/index.ts` — HTTP 路由与资产路径改为 orchestra**

```diff
-    path: '/plugins/dsh-agent-teams/state',
+    path: '/plugins/dsh-agent-orchestra/state',
-  }), 'agent-teams: activity route')
+  }), 'agent-orchestra: activity route')
-  const artDir = fileURLToPath(new URL('../assets/agent-teams/', import.meta.url))
+  const artDir = fileURLToPath(new URL('../assets/agent-teams/', import.meta.url))
...
-      path: '/plugins/dsh-agent-teams/assets',
+      path: '/plugins/dsh-agent-orchestra/assets',
-    }), 'agent-teams: artwork route')
+    }), 'agent-orchestra: artwork route')
-        ctx.logger.warn(`agent-teams: artwork read failed for ${name}: ${String(error)}`)
+        ctx.logger.warn(`agent-orchestra: artwork read failed for ${name}: ${String(error)}`)
```

> `assets/agent-teams/` 物理目录名可保留（只是静态资源目录，无对外契约），但为一致性可将目录改名为 `assets/agent-orchestra/` 并同步 `new URL('../assets/agent-orchestra/', ...)`。若为降低风险保留目录名，需在 package.json `files` 里同步。**本计划采用：改名为 `assets/agent-orchestra/`。**

```bash
# 重命名资产目录
git mv assets/agent-teams assets/agent-orchestra
```

并在 `package.json` 的 `files` 数组把 `"assets/agent-teams"` → `"assets/agent-orchestra"`。

- [ ] **Step 2: `src/snapshot.ts` — 日志前缀**

```diff
-    ctx.logger.warn(`agent-teams: activity listing failed for ${state.name}: ${String(error)}`)
+    ctx.logger.warn(`agent-orchestra: activity listing failed for ${state.name}: ${String(error)}`)
-      ctx.logger.warn(`agent-teams: mailbox read failed for ${member.name}: ${String(error)}`)
+      ctx.logger.warn(`agent-orchestra: mailbox read failed for ${member.name}: ${String(error)}`)
-        ctx.logger.warn(`agent-teams: skipped unreadable team state "${entry.name}" ...`)
+        ctx.logger.warn(`agent-orchestra: skipped unreadable team state "${entry.name}" ...`)
-        ctx.logger.warn(`agent-teams: skipped unreadable archived team "${teamId}" ...`)
+        ctx.logger.warn(`agent-orchestra: skipped unreadable archived team "${teamId}" ...`)
```

`@module` 注释同步。

- [ ] **Step 3: client — 路由、窗口事件、CSS 变量/属性、card key**

列出 `src/client/*` 需改的关键点（用 `agent-teams` → `agent-orchestra`、`AgentTeams` → `AgentOrchestra` 全局替换后人工核对）：

- `ActivityPanel.tsx`：`STATE_URL = '/plugins/dsh-agent-teams/state'` → `'/plugins/dsh-agent-orchestra/state'`；`PANEL_OPEN_ATTRIBUTE = 'data-agent-teams-panel-open'` → `'data-agent-orchestra-panel-open'`；模块注释；`AgentTeamsCardData` 导入路径。
- `AgentTeamsCard.tsx`：`OPEN_PANEL_EVENT = 'agent-teams:open-panel'` → `'agent-orchestra:open-panel'`；`PropsRuntime<'conversation.chat.node', 'agent-teams'>` → `'agent-orchestra'`；路由 URL；`data-agent-teams-card` → `data-agent-orchestra-card`；模块注释。
- `agent-teams-card-definition.ts` → **重命名为** `agent-orchestra-card-definition.ts`；内部 `kind: 'agent-teams'` → `'agent-orchestra'`；`SessionEventMap` 声明 `'agent-teams': AgentTeamsCardData` → `'agent-orchestra': AgentOrchestraCardData`；判据里 `event.data.name === 'agent_teams_create'` → `'orchestra_create'`；错误文案。
- `ActivityPanel.module.css`：所有 `--agent-teams-*` CSS 变量、`[data-agent-teams-panel-open]`、`data-agent-teams-activity` → `--agent-orchestra-*`、`[data-agent-orchestra-panel-open]`、`data-agent-orchestra-activity`。
- `AgentTeamsCard.tsx`/`AgentTeamsCard.module.css`：组件名 `AgentTeamsCard` → `AgentOrchestraCard`；CSS 类名 `agent-teams-card` → `agent-orchestra-card`。
- `activity-model.ts`：无 `agent-teams` 字符串（前面 grep 为 0），但若引用 `AgentTeamsCardData` 类型名则同步。
- `artwork.ts`：`ART_BASE = '/plugins/dsh-agent-teams/assets/'` → `'/plugins/dsh-agent-orchestra/assets/'`；模块注释。
- `index.tsx`：`agent-teams-card-definition` 导入路径 → `agent-orchestra-card-definition`；`key: 'agent-teams'` → `'agent-orchestra'`；effect 标签 `'agent-teams: activity panel'` → `'agent-orchestra: activity panel'`。

组件/接口类型名 `AgentTeams*` → `AgentOrchestra*`（`AgentTeamsCardData` → `AgentOrchestraCardData`、`AgentTeamsCardProps` → `AgentOrchestraCardProps` 等），保持引用一致。

- [ ] **Step 4: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 0 错误，`lib/` 重新生成，client bundle 含 `agent-orchestra` 而不再含 `agent-teams`（`grep -r agent-teams lib/ | wc -l` 应为 0）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: rename routes, css, card key and client identifiers to agent-orchestra"
```

---

## Task 4: 工具注册名改动同步到事件/路由外的文档与脚本

**Files:**
- Modify: `scripts/verify.mjs`
- Modify: `docs/*.md`、`README.md`、`skills/dsh-plugin-development/SKILL.md`

- [ ] **Step 1: `scripts/verify.mjs` 同步模块路径与断言**

将 verify.mjs 里 `import ... from '../lib/client/agent-teams-card-definition.js'`（若存在）改为 `agent-orchestra-card-definition.js`；检查是否有硬编码 `agent_teams_*`/`agent-teams` 断言文案并同步。

```bash
grep -n "agent-teams\|agent_teams\|dsh-agent-teams" scripts/verify.mjs
```

逐个同步为对应 orchestra 形态（模块路径 `agent-orchestra-card-definition`、文案 `orchestra_*`/`agent-orchestra`）。

- [ ] **Step 2: 文档与 README 全局改名**

对新仓库内所有 `docs/*.md`、`README.md`、`skills/dsh-plugin-development/SKILL.md` 做以下替换（注意 README 已手写新版，只需复核）：

```bash
# 工具前缀
grep -rl 'agent_teams_' docs README.md skills | xargs sed -i 's/agent_teams_/orchestra_/g'
# 包名
grep -rl 'dsh-agent-teams' docs README.md skills | xargs sed -i 's/dsh-agent-teams/dsh-agent-orchestra/g'
# 事件/路由/目录（连字符形态）
grep -rl 'agent-teams' docs README.md skills | xargs sed -i 's/agent-teams/agent-orchestra/g'
# 状态目录
grep -rl '\.agent-teams' docs README.md skills | xargs sed -i 's/\.agent-teams/.agent-orchestra/g'
```

> 警告：不要对 `src/` 用此粗暴 sed（Task 2/3 已精确处理）。仅限 docs/README/skills。`agent-teams`→`agent-orchestra` 后，`agent_teams_` 的连字符形态会先被上一条 `orchestra_` 覆盖，顺序无冲突（`agent_teams_` 含下划线，不匹配 `agent-teams` 连字符）。

- [ ] **Step 3: 全仓库残留扫描**

```bash
cd <repo-root>
grep -rIn 'agent_teams_\|dsh-agent-teams\|agent-teams\|\.agent-teams' src scripts docs README.md skills cordis.patch.yml package.json 2>/dev/null
```

Expected: 除 `docs/` 内可能遗留的历史性说明（如有意保留的迁移说明）外，源码/脚本/配置应全部为 0 残留。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: sync rename into docs, scripts and skills"
```

---

## Task 5: 全量验证收尾

**Files:**
- Regenerate: `lib/`（`pnpm build`）
- Verify: `scripts/verify.mjs`、`pnpm typecheck`

- [ ] **Step 1: 完整构建 + 类型检查**

Run: `pnpm build && pnpm typecheck`
Expected: 成功，0 错误。

- [ ] **Step 2: 离线冒烟**

Run: `node scripts/verify.mjs`
Expected: 全部 PASS，`failures=0`。

- [ ] **Step 3: 残留扫描（最终）**

```bash
grep -rIn 'agent_teams_\|dsh-agent-teams\|agent-teams' src scripts package.json cordis.patch.yml 2>/dev/null
```

Expected: 0 残留（`assets/agent-orchestra` 目录名、`src/client/agent-orchestra-card-definition.ts` 已就位）。

- [ ] **Step 4: 确认构建产物也干净**

```bash
grep -rIn 'agent-teams\|agent_teams' lib/ 2>/dev/null | wc -l
```

Expected: 0（`lib/` 由 `pnpm build` 从改名后的 src 重新生成）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "build: regenerate lib after full rename to agent-orchestra"
```

---

## 验证与验收

1. `pnpm typecheck`：0 错误。
2. `pnpm build`：成功，`lib/` 生成。
3. `node scripts/verify.mjs`：全部 PASS，`failures=0`。
4. `grep -rIn 'agent_teams_|dsh-agent-teams|agent-teams' src scripts package.json cordis.patch.yml`：0 残留。
5. `grep -rIn 'agent-teams|agent_teams' lib/`：0。
6. 9 个工具注册名全部为 `orchestra_*`；插件 `export const name='agent-orchestra'`；状态目录默认 `.agent-orchestra`；路由 `/plugins/dsh-agent-orchestra/*`；CSS/事件/card key 均 `agent-orchestra`。
7. 与 `dsh-agent-teams` 并存不冲突（工具名/目录/路由/事件均不同前缀）。

---

## Non-Goals（本计划不做）

- ❌ 不新增任何对话编排功能（那是 Plan B）。
- ❌ 不改 `AgentTeams*Data` 本地 TS 类型名（保持最小改动；如需统一风格可后续）。
- ❌ 不在本计划接入 AI 小说家 / 写作流（Plan B）。
- ❌ 不处理 `C:\g` 与 `G:\` 的环境路径歧义（仅文档落位，非本插件问题）。

---

## Self-Review

**1. Spec 覆盖**：本计划对应 spec 的「与 dsh-agent-teams 的差异」表（插件名/工具前缀/状态目录/路由）——全覆盖。✅
**2. Placeholder scan**：无 TBD；每步给了确切目标串或 sed 命令。✅
**3. Type consistency**：
- 工具名：`orchestra_create` 等 9 个在 tools.ts 注册，members 的 DENIED/MINIMAL 列表、index usage、persona 文案、client card 判据全部同步为同名字面量。✅
- 插件名：`index.ts export const name='agent-orchestra'` 与 cordis.patch.yml `id: agent-orchestra` 一致。✅
- 事件名：event-types.ts 的 `agent-orchestra/*` 在 events.ts 日志/emit 处一致（emit 用事件名变量，不需额外改）。✅
- 路由：client `'/plugins/dsh-agent-orchestra/*'` 与 index.ts 注册路由一致；artwork `ART_BASE` 与 assets 重命名后路径一致。✅

> 已发现一个需在实现时注意的坑：`src/client/agent-teams-card-definition.ts` 重命名为 `agent-orchestra-card-definition.ts` 后，`ActivityPanel.tsx`/`AgentTeamsCard.tsx`/`index.tsx` 的 import 路径必须同步（Task 3 Step 3 已列）。