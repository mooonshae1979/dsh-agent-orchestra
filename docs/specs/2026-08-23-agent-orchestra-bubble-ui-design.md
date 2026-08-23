# AgentOrchestra 对话化 UI（M1）— 成员气泡设计

> **状态**：已与用户逐节确认的设计文档。
> **目标读者**：实现该功能的工程师。

## 1. 背景与目标

现状：`dsh-agent-orchestra` 已实现完整编排核心（B1+B2），成员是后台子代理，Web 端仅有一个右上角浮层（ActivityPanel）+ 一张团队创建小结卡（AgentOrchestraCard）。

目标（M1，用户核心诉求）：**把团队成员的交互在主对话流里渲染成独立成员气泡节点**——每个成员一个气泡，带名字/角色/头像，正文来自成员持久化的原文（`orchestra_send_message` 的 content、`orchestra_update_task` 的 output），**支持折叠/展开查看原文**。

**已确认的方案取向（用户逐项拍板）**：
- UI 形态 = **成员气泡化**（成员作为对话里独立发言人）。
- 数据源 = **会话事件折叠为骨架 + 成员持久化原文作正文（C 混合）**：骨架用 conversation-node 折叠（稳），正文用成员真正写入 task.output / 邮箱 content（可靠），折叠可展开看原文。
- 实现策略 = **纯前端增量（A）**：全部在浏览器侧做，后端零改动，把崩溃面限制在 React 组件 + 事件折叠内。
- 防崩溃 = **硬约束**（用户强调"UI 容易把 web 弄崩溃"）。

## 2. 架构总览

```
成员写持久化原文(task.output / mailbox content)
  → 这些工具调用产生 tool/call + tool/result 会话事件
  → 新增 conversation-node 折叠这些事件为成员气泡节点
  → AgentOrchestraBubble 渲染（data 带原文）
  → 用户点击"展开全文"查看完整原文
```

**纯前端增量**：不改任何 host 路由/事件/HTTP，后端保持已验证稳定的 B1/B2 实现不动。

## 3. 防崩溃策略（硬约束，共 6 条）

1. **后端零改动**：崩溃面完全限制在前端 React 渲染层；后端路由/服务不动。
2. **错误边界（Error Boundary）**：整个气泡列表外包一个错误边界；单个气泡抛错只替换为该气泡的"渲染失败"占位，不拖垮整条对话或 web。
3. **数据全兜底**：组件对 props 所有字段做防御（`data?.text ?? ''`、`member?.name ?? '未知成员'`），任何缺失/畸形数据都不抛错、只降级。
4. **折叠机制只增不改**：新增 conversation-node 定义，不改现有 `agent-orchestra-card-definition`（避免破坏已稳定的团队卡），二者并存。
5. **渲染纯函数化**：气泡渲染是给定 data → 输出的纯函数，无副作用；文本截断+展开用组件内本地 state，不触发全局状态变化。
6. **CSS 隔离**：全部用 `.module.css` 局部作用域，不污染全局壳层样式。

## 4. 组件拆分

| 新文件 | 职责 |
|---|---|
| `src/client/agent-orchestra-bubble-definition.ts` | conversation-node 折叠定义：`orchestra_send_message` / `orchestra_update_task` → 气泡节点 |
| `src/client/AgentOrchestraBubble.tsx` | 成员气泡渲染（头像/名字/角色 + 正文折叠展开） |
| `src/client/AgentOrchestraBubble.module.css` | 气泡样式（局部作用域） |
| `src/client/bubble-error-boundary.tsx` | 错误边界组件（单泡崩溃降级） |

**改动现有**：`src/client/index.tsx`（注册新节点）；后端零改动。

## 5. 数据模型

```typescript
export interface AgentOrchestraBubbleData {
  readonly kind: 'member-message' | 'task-done'
  readonly fromMember: string      // 发送/完成成员名
  readonly fromRole: string        // 成员角色
  readonly fromId: string          // 成员子 agent id（可空）
  readonly toMember?: string       // member-message：接收者
  readonly taskId?: string         // task-done：任务 id
  readonly taskSubject?: string    // task-done：任务标题
  readonly text: string            // 原文（content 或 output），可折叠
  readonly ts: number              // 时间戳
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'agent-orchestra-bubble': AgentOrchestraBubbleData
  }
}
```

## 6. 节点定义（两个独立 conversation-node）

### member-message 节点（匹配 orchestra_send_message）
- `match`：`tool/call` 且 `data.name === 'orchestra_send_message'`，解析 `{ to, content, from? }`
- `start`：存 `{ fromMember(from ?? 'captain'), toMember(to), text(content), ts }`
- `update`：从 tool/result 拿最终成员名（若 from 空，用 result.from）
- `buildViewNode` → 气泡 data（kind: 'member-message'）

### task-done 节点（匹配 orchestra_update_task）
- `match`：`tool/call` 且 `data.name === 'orchestra_update_task'` 且参数 `status === 'completed'`（仅完成出气泡）
- `start`：存 `{ taskId, taskSubject, ts }`
- `update`：从 tool/result 拿 output 和完成成员名
- `buildViewNode` → 气泡 data（kind: 'task-done'）

## 7. 渲染组件 AgentOrchestraBubble

- 样式：气泡，左侧色条区分 member-message（蓝）vs task-done（绿）；角色首字母头像 + 名字 + 角色小字 + 时间。
- 正文折叠：默认 200 字摘要 + "展开全文"按钮，点击展开全部（本地 useState）。
- 接受者行：member-message 显示 `→ 接收者`；task-done 显示 `完成任务 tN: 标题`。
- 防御渲染：text 空显"（无正文）"；成员名/角色缺失用兜底；不抛错。
- 外层错误边界包裹。

## 8. 注册（index.tsx 增量）
- `ctx.conversationEvents.register(...)` 注册两个节点定义。
- `ctx.slots.inject('conversation.chat.node', ...)` 加 `key: 'agent-orchestra-bubble'` 渲染器（冒泡组件 + 错误边界）。
- 沿用现有 `'agent-orchestra'` 团队卡注册，二者并存。

## 9. 防崩溃验证（M1 验收）

1. **语法/类型**：宿主编译（Cursor TS 5.9.2，client 语法 transpileModule）0 诊断 / 通过。
2. **错误边界验证**：单测构造一个会抛错的渲染（mock data 触发组件内部错误），确认错误边界将其降级为本气泡占位，不让整个节点列表崩溃。
3. **数据兜底验证**：单测覆盖缺失 text/member/role 的畸形 props，确认组件渲染兜底值而非抛错（不触发错误边界）。
4. **折叠展开**：单测覆盖 text > 200 字显示摘要 + 点击展开后显示全文（本地 state 切换）。
5. **web 稳定性冒烟**（可选，真实环境）：浏览器打开 DSH web，确认活动面板/团队卡/气泡并存不崩溃；气泡数据缺失时页面仍可用。

## 10. Non-Goals（明确不做）

- ❌ 实时推送（保持 纯前端 + 现有快照/事件，不新增后端推送通道）。
- ❌ 成员的完整双向即时聊天 UI（本版是"成员交互回顾"气泡，非实时 IM）。
- ❌ 修改现有 AgentOrchestraCard / ActivityPanel（保持稳定）。
- ❌ 后端任何改动。

---

> 自审：架构与已确认决策一致；防崩溃 6 条贯穿组件拆分与渲染；组件边界清晰（definition 折叠 / 组件渲染 / error-boundary 隔离 / css 局部）；Non-Goals 避免实时与后端扩张。待用户审阅。
