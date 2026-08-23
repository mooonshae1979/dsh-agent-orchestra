# AgentOrchestra 成员气泡增强（M2）— 真实数据 + 转录跳转 设计

> **状态**：已与用户确认的设计文档。
> **目标**：在 M1 成员气泡基础上，让气泡显示真实角色/任务标题，并支持点击跳转成员子 agent 转录。

## 1. 背景与目标

M1 已实现成员气泡（member-message / task-done），但数据是"参数驱动"的：
- `fromRole` / `fromId` 恒为 `''`
- `taskSubject` 恒为 `undefined`（无标题）
- 气泡只能显示成员名 + "完成任务 tN"

M2 目标：
1. **A. 气泡数据真实化**：显示成员真实角色（fromRole）、成员子 agent 会话 id（fromId，供跳转）、任务标题（taskSubject）。
2. **B. 点击跳成员转录**：点击气泡，跳转到该成员的子 agent 完整对话转录。

**已确认的技术事实（查证）**：
- 工具参数（send_message: to/content/from；update_task: task_id/status/output）**不含** role / 子agent id / task subject。
- 这些数据都在 host 快照 `/plugins/dsh-agent-orchestra/state` 中：`TeamActivityMember { id, name, role }`、`TeamActivityTask { id, subject }`。
- `ActivityPanel` 已用该快照实现成员列表 + 跳转（`openSession(member.id)`）。成员 id = 子 agent 会话 id。

**方案（已确认）**：折叠层不变（保留 M1 参数解析骨架），**渲染组件层补全**——AgentOrchestraBubble 内部 fetch 快照，用成员名/任务 id 匹配出 role/id/subject；并支持点击跳转（`ctx.sessions.open`）。

## 2. 架构

```
（不变）conversation-node 折叠 → 气泡节点 data（参数解析：from/text/taskId）
（新增）AgentOrchestraBubble 内部：
   fetch /plugins/dsh-agent-orchestra/state  → teams
   纯函数 enrichBubble(data, teams) → { role?, sessionId?, taskSubject? }   [可单测]
   渲染：显示补全后的 role / 任务标题；可点击 → ctx.sessions.open(sessionId)
（保留）错误边界 + 数据兜底（防崩溃）
```

数据流：成员写状态 → 快照路由 → 渲染组件 fetch 补全 → 展示/跳转。

## 3. 组件拆分（全部在 src/client，后端零改动）

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/client/bubble-enrich.ts` | Create | 纯函数 `enrichBubble(data, teams)`：按 fromMember 匹配成员 → role/id；按 taskId 匹配任务 → subject |
| `src/client/AgentOrchestraBubble.tsx` | Modify | fetch 快照 + 用 enrichBubble 补全；显示 role/标题；点击跳转 |
| `src/client/AgentOrchestraBubble.module.css` | Modify | 可点击样式（hover/pointer） |
| `src/client/ActivityPanel.tsx` | 复用 | 复用其 STATE_URL / ActivityTeam 类型（import） |
| `tests/bubble-enrich.test.mjs` | Create | enrichBubble 纯函数单测 |

## 4. 数据模型（沿用 M1，无新接口）

`AgentOrchestraBubbleData` 不变。enrichBubble 返回：
```typescript
export interface BubbleEnrichment {
  readonly role: string
  readonly sessionId: string   // 成员子 agent 会话 id，空则不可跳转
  readonly taskSubject: string
}
```

## 5. enrichBubble 纯函数（可单测）

```typescript
import type { ActivityTeam, ActivityMember, ActivityTask } from './ActivityPanel.tsx'
import type { AgentOrchestraBubbleData } from './bubble-pure.ts'

export interface BubbleEnrichment {
  readonly role: string
  readonly sessionId: string
  readonly taskSubject: string
}

/** Match one bubble against the team snapshots; missing matches degrade to ''.
 *  Pure + total: never throws on malformed input. */
export function enrichBubble(
  data: AgentOrchestraBubbleData | undefined,
  teams: readonly ActivityTeam[] | undefined,
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
        if (!role && member.role) role = member.role
        if (!sessionId && member.id) sessionId = member.id
      }
    }
  }
  if (data.kind === 'task-done' && data.taskId) {
    for (const team of teams) {
      if (!team || !Array.isArray(team.tasks)) continue
      for (const task of team.tasks) {
        if (task && task.id === data.taskId && task.subject) { subject = task.subject; break }
      }
      if (subject) break
    }
  }
  return { role, sessionId, taskSubject: subject }
}
```

## 6. 组件增强（AgentOrchestraBubble.tsx）

- import `enrichBubble` + `ActivityTeam`。
- 组件内 `useEffect` fetch `/plugins/dsh-agent-orchestra/state`（`cache:'no-store'`，try/catch，失败不崩），存 `teams` state。
- 渲染前 `const enr = enrichBubble(data, teams)`。
- 头部角色显示 `data.fromRole || enr.role`（补全优先，参数为空用 enr）。
- task-done 元数据：`完成任务 tN: ${enr.taskSubject || data.taskSubject}`（有标题则显示）。
- **点击跳转**：若 `enr.sessionId` 非空，气泡可点击（`onClick` → `ctx.sessions.open(enr.sessionId)`）；用 `sessionId` prop 注入 `openSession`（同 M1 index 的注入）。member-message 气泡也可跳发件人转录。
- **防崩溃**：fetch 失败/超时 → teams 空 → enrich 返回空 → 保持兜底；气泡仍正常显示；错误边界保留。

## 7. 注入 openSession（index.tsx reuse）

AgentOrchestraBubble 需要 `openSession`（跳转）。index.tsx 现有的 `key: 'agent-orchestra'` card 已注入 `openSession`；bubble 的两个 slot（member-message / task-done）也应注入同样的 `openSession`（从 `ctx.sessions.open`）。
参考现有 card 注入写法：
```tsx
inject: (): { openSession: (id: SessionId) => void } => ({
  openSession: (id: SessionId) => { ctx.sessions.open(id) },
})
```
AgentOrchestraBubble props 加 `openSession`。

## 8. 测试

`tests/bubble-enrich.test.mjs`（纯函数，node 可测）：
1. 按 member name 匹配出 role
2. 按 member name 匹配出 sessionId
3. 按 taskId 匹配出 taskSubject
4. data undefined → 空
5. teams undefined/畸形 → 空（不抛错）
6. 跨 team 匹配（成员在两个 team 时取第一个命中的 role/id）
7. task-done 且有 subject → 返回 subject；无匹配 → 空

复用 M1 的 `.bubble-pure.mjs` transpile 思路：把 bubble-enrich.ts transpile 成 `.mjs` 供测试。

## 9. 防崩溃（延续 M1 硬约束）

1. 后端零改动（fetch 是前端读现有快照路由，非新后端）。
2. enrichBubble 纯函数 + 全防御（畸形 input 不抛）。
3. fetch try/catch + 超时兜底 → 无数据时保持兜底显示。
4. 错误边界保留（单泡崩溃降级）。
5. CSS 局部作用域。
6. 点击跳转用注入的 openSession，跳转失败（sessionId 空）时不渲染可点击态。

## 10. Non-Goals
- 实时推送 / 后端新路由 / 修改现有 ActivityPanel 逻辑（仅复用其类型与 STATE_URL）。
- 成员气泡的完整双向即时聊天（保持回顾性气泡）。
- M1 骨架（conversation-node 折叠）不变。

---

> 自审：方案基于已查证的技术事实（数据在快照、ActivityPanel 已用、成员 id=子agent 会话）；enrichBubble 纯函数可测且全防御；跳转复用 openSession 注入；防崩溃 6 条延续 M1；Non-Goals 控制范围。待用户审阅。
