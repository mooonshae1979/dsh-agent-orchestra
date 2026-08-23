# AgentOrchestra 成员回答进对话气泡（M4）设计+计划

> **需求（用户明确）**：成员（子 agent）的回答必须**以气泡形式出现在对话流里**，方便直接查看；哪怕改 DSH 也要实现。

## 现状诊断（已完成并验证）

- 气泡 UI（M1-M3）当前靠**会话事件折叠**（匹配队长会话里 `orchestra_*` 的 `tool/call`+`tool/result`）。
- 但**成员**完成工作后动作是：`appendTeamEvent` 尝试往队长会话写自定义事件 `agent-orchestra/*`，而这些类型**不在 DSH `KNOWN_SESSION_EVENT_TYPES` 词表**，被静默跳过 → 成员动态不落进对话，气泡抓不到。
- **关键事实（已验证）**：成员发给队长的回复全文**已经真实存在于团队快照** `TeamActivitySnapshot.captainInbox`（`[{"from","content"}]`）+ `tasks[].output`。`/plugins/dsh-agent-orchestra/state` 实测返回 `captainInbox` 含成员汇报（world-builder/character-builder 的完整回复）。

## 方案：快照驱动"成员进对话"气泡（纯前端，不改 DSH）

不依赖 DSH 事件词表，直接从**团队快照**读取成员回复渲染成气泡，安全、防崩溃、满足需求。

### 核心思路
1. 快照 `captainInbox` 是"成员写给队长"的消息流，天然就是成员的回答。
2. 前端（client）已具备 `loadTeams()` 拉快照的基础设施（M3 共享缓存）。
3. 新增一级"成员进对话"气泡：从快照 `captainInbox`（成员→队长消息）+ `tasks[].output`（成员完成任务的成果）渲染成对话流气泡（带成员名/角色/头像/正文折叠展开）。

### 数据模型
`bubble-enrich.ts` 的 `EnrichTeam` 增加：
```typescript
export interface EnrichInboxMsg {
  readonly from: string
  readonly content: string
}
// EnrichTeam 增加
readonly captainInbox?: readonly EnrichInboxMsg[]
```

### 新增纯函数
在 `bubble-enrich.ts`（或新 `member-inbox.ts`）：
```typescript
/** 提取快照中成员发给队长的消息，转成气泡数据（纯函数，全防御）。 */
export function memberMessages(teams: readonly EnrichTeam[] | undefined):
  { from: string; role: string; sessionId: string; text: string }[]
```
- 遍历 teams[].captainInbox：`from` 非空、`content` 非空 → 收进列表
- 用 members 匹配出 role/sessionId（复用 enrich 思路）
- 全防御：teams/team/captainInbox 缺失 → 空数组，不抛错

### 渲染
`AgentOrchestraBubble`（或新 `MemberInboxBubble`）：
- 接收 `enrichBubble` 已算出的 role/sessionId + inbox 消息
- 渲染成"成员回答"气泡：头像 + 成员名 + 角色 + 正文折叠展开（复用 M1 的 AgentOrchestraBubble 渲染逻辑）
- 点击可跳成员转录（sessionId 非空时）
- 错误边界包裹（复用 BubbleErrorBoundary）

### 注册到对话流
对话流渲染成员气泡，需要有"入口"。方案：**新增一个 conversation-node 定义**，其 match 匹配一个**队长会话里确定存在的事件**作为锚点，buildViewNode 时从快照读取 captainInbox 渲染成员消息节点。但会话事件折叠与快照是两套源……

> **简化实现（推荐）**：直接在 `index.tsx` 注册一个新的 keyed slot（如 `'agent-orchestra-member-bubble'`），组件内部从 `loadTeams()` 快照读 `captainInbox` 自渲染成员气泡。不依赖 conversation-node match 事件——组件直接用快照数据渲染。这最可靠（快照是权威源），且完全可控。
> 但对话流如何插入组件？——需要一个 conversation-node 锚点。可用"团队卡（agent-orchestra）所在位置"之后插入，或注册一个泛指节点。
> **更简单可靠**：复用 `AgentOrchestraCard`（团队卡）——卡片本身在对话流有位置。在卡片组件内，除团队摘要外，额外渲染成员气泡列表（从快照 captainInbox）。这样成员回答就出现在团队卡所在对话位置，作为"成员回复区"。

### 推荐落地（M4）
1. `bubble-enrich.ts`：`EnrichTeam` 加 `captainInbox`；新增纯函数 `memberMessages(teams)`（可单测）
2. `AgentOrchestraCard.tsx`：在卡片内新增"成员回答区"，轮询快照 + `memberMessages()` 渲染成员气泡列表（每个成员一条，含头像/名/角色/正文折叠/跳转录）
3. 复用 `AgentOrchestraBubble` 的渲染样式 + `BubbleErrorBoundary`
4. 测试：`bubble-enrich` 补 `memberMessages` 单测；`bubble` 保持
5. 防崩溃：fetch try/catch、全防御、错误边界、CSS 隔离、后端零改动

### 为什么不改 DSH
- 改 DSH 会话词表风险高（生成文件、影响重建逻辑），且本方案用现成快照即可达成需求。
- 快照 `captainInbox` 已是权威数据源，纯前端读取最安全。

## 验收
1. 快照有成员消息时，对话流里出现"成员回答"气泡（成员名 + 正文 + 可跳转录）
2. 无成员消息时不显示，不崩
3. 宿主编译 0 诊断；client 语法通过；新增单测全过
4. 后端零改动、错误边界保留

## Non-Goals
- 不改 DSH 会话词表
- 不破坏 M1-M3 现有气泡
