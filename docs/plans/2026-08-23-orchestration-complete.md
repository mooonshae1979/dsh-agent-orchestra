
# dsh-agent-orchestra 对话编排完整实现实施计划（Plan B2）

> **For agentic workers:** REQUIRED SUB-SKILL: Load the `sp-subagent-driven-development` skill (recommended) or `sp-executing-plans` skill via the `skill` tool to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B1 编排队核心之上，完成对话编排的「完整可用」闭环：persona 真正接入 spawn、orchestra_dispatch_step（队长给成员派活并唤醒）、relay 锁内读 fresh、assemble 成员名与 relay hint 对齐、custom 校验加强，并用综合测试验证整条 assemble→dispatch→relay 链路。

**Architecture:** 复用 B1 的纯逻辑模块（workflow/persona-builder/orchestrator）与既有成员机制（spawnMember/deliverToMember）。核心改动是「接线」：把 buildPersona 输出写进成员并让 spawnMember 使用；新增 dispatch_step 工具复用 deliverToMember 唤醒成员；relay 改为锁内读 fresh；assemble 生成成员时用可对齐的命名。综合测试用 mock 成员/provider（不真跑 LLM）验证链路。

**Tech Stack:** TypeScript（node ESM），`@deepseek-ai/dsh-*`，node 内联断言单测 + 宿主编译验证（本机无 pnpm build，沿用 B1 双轨）。

**前置**：`feat/orchestration-core-v2` 已含 B1（PR #2）。本计划在此分支继续（或新开 `feat/orchestration-complete`）。

---

## 范围（Scope）

本计划 = **Plan B2**，覆盖 B1 遗留观察 + 对话驱动派活闭环：
1. **persona 真实接入 spawn**（final reviewer 观察 #1）
2. **orchestra_dispatch_step**：按 step + 成员名唤醒成员（对话驱动派活核心）
3. **relay 锁内读 fresh**（观察 #4）+ assemble 成员名与 relay hint 对齐（观察 #2）
4. **custom 校验加强**：step 必填字段 / outputType 枚举 / assigneeHint 对应已知角色（观察 #3）
5. **写作流 AI 小说家工具说明**：novelist 角色 literal 带 novel_read/novel_apply_change 工具白名单
6. **综合测试**：assemble→dispatch→relay mock 链路

**明确不在本计划（Non-Goals）**：
- 轻量子流程的**完整运行**（step.subflow 真执行需 real e2e，model 层已支持；运行时接线留 M 后续）
- 真正独立嵌套团队（M 后续）
- 对话化 UI（`conversation.chat.node` 成员独立节点，M1）
- systemPrompt.variable digest 注入（P+）
- 真实 DSH 自然语言 e2e（需可装依赖 + 真实 LLM 环境）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `src/members.ts` | spawnMember 支持成员自带 persona（buildPersona 输出优先于通用模板） |
| `src/persona-builder.ts` | 补充动画/对齐（可选）；新增为 assemble 生成 persona 的 helper 或保持纯函数 |
| `src/orchestrator.ts` | assemble 生成的成员带 persona（buildPersona 写入）；命名与 relay hint 对齐 |
| `src/workflow.ts` | validateWorkflow 加强（step 必填/outputType 枚举/assigneeHint 已知角色）；novelist 工具白名单 |
| `src/tools.ts` | 新增 orchestra_dispatch_step；relay 锁内读 fresh；assemble 用 buildPersona |
| `src/index.ts` | 工具名补 dispatch_step |
| `tests/b2-complete.test.mjs` | 综合链路测试（纯逻辑 + mock） |

---

## Task 1: workflow.ts — 校验加强 + novelist 工具白名单

**Files:**
- Modify: `src/workflow.ts`
- Test: `tests/workflow.core.test.mjs`（追加）

- [ ] **Step 1: validateWorkflow 加强必填字段与枚举**

将 `validateWorkflow` 改为同时校验每个 step 的必填字段与 outputType（保留现有 next/重复 subflow 校验）：

```typescript
export function validateWorkflow(workflow: WorkflowDef): string[] {
  const errors: string[] = []
  if (workflow === undefined || workflow === null || typeof workflow !== 'object') {
    return ['workflow must be an object']
  }
  if (!Array.isArray(workflow.steps)) {
    return ['workflow must have a steps array']
  }
  const ids = new Set(workflow.steps.map((step) => step.stepId))
  if (ids.size !== workflow.steps.length) {
    errors.push(`workflow "${String(workflow.id ?? '')}" has duplicate step ids`)
  }
  for (const step of workflow.steps) {
    if (step === undefined || typeof step !== 'object' || typeof step.stepId !== 'string' || step.stepId.length === 0) {
      errors.push('a step is missing a non-empty stepId')
      continue
    }
    if (typeof step.goal !== 'string' || step.goal.length === 0) {
      errors.push(`step "${step.stepId}" is missing goal`)
    }
    if (step.outputType !== undefined && !['text', 'artifact', 'any'].includes(step.outputType)) {
      errors.push(`step "${step.stepId}" has invalid outputType "${String(step.outputType)}"`)
    }
    if (step.next !== undefined && !ids.has(step.next)) {
      errors.push(`step "${step.stepId}" references unknown next "${step.next}"`)
    }
    if (step.subflow !== undefined) {
      errors.push(...validateWorkflow(step.subflow).map((e) => `${step.stepId}.${e}`))
    }
  }
  return errors
}
```

- [ ] **Step 2: novelist 角色加 tools 白名单**

在 `DEFAULT_ROLES` 的 novelist 条目 `tools` 字段补上小说工具：

```typescript
  { id: 'novelist', displayName: 'novelist', persona: 'You are an AI novelist. Write engaging, coherent prose. Use the novel tools (novel_read / novel_apply_change) when available. Produce polished creative text.', tools: ['novel_read', 'novel_apply_change'] },
```

（保留 `outputType` 参考 —— 在 buildStepSchema 或文档中，actor 不强制本 Task 使用。）

- [ ] **Step 3: 追加单测（tests/workflow.core.test.mjs）**

在文件末尾追加：

```javascript
t('validateWorkflow requires steps array', () => {
  assert.ok(validateWorkflow({ id: 'x', name: 'x', steps: undefined }).length > 0)
})
t('validateWorkflow rejects missing goal', () => {
  const w = { id: 'x', name: 'x', steps: [{ stepId: 'a', outputType: 'text' }] }
  assert.ok(validateWorkflow(w).length > 0)
})
t('validateWorkflow rejects invalid outputType', () => {
  const w = { id: 'x', name: 'x', steps: [{ stepId: 'a', goal: 'g', outputType: 'bogus' }] }
  assert.ok(validateWorkflow(w).length > 0)
})
t('novelist role has novel tools whitelist', () => {
  assert.deepStrictEqual(getRole('novelist').tools, ['novel_read', 'novel_apply_change'])
})
```

- [ ] **Step 4: 编译 + 跑 workflow 单测**

Run 宿主编译命令（node -e ... createProgram + emit），然后 `node tests/workflow.core.test.mjs`。
Expected: 13 条 PASS（原 9 + 新 4）。

- [ ] **Step 5: 提交**

```bash
git add src/workflow.ts tests/workflow.core.test.mjs
git commit -m "feat(workflow): strengthen validation and add novelist tool whitelist"
```

---


## Task 2: persona 真实接入 spawn（members.ts）

**Files:**
- Modify: `src/members.ts`
- Modify: `src/persona-builder.ts`（可选优化）

**背景**：当前 `spawnMember` 硬编码 `persona: memberPersona(team, member, stateDir)`（通用 worker 模板），即使成员带 `persona` 字段也没用上。要让身份半预制生效：若成员自带 `persona`（由 assemble 用 buildPersona 生成），直接用它；否则回退通用模板。

- [ ] **Step 1: 给 memberPersona 加"尊重成员自带 persona"逻辑**

在 `src/members.ts` 的 `memberPersona` 函数开头插入（保留原逻辑作为 fallback）：

```typescript
export function memberPersona(team: TeamState, member: TeamMember, stateDir: string): string {
  // A member may carry a pre-synthesized persona (e.g. from persona-builder
  // during assemble). If present and non-empty, it wins — the captain/role
  // template's identity should take effect for this member.
  if (member.persona !== undefined && member.persona.length > 0) {
    return member.persona
  }
  return `You are ${member.name}, a member of the multi-agent team "${team.name}" ...` // 原 body 保持
}
```

> 实际操作：把原函数体整体保留，仅在顶部 `const base = ...` 之前加 persona 短路返回。请用 bash 查看 `src/members.ts` 的 memberPersona 当前实现（约 103-125 行），在其开头加 `if (member.persona !== undefined && member.persona.length > 0) return member.persona`，其余不变。

- [ ] **Step 2: 宿主编译**

Run 宿主编译命令。Expected: `pre 0`（spawnMember 的成员 `persona` 字段已在 types.ts 定义可通过）。

- [ ] **Step 3: 提交**

```bash
git add src/members.ts
git commit -m "feat(members): honor member-synthesized persona in spawn"
```

---

## Task 3: orchestra_dispatch_step — 对话驱动派活 + assemble/relay 对齐

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/index.ts`

**背景**：B1 提供 assemble 建成员 + relay 给下一 hint，但缺「真正把 step 派给某成员并唤醒」的工具。dispatch_step 补上：给定 step id + 成员名，向该成员投递任务并唤醒（复用 deliverToMember），完成对话驱动的单步派活。同时修复 final reviewer 观察：assemble 成员名与 relay 的 assigneeHint 对齐（relay 返回 hint 时，dispatch 按 hint 找角色成员）。

- [ ] **Step 1: 在 tools.ts 注册 orchestra_dispatch_step**

在 `src/tools.ts` 的 `orchestra_relay` 注册之后、函数收尾 `}` 之前，追加：

```typescript
  ctx.tools.register(defineTool({
    name: 'orchestra_dispatch_step',
    description: 'Dispatch a workflow step to a specific member: wakes the member with the step goal as its task. Use after orchestra_relay to act on the next step.',
    parameters: {
      step_id: { type: 'string', required: true, description: 'The step id to dispatch.' },
      member_name: { type: 'string', required: true, description: 'The member to dispatch this step to.' },
      context: { type: 'string', description: 'Optional additional task context for the member.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: 'Dispatched step "' + value.step_id + '" to ' + value.member_name + ' (' + value.delivered + ')' }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(workspace, config, captain)
      if (team.workflowId === undefined) throw new Error('team has no active workflow — call orchestra_assemble first')
      const workflow = getWorkflow(team.workflowId)
      if (workflow === undefined) throw new Error('workflow "' + team.workflowId + '" not found')
      const step = workflow.steps.find((s) => s.stepId === args.step_id)
      if (step === undefined) throw new Error('unknown step "' + args.step_id + '" — available: ' + workflow.steps.map((s) => s.stepId).join(', '))
      // Resolve member: by exact name, or by assigneeHint role (find a member whose roleId matches the hint).
      const member = team.members.find((m) => m.status !== 'removed' && (m.name === args.member_name || m.roleId === args.member_name))
      if (member === undefined) throw new Error('no member named/role "' + args.member_name + '" in team')
      if (member.id === '') throw new Error('member "' + member.name + '" is not spawned yet')
      const text = 'Step "' + step.stepId + '": ' + step.goal + (args.context ? '\n\n' + args.context : '')
      const delivered = await deliverToMember(ctx, captain, member.id, text, exec.signal)
      return { step_id: step.stepId, member_name: member.name, delivered: delivered ? 'wake' : 'mailbox' }
    },
  }))
```

> 需要 `deliverToMember` 已在 tools.ts import（B1 应从 members.ts 导入；若没有则补 import）。

- [ ] **Step 2: index.ts 补工具名**

在 `src/index.ts` 的 toolNames 数组末尾（orchestra_relay 之后）追加：

```typescript
    'orchestra_dispatch_step',
```

并在 usage 文案的编排提示行补一句 "orchestra_dispatch_step to dispatch a step to a member"。

- [ ] **Step 3: 宿主编译**

Run 宿主编译命令。Expected: `pre 0`。若 dispatch_step 返回值 `delivered` 类型与 JsonValue 冲突，用 `delivered: delivered ? 'wake' as const : 'mailbox' as const` 调整。

- [ ] **Step 4: 提交**

```bash
git add src/tools.ts src/index.ts
git commit -m "feat(tools): add orchestra_dispatch_step to dispatch and wake a member per step"
```

---


## Task 4: assemble 生成带 persona 的成员 + relay 锁内读 fresh

**Files:**
- Modify: `src/orchestrator.ts`
- Modify: `src/tools.ts`

**目标**：让 assemble 产出的成员真正带角色 persona（buildPersona 合成），并让 relay 在锁内读 fresh 快照（final reviewer 观察 #4）。同时把 assemble 离线命名对齐 relay hint（final 观察 #2）。

- [ ] **Step 1: orchestrator.ts — assemble 用 buildPersona 填充成员 persona**

在 `src/orchestrator.ts`：
1. 顶部加 import：`import { buildPersona } from './persona-builder.ts'`
2. `assembleMembers` 里，构造成员后在其 persona 字段填入合成值。改 `instantiateMember` 调用/返回：在返回前若 `member.persona` 空，则用 buildPersona 生成。最简单做法：在 `instantiateMember` 末尾加：

```typescript
  const member: TeamMember = {
    id: '',
    name: overrides.name ?? defaultMemberName(overrides.role ?? role?.displayName ?? 'member', index),
    role: overrides.role ?? role?.displayName,
    roleId: role?.id,
    provider: overrides.provider ?? role?.defaultProvider,
    model: overrides.model ?? role?.defaultModel,
    mode: overrides.mode ?? role?.defaultMode,
    joinedAt: Date.now(),
    status: 'idle',
  }
  // Synthesize persona from the role template + member identity when not
  // explicitly provided, so spawn honors the role's identity.
  if (member.persona === undefined && role !== undefined) {
    member.persona = buildPersona({ role, member, teamName: member.name })
  }
  return member
```

> 注意：buildPersona 需要 `teamName`；这里用 `member.name` 作为 teamName 占位（真实队名由 assemble 调用方传入更合适，但为最小改动先用成员名；如需真实队名可在 assembleMembers 加参数 `teamName`，并传给 instantiateMember）。**建议**：给 assembleMembers 加可选 `teamName` 参数（默认 ''），instantiateMember 也加 teamName 参数，buildPersona 用真实队名。请实现时采用带 teamName 的方式（更正确），并在单测覆盖。

- [ ] **Step 2: assembleMembers 增加 teamName 参数**

```typescript
export function assembleMembers(
  workflow: WorkflowDef,
  overrides: Record<string, Partial<MemberInstantiation>> = {},
  teamName = '',
): TeamMember[] {
  ...
  const member = instantiateMember(role, ov, index, teamName)
  ...
}
```

`instantiateMember(role, overrides, index, teamName = '')` 内部 buildPersona 用传入 teamName。

- [ ] **Step 3: relay 改为锁内读 fresh**

在 `src/tools.ts` 的 `orchestra_relay` execute 改为锁内读 fresh（当前用锁外的 `requireCaptainTeam`）。参考 orchestra_assemble 的写法：

```typescript
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(workspace, config, captain)
      return withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(stateRoot, team.id, captain.id)
        if (fresh.workflowId === undefined) throw new Error('team has no active workflow — call orchestra_assemble first')
        const workflow = getWorkflow(fresh.workflowId)
        if (workflow === undefined) throw new Error('workflow "' + fresh.workflowId + '" not found')
        const decision = decideNext(workflow, args.completed_step_id)
        return {
          workflow_id: workflow.id,
          done: decision.done,
          ...(decision.nextStep !== undefined ? { next_step_id: decision.nextStep.stepId, next_assignee_hint: decision.nextStep.assigneeHint, members_direct: decision.nextStep.membersDirect === true } : {}),
        }
      })
    },
```

- [ ] **Step 4: 更新 orchestrator 单测（tests/orchestrator.test.mjs）追加 persona/teamName**

追加：

```javascript
import { buildPersona } from '../lib/persona-builder.js'
// 文件顶部已 import getRole；若无则补 getRole

t('assemble members carry synthesized persona from role template', () => {
  const m = assembleMembers(getWorkflow('write'), {}, 'myTeam')
  const novelist = m.find(x => x.roleId === 'novelist')
  assert.ok(novelist)
  assert.ok(novelist.persona && novelist.persona.includes('AI novelist'))
})
t('assemble with teamName passes to persona', () => {
  const m = assembleMembers(getWorkflow('research'), {}, 'research-team')
  const r = m.find(x => x.roleId === 'researcher')
  assert.ok(r && r.persona && r.persona.includes('research-team'))
})
```

- [ ] **Step 5: 编译 + 跑 orchestrator 单测**

Run 宿主编译，Then `node tests/orchestrator.test.mjs`。
Expected: 12 条 PASS（原 10 + 新 2）。若 buildPersona 的 teamName 行为导致断言失败，按实现调整。

- [ ] **Step 6: 提交**

```bash
git add src/orchestrator.ts src/tools.ts tests/orchestrator.test.mjs
git commit -m "feat(orchestrator): synthesize member persona in assemble, relay under lock"
```

---


## Task 5: 综合链路测试（assemble→dispatch→relay）

**Files:**
- Create: `tests/b2-complete.test.mjs`

**目标**：用纯逻辑 + mock（不真跑 LLM）验证整条编排链路在"逻辑层"的正确衔接：
1. 选 workflow（research）→ assemble 出成员（带 persona）
2. relay 从第一个 hint 算下一步
3. dispatch 解析成员（按 name 或 roleId 找得到成员）
由于 dispatch/relay 是工具层（依赖 DSH runtime），此处测试聚焦**它们调用的纯逻辑**，即验证 assemble 产物能被 relay-hint/dispatch 正确解析。

- [ ] **Step 1: 写综合测试**

创建 `tests/b2-complete.test.mjs`：

```javascript
import assert from 'node:assert/strict'
import { getWorkflow, getRole } from '../lib/workflow.js'
import { assembleMembers, decideNext, isMembersDirect } from '../lib/orchestrator.js'
import { buildPersona } from '../lib/persona-builder.js'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

t('research workflow: assemble produces members that relay hint can resolve by roleId', () => {
  const w = getWorkflow('research')
  const members = assembleMembers(w, {}, 'teamA')
  const first = w.steps[0]
  const candidate = members.find(m => m.name === first.assigneeHint || m.roleId === first.assigneeHint)
  assert.ok(candidate, 'relay hint should resolve to an assembled member')
})
t('write workflow: novelist member has novelist roleId + persona + tools on role', () => {
  const w = getWorkflow('write')
  const members = assembleMembers(w, {}, 'writing-team')
  const novelist = members.find(m => m.roleId === 'novelist')
  assert.ok(novelist)
  assert.ok(novelist.persona.includes('AI novelist'))
  assert.deepStrictEqual(getRole('novelist').tools ?? [], ['novel_read', 'novel_apply_change'])
})
t('dev workflow relay: reviewer step is membersDirect', () => {
  const w = getWorkflow('dev')
  const d = decideNext(w, 'engineer')
  assert.equal(d.nextStep?.stepId, 'reviewer')
  assert.equal(isMembersDirect(w, 'reviewer'), true)
})
t('persona-builder roundtrip: buildPersona of assembled novelist uses model override', () => {
  const m = assembleMembers(getWorkflow('write'), { novelist: { model: 'trae-solo/Doubao-Seed-2.1-Turbo' } }, 'writing')
  const novelist = m.find(x => x.roleId === 'novelist')
  const p = buildPersona({ role: getRole('novelist'), member: novelist, teamName: 'writing' })
  assert.ok(p.includes('trae-solo/Doubao-Seed-2.1-Turbo'))
})

console.log('\nb2-complete: ' + passed + ' passed')
```

- [ ] **Step 2: 编译 + 跑综合测试**

Run 宿主编译，Then `node tests/b2-complete.test.mjs`。
Expected: 4 条 PASS。

> 注意：本测试依赖 Task 4 的 assemble 带 persona + `getRole('novelist').tools`（Task 1 加的）。请确保 Task 1-4 已完成本测试才能过。

- [ ] **Step 3: 提交**

```bash
git add tests/b2-complete.test.mjs
git commit -m "test(b2): add assemble/dispatch/relay integration test"
```

---

## 全量验证（B2 完成后）

```bash
# 宿主编译
node -e "const ts=require('C:/Users/Administrator/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js');const fs=require('fs');const p=require('path');const cwd=process.cwd();const cfg=ts.parseJsonConfigFileContent(JSON.parse(fs.readFileSync(p.join(cwd,'tsconfig.json'),'utf8')),ts.sys,cwd);const prog=ts.createProgram(cfg.fileNames,cfg.options);const emit=prog.emit();const d=ts.getPreEmitDiagnostics(prog);console.log('pre',d.length,'emitSkipped',emit.emitSkipped);process.exit(d.length||emit.emitSkipped?1:0);"
# 全部单测
node tests/workflow.core.test.mjs
node tests/persona-builder.test.mjs
node tests/orchestrator.test.mjs
node tests/b2-complete.test.mjs
```
Expected: workflow 13 / persona 3 / orchestrator 12 / b2 4 = 32 条全过；宿主编译 pre 0。

## Non-Goals（明确不做）
- 轻量子流程真实运行、独立嵌套团队、对话化 UI、digest 注入、真实 DSH e2e —— 见计划头。

## Self-Review
**1. Spec 覆盖**：B1 遗留观察 #1(persona 接入 spawn,Task2)、#2(hint 对齐,Task4)、#3(custom 校验,Task1)、#4(relay fresh,Task4) 全涵盖；dispatch_step(对话派活核心,Task3)；AI 小说家工具白名单(Task1)；综合测试(Task5)。✅
**2. Placeholder scan**：无 TBD；每 Task 有代码、验证、提交。✅
**3. Type consistency**：
- `assembleMembers(workflow, overrides, teamName='')` 与 instantiateMember(role, ov, index, teamName) 一致（Task4）；或 orchestrator 测试与 tools 调用对齐。✅
- `buildPersona` 已在 persona-builder 导出，orchestrator/tests 复用。✅
- `getRole('novelist').tools` 在 Task1 加，综合测试引用一致。✅
- dispatch_step 用 `team.members` 的 `name`/`roleId` 解析，与 assemble 产物一致。✅
