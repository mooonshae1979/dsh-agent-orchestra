# M7 spec：后端捕获成员「直接回话」写入团队 captain_inbox

## 目标
成员被 `orchestra_send_message` 唤醒后，若**直接回话**（未调用 `orchestra_send_message` 工具），
其回复目前只作为 subagent 回话返回，**不进** captain_inbox → 前端（M4 团队卡成员回答区 / M6 卡片）捕获不到。
本 spec：**后端在成员 settle 时捕获其直接回话，写入团队的 captain_inbox**，让所有成员回复都出现在对话流。

## 技术机制（已确认可行）
DSH `dsh-session` 提供 **`session/event` firehose**：`ctx.on('session/event', (session, event) => {...})`
- 每个 session append 事件后触发，回调收 `(session, event)`
- `subagent-settled` 消息作为 `user/message` 事件写进**队长 session**（成员 settle 时由 DSH `notifySettlement` 注入，含成员 closing message）
- 队长上下文里 `ctx.on('session/event')` 能收到（agent-scoped，队长的 session 属于队长 agent 上下文）
- `event` 结构：
  - `event.type === 'user/message'`
  - `event.data.message.source.kind === 'subagent-settled'`
  - `event.data.message.source.senderSessionId` = 成员子会话 id（childId）
  - `event.data.message.source.summary` = 运行时一句话总结
  - `event.data.message.content` = `[{text:summary},{text:'Its closing message:'}, ...成员回话正文blocks]`（无 closing 时为 `{text:'It left no closing message.'}`）

## 实现要求

### 1. `src/index.ts` apply 里注册监听
在 apply 里加（ctx.on）：
```ts
ctx.on('session/event', (session, event) => {
  void captureMemberDirectReply(ctx, config, session, event).catch((error) => {
    ctx.logger.warn(`agent-orchestra: capture member reply failed: ${String(error)}`)
  })
} as never)
```
（用 `as never` 或合适类型适配 cordis 事件签名；注册需放 `ctx.effect` 内以便卸载，参照现有 `ctx.on('internal/service')` 用法——若该处未用 effect 包裹，保持一致即可。）

### 2. 新函数 `captureMemberDirectReply`（放 `src/members.ts` 或 `src/orchestrator.ts`）导出
签名：`export async function captureMemberDirectReply(ctx, config, session, event): Promise<void>`
逻辑：
1. 若非 `user/message` 或 `event.data.message?.source?.kind !== 'subagent-settled'` → return（快速过滤）
2. 取 `senderSessionId = event.data.message.source.senderSessionId`（string）；空则 return
3. 从 message.content 提取回话正文（text blocks，"Its closing message:" 之后的拼接；若无则用 source.summary；仍空 return）
4. 遍历已知团队（复用现有读团队列表机制，见 `state.ts` 的 `readTeamIndex`/`listTeams` 或 snapshot 的 collect 方式），找 `members[].id === senderSessionId` 的团队
   - 找到 → 得到团队 id + 成员名
   - 找不到（不是本插件成员）→ return（避免把普通 subagent settle 当成员回话）
5. 写入该团队 captain_inbox：
   - 用 `appendMailboxMessage(stateRoot, teamId, CAPTAIN_KEY, { from: 成员名, to: 'captain', content, ts })`（参考 state.ts 现有函数签名；若函数名/参数不同以实际为准）
   - 同时 `appendTeamEvent(ctx, session, 'agent-orchestra/message-sent', {...})`（若需要与主动 send_message 的事件一致；可复用 tools.ts 里 message-sent 的 payload 结构）
6. **幂等/防重**：同一 senderSessionId + 同一 content 短时间（如 2 秒）内只写一次（模块级 Map 去重），避免重复捕获
7. 全防御：任何异常不抛出（外层已 catch）；畸形 event/找不到团队静默 return

### 3. 复用现有写 mail 的机制
- `state.ts` 已有 `appendMailboxMessage`（写 inbox JSONL）和 `readMailbox`；确认它们导出，直接调用
- CAPTAIN_KEY 常亮在 tools.ts 里（`import { CAPTAIN_KEY }`），确认导出位置

## 校验
宿主编译 pre 0 + 既有单测（52→57 全过）。
路由 `/plugins/dsh-agent-orchestra/state` 的 captain_inbox 会因新写的 JSONL 而自动增长（snapshot 从 readMailbox 读）。

## 提交（分支 feat/member-in-conversation）
```bash
git add src/index.ts src/members.ts src/state.ts src/tools.ts
git commit -m "feat(member-in-conversation): capture member direct replies into captain_inbox via session/event"
```

## 注意
- 若 `session/event` 在 headless 环境不可用（无 session service），监听注册需容错（try/catch 或检查 ctx 有无该事件）
- 千万保持 host 编译 pre 0，不破坏现有 tools/orchestrator
