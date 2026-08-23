# AgentOrchestra 成员气泡增强（M3）— task-done 跳转 + 共享快照 设计+计划

> **状态**：已与用户确认（推荐 A+B，C 实时推送暂缓）。
> **目标**：M3 = A) task-done 气泡也能点击跳 captain 转录；B) 共享快照 fetch（多个气泡复用一次，降低并发 I/O）。

## 背景

M1/M2 已实现成员气泡 + 真实数据 + 点击跳成员转录。M3 两点增强：

**A. task-done 跳 captain**：M2 中 task-done 气泡的 fromMember 是 captain（不在 members[] 内），故不可点击跳转。M3 让 `enrichBubble` 在 `from === 'captain'` 时匹配 `team.captainSessionId`，使 task-done 气泡可跳 captain 转录。

**B. 共享快照 fetch**：当前每个气泡组件各自 `fetch /state`，气泡多时并发放大 I/O。M3 做模块级共享缓存：插件层 fetch 一次，多个气泡复用（带 TTL），降低请求量。

**防崩溃**：延续 M1/M2 硬约束（纯前端、错误边界、数据兜底、全防御纯函数）。

## A. enrichBubble 扩展（task-done 跳 captain）

### 改动 `src/client/bubble-enrich.ts`
- `EnrichTeam` 加字段：`readonly captainSessionId?: string`
- `enrichBubble` 成员匹配逻辑扩展：先按 fromMember 匹配 members（现有）；**若匹配不到 sessionId，且 from === 'captain'，用 team.captainSessionId**：
```typescript
for (const team of teams) {
  if (!team) continue
  if (sessionId === '' && from === 'captain' && team.captainSessionId) sessionId = team.captainSessionId
}
```
（可放在成员循环之后、task 匹配之前；保持纯函数 + 全防御。）

### 单测补充（tests/bubble-enrich.test.mjs，+2 条）
1. `task-done from captain matches captainSessionId`：data {kind:'task-done', fromMember:'captain', taskId:'t1'} + teams[{captainSessionId:'cap-1', members:[], tasks:[{id:'t1',subject:'x'}]}] → sessionId='cap-1'
2. `captain but team has no captainSessionId → empty`：teams[{members:[]}] → sessionId=''

## B. 共享快照 fetch

### 新增 `src/client/bubble-teams.ts`（模块级共享 fetch，纯前端）
```typescript
import type { EnrichTeam } from './bubble-enrich.ts'

const STATE_URL = '/plugins/dsh-agent-orchestra/state'
const TTL_MS = 2000

let cachedPromise: Promise<readonly EnrichTeam[]> | undefined
let cachedAt = 0

/** Shared snapshot loader: multiple bubbles reuse one in-flight/fresh promise. */
export function loadTeams(): Promise<readonly EnrichTeam[]> {
  const now = Date.now()
  if (cachedPromise === undefined || now - cachedAt > TTL_MS) {
    cachedAt = now
    cachedPromise = (async () => {
      try {
        const res = await fetch(STATE_URL, { cache: 'no-store' })
        if (!res.ok) return []
        const body = (await res.json()) as { teams?: readonly EnrichTeam[] }
        return Array.isArray(body?.teams) ? body.teams : []
      } catch {
        return []
      }
    })()
      .finally(() => {
        cachedPromise = undefined  // 单次共享，下一批气泡可重新拉（简单起见）
      })
  }
  return cachedPromise
}
```
> 简化：共享单次 in-flight + TTL，失败返回 []，绝不抛。多个气泡并发时共享同一个 promise；TTL 控制刷新频率。

### 组件改用 `loadTeams`（AgentOrchestraBubble.tsx）
把 useEffect 里的 fetch 换成：
```typescript
import { loadTeams } from './bubble-teams.ts'
useEffect(() => {
  let cancelled = false
  void loadTeams().then((t) => { if (!cancelled) setTeams(t) })
  return () => { cancelled = true }
}, [])
```
（保留 cancelled 防竞态；loadTeams 自身 try/catch。）

> 可选：可再给 loadTeams 加订阅去重/轮询，但 M3 保持简单——共享 TTL 即满足"多个气泡复用一次"。

### 测试（tests/bubble-teams.test.mjs，可选 +2，mock fetch）
因 loadTeams 依赖全局 fetch，可注入 fetch 或做轻量测试。为控制范围，M3 对 bubble-teams 做**语法 + 宿主编译验证**，纯逻辑靠代码审查；如可行可在测试里 mock global.fetch 验证"共享一个 promise / TTL"。由 implementer 决定是否写 mock 单测（不强制）。

## 文件结构与 Task

| Task | 文件 | 内容 |
|---|---|---|
| M3-1 | bubble-enrich.ts + tests/bubble-enrich.test.mjs | A：captain 匹配 + 2 单测 |
| M3-2 | bubble-teams.ts（Create）+ AgentOrchestraBubble.tsx | B：共享 fetch + 组件改用 |
| M3-3 | 全量验证 | 宿主编译 + client 语法 + 50→52 单测 + final review |

## 防崩溃（延续）
1. 纯前端，后端零改动。
2. loadTeams try/catch + 失败返回 []，绝不抛。
3. enrichBubble 全防御扩展（captain 缺失 captainSessionId 兜底空）。
4. 组件 cancelled 防竞态保留。
5. 错误边界 + 数据兜底保留。

## 验收
1. 宿主编译 0 诊断。
2. client 语法通过。
3. bubble-enrich 9 条（原7+新增2）全过；bubble 9 + 其它回归全过（总计 50+2=52）。
4. task-done 气泡可点击跳 captain；气泡共享一次快照拉取。

## Non-Goals
- 实时推送（C）暂不实现。
- 改变 M1/M2 折叠骨架、后端、错误边界。

---

> 自审：A 基于已确认的 captainSessionId 在快照中；B 共享 fetch 简单可靠且防崩溃；2 Task 聚焦；验收可测。待执行。
