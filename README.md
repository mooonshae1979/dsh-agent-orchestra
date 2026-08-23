# dsh-agent-orchestra

**dsh-agent-teams 的对话式编排进化版**（独立新仓库，插件名与工具前缀均与 `dsh-agent-teams` 区分，可并存安装）。

## 定位

在 `dsh-agent-teams` 的多 Agent 团队基础上，把协作方式升级为**对话驱动编排**：

- 在对话里 **@点名 直接给子 agent 派活**，或按成员身份自动分配/领取任务；
- 对话里默认有一个**任务分配者（队长/主模型）**，负责布置任务的拆解与分配；
- **按既定工作流**，子 agent 的答复自动打包给下一位继续下一步（工作流预置模板 + 对话覆盖）；
- **子 agent 身份不预制**，按任务现场定制（身份库模板 + 现场覆盖名字/角色/专长/模型/模式）；
- 内置**写作流（AI 小说家）**等模板，支持对话中**随时增删组员**、**轻量子流程（组内再走既定工作流）**。

## 与 dsh-agent-teams 的差异

| | dsh-agent-teams | dsh-agent-orchestra |
|---|---|---|
| 插件名 | `dsh-agent-teams` | `dsh-agent-orchestra` |
| 工具前缀 | `agent_teams_*` | `orchestra_*` |
| 状态目录 | `.agent-teams/` | `.agent-orchestra/` |
| 核心能力 | 手动编排（队长拆任务、派活、收结果） | 对话驱动 + 工作流自动接力 |

> 两者可同时安装、互不冲突。

## 状态

- [x] 设计 spec：`docs/specs/2026-08-23-conversation-orchestration-design.md`
- [ ] 实现（进行中，见 `sp-writing-plans` 产出计划）

## License

MIT
