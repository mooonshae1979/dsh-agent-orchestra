# AgentTeams 对话式编排设计（Conversation Orchestration）

> **状态**：已与用户逐节确认的设计文档。后续用 `sp-writing-plans` 转成实施计划。
> **目标读者**：实现该功能的工程师（默认对代码库了解有限）。

## 1. 背景与定位

现状：`dsh-agent-teams` 通过 `orchestra_*` 工具让队长（当前会话主模型）用上下文轮询分发任务、收集结果；组员是不可见子代理，任务/接力全靠队长手动编排。

目标：让团队协作**由对话驱动**：
- 用户在对话里 **@点名 给子 agent 派活**；
- 或**根据子 agent 身份定义自动分配/领取任务**；
- 对话里**默认有一个任务分配者**，决定布置任务的拆解与分配；
- **按既定工作流**，子 agent 的答复自动打包给下一位继续下一步；
- **子 agent 身份不预制，按任务现场定制**。

**已确定的方案取向（用户逐项拍板）**：
- 分配者 = **方案 A：当前会话队长（主模型）**。轻量调度下完全够用；通过职责分离（调度 vs 干活）+ 工作流规则兜底避免队长过载。
- 工作流来源 = **方案 C：预置模板 + 对话临时定义/覆盖**。
- 自动接力 = **方案 C：默认队长按工作流驱动 + 白名单步骤成员直达**。
- 身份形态 = **方案 B：身份库模板（Role）+ 现场实例化（Member），可现场覆盖**。
- 嵌套小组 = **方案 C：本版做轻量子流程（step 内嵌 workflow 递归），独立嵌套团队留后续**。

## 2. 架构总览

在不替换 dsh-agent-teams 底座的前提下，新增**编排层**：

```
你的对话（"用开发流，让小李做前端，让小王评审"）
   │ 队长(主模型)解析
   ▼
[1] 选/建 Workflow 模板（预置 or 对话临时定义/覆盖）
[2] 按任务实例化 Member（Role 模板基底 + 现场覆盖：名字/角色/专长/模型/模式）
[3] 拆解成 Task，挂到 workflow.steps
   │ 队长驱动执行
   ▼
[4] 为 step 分配成员 → 唤醒成员做该 step
[5] 成员产出（output 文本 或 artifacts 文件路径）→ 队长读取
[6] 按 workflow.next 决定下一步 → 打包产出 → 唤醒下一位
       （标 membersDirect 的步骤：成员间用 orchestra_send_message 直接互聊，队长只观察）
   │
   ▼
[7] 全部 steps 完成 → 汇总给用户
```

**关键原则**：
- **队长 = 调度者**，不直接干具体活（避免过载）；具体产出由成员做。
- **接力决策依据 = 既定工作流规则**（清晰、可预期），而非队长每次自由发挥。
- 成员间直达只发生在工作流白名单（`membersDirect`）步骤，防止自治失控。
- 身份**半预制**：Role 模板复用常用基底，Member 现场定制冷门身份。

## 3. 组件拆分

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/workflow.ts` | Workflow/Role/Step 类型定义、默认模板库、校验（纯逻辑可单测） |
| `src/orchestrator.ts` | 队长编排核心：对话任务 → 成员实例 + 任务 + 步骤；驱动接力、读产出、打包、唤醒下一步 |
| `src/persona-builder.ts` | 从 Role 模板 + 现场覆盖合成成员 persona（含 provider/model/mode 注入） |

### 改动现有文件

| 文件 | 改动 |
|---|---|
| `src/types.ts` | `TeamMember` 增加 `provider`/`roleId`/`persona`；新增 `WorkflowDef`/`RoleDef`/`StepDef` 类型 |
| `src/tools.ts` | 新增对话驱动编排工具；增强 `orchestra_status` 回显 |
| `src/members.ts` | `spawnMember` 支持成员级 provider；用 persona-builder 合成 persona |
| `src/event-types.ts` | `member-added` 带 provider/model/mode |
| `src/snapshot.ts` | 活动快照带 provider/model/mode 与 workflow 进度 |

### 新增工具（对话驱动入口）

| 工具 | 作用 |
|---|---|
| `orchestra_define_workflow` | 选/建工作流模板（预置或对话临时定义） |
| `orchestra_assemble` | 按任务 + 工作流实例化一组成员并建任务栈 |
| `orchestra_dispatch_step` | 队长把某 step 分派给某成员并唤醒 |
| `orchestra_relay` | 读上一步产出，按 `workflow.next` 打包，唤醒下一步（接力核心） |
| `orchestra_add_member` / `remove_member`（已有，增强） | 对话中途随时增删组员，不打断流程 |
| `orchestra_status`（已有，增强） | 回显成员 provider/model/mode + 当前 workflow 步骤进度 |

## 4. 数据模型

### Role 模板（身份库，半预制）
```typescript
interface RoleDef {
  id: string            // 'researcher' | 'engineer' | 'reviewer' | 'novelist' ...
  displayName: string
  persona: string       // 基础 persona 模板
  defaultProvider?: string
  defaultModel?: string
  defaultMode?: MemberMode
  tools?: string[]      // 可选工具白名单
}
```

### Member 实例（现场定制，扩展 TeamMember）
```typescript
interface TeamMember { // 扩展
  id: string
  name: string          // 现场命名（'小李'）
  role?: string
  roleId?: string       // 关联 Role 模板（可选）
  persona?: string      // 现场覆盖/合成的最终 persona（可落盘回显）
  provider?: string     // 现场覆盖
  model?: string        // 现场覆盖
  mode?: MemberMode     // 现场覆盖
  joinedAt: number
  status: MemberStatus
}
```

### Workflow 模板
```typescript
interface WorkflowDef {
  id: string
  name: string
  steps: StepDef[]
}
interface StepDef {
  stepId: string
  goal: string              // 这一步的产出目标
  outputType: 'text' | 'artifact' | 'any'
  next?: string             // 下一步 stepId；无 = 流程末尾
  membersDirect?: boolean   // true = 成员间直接互聊接力，队长只观察
  assigneeHint?: string     // 建议成员角色（'engineer'），队长可按现场定制
  subflow?: WorkflowDef     // 子流程（轻量嵌套：该步内部再走一个既有工作流）
}
```

## 5. 默认模板库（内置 4 个，可对话覆盖）

1. **研究流** `research`：`researcher(调研) → reviewer(评审)`
2. **开发流** `dev`：`engineer(实现) → reviewer(代码审查)`，reviewer 步 `membersDirect: true`
3. **实现流** `implement`：`planner(方案) → engineer(实现) → reviewer(审查)`，reviewer 步 `membersDirect: true`
4. **写作流** `write`：`novelist(AI 小说家写作) → reviewer(评审/润色)`，reviewer 步 `membersDirect: true`

> 写作流引入 **AI 小说家** agent —— 对接工作区已安装的 `@ethanyoq/dsh-ai-novel-writer` 插件（`novel_read` / `novel_apply_change` 工具 + 独立「AI 小说作家」预设），其成员 persona 需包含这些小说工具。

对话里说"用开发流但我不要评审直接出结果"时，队长现场裁剪步骤（对话覆盖，不持久化）。子流程同样基于这四个模板递归。

## 6. 对话中动态增删组员 / 嵌套小组

### 动态增删
- `orchestra_add_member`：任意时刻现场创建成员（Role 模板 + 现场覆盖），不打断进行中的 workflow；新成员可被后续 step 使用。
- `orchestra_remove_member`：任意时刻移除成员（尽力打断其当前轮次），其未完成任务由队长决定重派/跳过；流程继续。

### 嵌套小组（轻量版）
- `StepDef.subflow`：某一步内部再挂一个子 `WorkflowDef`。
- 实现为**步骤层面递归**（同一小队统一调度），不创建独立团队实体，不触碰现有"一队长一团队"约束。
- 子流程失败 = 主 step 失败，沿同一 fail-fast 规则由队长统一决策。
- 真正独立嵌套团队（各自 captain/状态目录）留作后续 P+ 里程碑，本版不做。

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| @点名但无此成员 | 队长现场创建（模板+定制）；无身份信息则 ask-user 回问，不瞎猜 |
| assigneeHint 角色无对应成员 | 报错 + 列出可用成员；队长补建或改派 |
| 上一步产出缺失 | 接力前校验 output/artifacts；缺失则阻塞，队长决定 跳过/重做/换人 |
| next 引用不存在的 step | 构建时静态校验；运行期 fail-fast 抛错终止 |
| 成员被唤醒无产出/卡住 | 队长检测（status 停留/无 output），策略：重试 1 次 / 换人 / 标记 failed |
| membersDirect 死锁 | 兜底超时（队长观察 N 秒无进展则介入） |
| 模型/provider 不可用 | spawn 前 getProvider 校验；失败 fallback 到 Role.defaultModel；再不行报错让队长换，不崩死 |
| 子流程失败 | 同 fail-fast，标记主 step 失败，队长统一决策 |

## 8. 测试策略

### 单元测试（纯逻辑，不依赖 DSH 运行时）— `tests/` 目录（新增）
- `workflow.test`：模板校验（next 引用合法）、对话覆盖（裁剪/插入）、子流程展开。
- `persona-builder.test`：Role 模板 + 现场覆盖合成 persona（name/role/provider/model/mode 正确注入）。
- `orchestrator.test`：对话指令解析 → 正确的成员实例 + task 栈 + 接力顺序。

扩展 `scripts/verify.mjs`（沿用其 `import lib/` 断言模式）跑以上单测。

### 组合 / 冒烟
- 复用现有 temp-state 流程，验证：建 workflow → 实例化成员 → 派 step → 产出 → relay 打包 → 唤醒下一步 的完整链路（用 mock 成员/假 provider，不真跑 LLM）。
- 验证 `orchestra_status` 回显 provider/model/mode + workflow 进度。

### 真实 e2e（可选，后续）
- 真实 DSH 会话里自然语言驱动（如"用写作流让 AI 小说家写一段、再评审"），核对事件流 + team.json + 最终汇总。
- 涉及真实 LLM，不作为每个 commit 的必跑项。

## 9. 明确不在本版范围（Non-Goals）

- ❌ 组员渲染成主聊天流里的**独立对话节点**（`conversation.chat.node` keyed 渲染）——后续 M1 里程碑。
- ❌ 真正**独立嵌套团队**（各自 captain/状态目录）——后续 P+ 里程碑。
- ❌ dsh-team-plugin 式 Role/Member **配置表单 UI**（`settings.section` 数据层未打通）。
- ❌ `systemPrompt.variable` digest 注入——后续优化项。

## 10. 里程碑划分

- **P0（本设计即转此计划）**：数据模型 + 工具 + 编排核心（workflow/assemble/dispatch/relay）+ 身份半预制 + persona-builder + 4 个默认模板（含写作流）+ 对话动态增删 + 轻量子流程 + 测试。
- **M1**：对话化 UI（成员作为 `conversation.chat.node` 独立节点）。
- **P+**：真正独立嵌套团队；digest 注入。

---

> 自审：各节与已确认决策一致；错误处理覆盖接力/身份/模型/子流程各风险点；测试分三层；Non-Goals 明确避免范围失控。待用户审阅。