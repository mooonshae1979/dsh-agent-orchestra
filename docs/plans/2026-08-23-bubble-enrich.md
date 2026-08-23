# AgentOrchestra 成员气泡增强实施计划（Plan M2）

> **For agentic workers:** REQUIRED SUB-SKILL: Load the `sp-subagent-driven-development` skill (recommended) or `sp-executing-plans` skill via the `skill` tool to implement this plan task-by-task.

**Goal:** 在 M1 成员气泡基础上：A) 气泡显示真实角色/任务标题/子agent id（从 state 快照补全）；B) 点击气泡跳成员子 agent 转录。纯前端，后端零改动，延续防崩溃。

**Architecture:** 折叠层（M1）不变。新增纯函数 `enrichBubble(data, teams)`（从 `/state` 快照匹配 role/id/subject，全防御可测）；AgentOrchestraBubble 组件内部 fetch 快照 + enrich 补全 + 点击跳转（注入 openSession）；错误边界/data 兜底保留。

**前置**：main 已含 M1（成员气泡 + bubble-pure + error-boundary + 两个 conversation-node）。分支 `feat/bubble-enrich`。

---

## 范围（Scope）

4 个 Task：
1. `bubble-enrich.ts` 纯函数 + 单测
2. 组件增强（fetch + enrich + 显示 role/标题 + 可点击）
3. openSession 注入（index.tsx）
4. 全量验证收尾

## Non-Goals
- 后端改动 / 实时推送 / 改 ActivityPanel 逻辑 / 改 M1 折叠骨架。

---

## File Structure

| 文件 | 动作 |
|---|---|
| `src/client/bubble-enrich.ts` | Create：纯函数 enrichBubble + BubbleEnrichment |
| `src/client/AgentOrchestraBubble.tsx` | Modify：fetch 快照 + enrich 补全 + 显示 + 可点击 |
| `src/client/AgentOrchestraBubble.module.css` | Modify：可点击 hover 样式 |
| `src/client/index.tsx` | Modify：气泡 slot 注入 openSession |
| `tests/bubble-enrich.test.mjs` | Create：enrichBubble 单测 |

---

## Task 1: bubble-enrich.ts 纯函数 + 单测

**Files:**
- Create: `src/client/bubble-enrich.ts`
- Create: `tests/bubble-enrich.test.mjs`

- [ ] **Step 1: 创建 `src/client/bubble-enrich.ts`（纯 TS，无 DSH/react 依赖，可 node 测）**

```typescript
import type { AgentOrchestraBubbleData } from './bubble-pure.ts'

/** One member row of a host snapshot (structural subset; avoid ActivityPanel import to keep pure). */
export interface EnrichMember { readonly id?: string; readonly name?: string; readonly role?: string }
/** One task row of a host snapshot. */
export interface EnrichTask { readonly id?: string; readonly subject?: string }
/** One team snapshot (structural subset). */
export interface EnrichTeam {
  readonly members?: readonly EnrichMember[]
  readonly tasks?: readonly EnrichTask[]
}

export interface BubbleEnrichment {
  readonly role: string
  readonly sessionId: string
  readonly taskSubject: string
}

/** Match one bubble against team snapshots; missing matches degrade to ''.
 *  Pure + total: never throws on malformed input. */
export function enrichBubble(
  data: AgentOrchestraBubbleData | undefined,
  teams: readonly EnrichTeam[] | undefined,
): BubbleEnrichment {
  const empty: BubbleEnrichment = { role: '', sessionId: '', taskSubject: '' }
  if (data === undefined || !Array.isArray(teams)) return empty
  const from = data.fromMember ?? ''
  let role = ''
  let sessionId = ''
  let subject = ''
  for (const team of teams) {
    if (!team || !Array.isArray(team.members)) continue
    for (const member of team.members) {
      if (member && member.name === from) {
        if (role === '' && member.role) role = member.role
        if (sessionId === '' && member.id) sessionId = member.id
      }
    }
  }
  if (data.kind === 'task-done' && data.taskId) {
    for (const team of teams) {
      if (!team || !Array.isArray(team.tasks)) continue
      for (const task of team.tasks) {
        if (task && task.id === data.taskId && task.subject) { subject = task.subject; break }
      }
      if (subject !== '') break
    }
  }
  return { role, sessionId, taskSubject: subject }
}
```

> 说明：用结构子集类型而非 import ActivityPanel（保持纯函数零耦合、node 可测）。真实快照的 `ActivityMember`/`ActivityTask` 结构兼容。

- [ ] **Step 2: 转译供测试（同 M1 方式）**

```bash
node -e "
const ts = require('C:/Users/Administrator/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js');
const fs = require('fs');
const src = fs.readFileSync('src/client/bubble-enrich.ts', 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: 'bubble-enrich.ts', reportDiagnostics: true });
if (out.diagnostics && out.diagnostics.length) { for (const d of out.diagnostics) console.log('DIAG', ts.flattenDiagnosticMessageText(d.messageText, ' ')); process.exit(1); }
fs.writeFileSync('tests/.bubble-enrich.mjs', out.outputText);
console.log('transpiled');
"
```

- [ ] **Step 3: 创建 `tests/bubble-enrich.test.mjs`（7 条）**

```javascript
import assert from 'node:assert/strict'
import { enrichBubble } from './.bubble-enrich.mjs'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

const teams = [{
  members: [{ id: 'sess-1', name: 'alice', role: 'researcher' }, { id: 'sess-2', name: 'bob', role: 'engineer' }],
  tasks: [{ id: 't1', subject: '调研主题' }, { id: 't2', subject: '实现功能' }],
}]

t('match member role', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'hi', ts: 1 }, teams)
  assert.equal(r.role, 'researcher')
})
t('match member sessionId', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'bob', fromRole: '', fromId: '', text: 'hi', ts: 1 }, teams)
  assert.equal(r.sessionId, 'sess-2')
})
t('match task subject', () => {
  const r = enrichBubble({ kind: 'task-done', fromMember: 'bob', fromRole: '', fromId: '', taskId: 't1', text: 'o', ts: 1 }, teams)
  assert.equal(r.taskSubject, '调研主题')
})
t('undefined data → empty', () => {
  assert.deepStrictEqual(enrichBubble(undefined, teams), { role: '', sessionId: '', taskSubject: '' })
})
t('undefined/malformed teams → empty, no throw', () => {
  assert.deepStrictEqual(enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'x', ts: 1 }, undefined), { role: '', sessionId: '', taskSubject: '' })
  assert.deepStrictEqual(enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'x', ts: 1 }, [null, { members: 'bad' }]), { role: '', sessionId: '', taskSubject: '' })
})
t('no match → empty fields', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'carol', fromRole: '', fromId: '', text: 'x', ts: 1 }, teams)
  assert.deepStrictEqual(r, { role: '', sessionId: '', taskSubject: '' })
})
t('task-done no matching task → empty subject', () => {
  const r = enrichBubble({ kind: 'task-done', fromMember: 'bob', fromRole: '', fromId: '', taskId: 'nope', text: 'o', ts: 1 }, teams)
  assert.equal(r.taskSubject, '')
})

console.log('\nbubble-enrich: ' + passed + ' passed')
```

- [ ] **Step 4: 跑单测**

```bash
node tests/bubble-enrich.test.mjs
```
Expected: 7 条 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/client/bubble-enrich.ts tests/bubble-enrich.test.mjs tests/.bubble-enrich.mjs
git commit -m "feat(bubble-enrich): pure enrichBubble helper + unit tests"
```

---

## Task 2: AgentOrchestraBubble 组件增强（fetch + enrich + 显示 + 可点击）

**Files:**
- Modify: `src/client/AgentOrchestraBubble.tsx`
- Modify: `src/client/AgentOrchestraBubble.module.css`

- [ ] **Step 1: 增强组件**

修改 `src/client/AgentOrchestraBubble.tsx`：
1. import `enrichBubble, type EnrichTeam` from './bubble-enrich.ts'；`useEffect`（已有 useState）。
2. props 加 `openSession?: (id: string) => void`。
3. 组件内 fetch 快照：
```tsx
const [teams, setTeams] = useState<readonly EnrichTeam[]>([])
useEffect(() => {
  let cancelled = false
  const load = async (): Promise<void> => {
    try {
      const res = await fetch('/plugins/dsh-agent-orchestra/state', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { teams?: readonly EnrichTeam[] }
      if (!cancelled && Array.isArray(body?.teams)) setTeams(body.teams)
    } catch {
      // Host restarting; keep prior/empty enrichment, never throw.
    }
  }
  void load()
  return () => { cancelled = true }
}, [])
```
4. 渲染补全：
```tsx
const enr = enrichBubble(data, teams)
const member = data?.fromMember ? data.fromMember : '未知成员'
const role = (data?.fromRole || enr.role) ? (' · ' + (data.fromRole || enr.role)) : ''
const subject = data?.kind === 'task-done' ? (enr.taskSubject || data.taskSubject || '') : 

const subject = data?.kind === 'task-done' ? (enr.taskSubject || data.taskSubject || '') : ''
const meta = data?.kind === 'member-message'
  ? ('→ ' + (data.toMember || 'captain'))
  : (data?.kind === 'task-done' ? ('完成任务 ' + (data.taskId || '') + (subject ? ': ' + subject : '')) : '')
```
5. 可点击跳转：
```tsx
const canNavigate = Boolean(enr.sessionId) && typeof openSession === 'function'
const rootProps = {
  className: css.root,
  'data-bubble-kind': data?.kind ?? '',
  'data-bubble-from': data?.fromMember ?? '',
  ...(canNavigate ? { onClick: () => openSession(enr.sessionId), 'data-navigable': '', title: ('打开 ' + member + ' 的对话') } : {}),
}
```
根 div 用 `{...rootProps}`。
6. 保持防御性 + 现有折叠展开逻辑（collapseText / expanded / 按钮）不变。

- [ ] **Step 2: CSS 增强**

在 `AgentOrchestraBubble.module.css` 加：
```css
.root[data-navigable] { cursor: pointer; transition: background 0.12s ease; }
.root[data-navigable]:hover { background: #f1f5f9; }
```

- [ ] **Step 3: client 语法检查（排除 .css）**

对 `src/client/AgentOrchestraBubble.tsx`、`bubble-enrich.ts` 等 TS/TSX 跑 transpileModule。Expected: OK。

- [ ] **Step 4: 提交**

```bash
git add src/client/AgentOrchestraBubble.tsx src/client/AgentOrchestraBubble.module.css
git commit -m "feat(bubble-enrich): fetch snapshot, enrich role/subject, navigable bubble"
```

---

## Task 3: openSession 注入（index.tsx）

**Files:**
- Modify: `src/client/index.tsx`

- [ ] **Step 1: 气泡 slot 注入 openSession**

修改 `src/client/index.tsx` 两个气泡 slot（member-message / task-done）的 `register`，加 `inject`（参照现有 card 的 inject 写法）：
```tsx
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'member-message',
    inject: (): { openSession: (id: SessionId) => void } => ({
      openSession: (id: SessionId) => { ctx.sessions.open(id) },
    }),
  }, (props: { node: { data: AgentOrchestraBubbleData } } & { openSession: (id: SessionId) => void }) => (
    <BubbleErrorBoundary><AgentOrchestraBubble data={props.node.data} openSession={props.openSession} /></BubbleErrorBoundary>
  )))
```
task-done 同。注意：`SessionId` 已 import；渲染器 props 类型需包含注入的 openSession（可与 card 类似用组合类型或显式 intersection）。

- [ ] **Step 2: 宿主编译 + client 语法**

宿主编译 pre 0；client 语法（含 index.tsx）。Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/client/index.tsx
git commit -m "feat(bubble-enrich): inject openSession into bubble slots for transcript navigation"
```

---

## Task 4: 全量验证收尾

- [ ] **Step 1: 宿主编译**：pre 0。
- [ ] **Step 2: client 全量语法检查**：0 错误。
- [ ] **Step 3: 全部单测**：bubble 9 + bubble-enrich 7 + workflow 15 + persona 3 + orchestrator 12 + b2 4 = 50 passed。
- [ ] **Step 4: 提交（如有微调）**：`git add -A && git commit -m "test(bubble-enrich): final verification"`。

## 验证与验收

1. 宿主编译 0 诊断。
2. client 语法通过。
3. bubble-enrich 7 + 既有 43 = 50 单测全过。
4. 气泡显示真实 role/任务标题；可点击跳成员转录（有 sessionId 时）。
5. 防崩溃：fetch 失败/无匹配兜底；错误边界保留。

## Non-Goals
- 后端改动 / 实时推送 / 改 ActivityPanel 逻辑 / 改 M1 折叠骨架。

## Self-Review

**1. Spec 覆盖**：enrichBubble 纯函数 → Task1；组件 fetch+enrich+显示+可点击 → Task2；openSession 注入 → Task3；验证 → Task4。✅
**2. Placeholder**：无 TBD；每 Task 有代码与命令。✅
**3. Type consistency**：EnrichTeam/EnrichMember/EnrichTask 结构子集与真实快照兼容；BubbleEnrichment 在 bubble-enrich 定义、组件引用一致；openSession 类型在 index 注入与组件 props 一致；单测断言与实现一致。✅
