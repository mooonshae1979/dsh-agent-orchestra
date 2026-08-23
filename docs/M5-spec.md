# M5 spec：成员「直接回话」也以气泡出现（subagent-settled 折叠）

## 背景与问题
当前成员回复气泡只覆盖**成员主动 `orchestra_send_message`**（折叠 tool/call 事件）。
但当队长 `orchestra_send_message` 唤醒成员、成员**作为子 agent 直接回话**（不调用 send_message）时，
回复**不进**团队 captainInbox，因此不出气泡。

## 根因（已通过 DSH 源码确认）
DSH 的 `SubagentContinuationManager.notifySettlement` 在成员 settle 时，会向**队长（parent）会话**
注入一条 **`user/message` 会话事件**：
- `data.message.source.kind === 'subagent-settled'`（declaration merge 进 dsh-llm MessageSourceMap）
- `data.message.source.senderSessionId` = 成员子会话 id（childId）
- `data.message.content`：`[{type:'text',text:<summary>}, {type:'text',text:'Its closing message:'}, ...成员的直接回话文本块]`

这条 `user/message` 事件**持久化在队长会话日志**（已用文件时间戳佐证），且可被 conversation-node match。

## 目标
新增 conversation-node 折叠定义，match `user/message` + `source.kind==='subagent-settled'`，
把成员的**直接回话正文**折叠成「成员气泡」（与 M4 的成员回答区观感一致）。
这样**所有成员回复（send_message 或直接回话）都以气泡出现**。

## 实现要求
1. **`src/client/bubble-pure.ts`**：新增纯函数
   - `parseSubagentSettledBubble(message: unknown, members: readonly {id,role}[], ts): AgentOrchestraBubbleData | undefined`
   - 从 `message.content`（text blocks）提取 "Its closing message:" 之后的文本作为 `text`；无则用 source.summary。
   - `fromId = source.senderSessionId`；`fromMember`/`fromRole` 从 members 按 id 反查，反查不到 `fromMember=fromId`、role=''。
   - **全防御**：message/source/content 缺失或畸形返回 undefined；不抛错。

2. **`src/client/agent-orchestra-bubble-definition.ts`**：新增 `memberSettledDefinition`
   - `kind: 'member-settled'`，target 'chat'
   - `match`：`event.type === 'user/message'` 且 `event.data.message?.source?.kind === 'subagent-settled'` → start（唯一一次，id 用 `subagent-settled:<senderSessionId>:<seq>`）
   - `start`：调 `parseSubagentSettledBubble` 得状态；畸形返回 emptyState('member-settled')
   - `buildViewNode`：accepted 且数据有效返回 view node；data 用 AgentOrchestraBubbleData（kind 兼容）
   - 不需要 update/result 配对（这是单向 notice，accept 直接成立）

3. **`src/client/index.tsx`**：register `memberSettledDefinition`（conversationEvents.register），
   并把 `'member-settled'` 加进 `ChatNodeDataMap` 声明（在 agent-orchestra-bubble-definition.ts 的 declare module 里加）。

4. **气泡渲染**：`AgentOrchestraBubble` 组件需能渲染 `member-settled` 数据（复用现有 member-message 渲染路径；
   kind 别名为 member-message 展示即可——即 `buildViewNode` 里 data.kind 用 'member-message'，避免改渲染组件）。

## 防崩溃（最高约束）
- match/start 全防御，畸形事件返回空状态，绝不 throw。
- content 非数组/无 text block/无 "Its closing message:" 都安全兜底。
- members 缺失不抛。
- 不影响既有 tool/call 折叠。

## 提交
分支 `feat/member-in-conversation`，只加相关 client 文件。
验证：宿主编译 pre 0 + client 语法 + 既有单测。
