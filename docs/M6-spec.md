# M6 spec：团队成员消息以「频道对话卡片」形式出现在对话流

## 用户需求（经 openhanako 参考确认）
用户想要：**团队/子 agent 的组员像主模型一样，在对话流里跟用户对话**。
即：对话流里每个成员发来的消息，显示成一张**带头像+名字+正文的对话卡片**（参考 openhanako `AgentOriginMessage`），
与主模型消息并列，超长可折叠展开。

## 技术机制（社区验证过，替代不可靠的 conversation-node 折叠）
用 DSH 的 **`tool.call.toolview`** slot（orange-jzh `dsh-client-ui-team` 验证过的机制）：
- `slots.inject('tool.call.toolview', () => slots.register({ name:'tool.call.toolview', key:'orchestra_send_message' }, MemberMessageCard))`
- key 是 wire Tool 名（open 域），DSH 会为每次 `orchestra_send_message` 工具调用渲染我们的卡片
- DSH 标准 tool view 行，**天然显示在对话流、不折叠**（告别 conversation-node 折叠问题）

## 数据来源
`ToolCallOwnerProps.block`（`ToolCallBlock = RunningToolCall | ToolResultNode`）：
- 参数：`'kind' in block ? block.call.argsRaw : block.argsRaw`（JSON 字符串）
- `orchestra_send_message` 参数：`{ from, to, content }`（成员发消息时 from=成员名、to=captain；content=正文）
- 渲染：`from` = 成员名（fromAgent），`content` = 正文

## 视觉（参考 openhanako AgentOriginMessage）
`AgentOriginMessage` 卡片样式：
- 卡片容器：浅色背景（tool-bg）、圆角、内边距、宽度 ~560px
- 头部：头像（20px 圆形，可用 memberArtUrl 或首字母）+ 名字（`fromAgent: <名字>`，小号 muted）
- 正文：`pre-wrap`、13px、行高 1.6；超长（>12行 或 >900字）折叠 + 展开/收起按钮
- 全防御：argsRaw 畸形/缺失 → 兜底不崩

## 实现文件
1. `src/client/member-message-card.tsx`（新增）：`MemberMessageCard({ callId, toolName, block, ... })` 渲染卡片
   - 解析 argsRaw → { from, to, content }（全防御）
   - 用 `memberArtUrl(from, '')` 或首字母做头像
   - 头部 `fromAgent: <from>`、正文 content（折叠展开）
   - 复用 `BubbleErrorBoundary` 包裹
2. `src/client/member-message-card.module.css`（新增）：卡片样式（参考 openhanako agentOrigin*）
3. `src/client/index.tsx`：`slots.inject('tool.call.toolview', ...)` 注册 key=`orchestra_send_message`
   （保留现有 conversation-node 团队卡/M4/M5，新增这个 toolview 卡片；若 M5 的 conversation-node 折叠引发问题，后续可移除）

## 防崩溃
- argsRaw JSON.parse try/catch，畸形返回 `{}`
- from/content 非 string 兜底
- 不抛错，空白/畸形不渲染或显示"来自成员的消息"

## 提交
分支 `feat/member-in-conversation`。只加相关 client 文件。
验证：宿主编译 pre 0 + client 语法 + 既有单测。
