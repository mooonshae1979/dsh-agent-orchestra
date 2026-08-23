/**
 * Durable AgentOrchestra state types.
 *
 * A team is one directory under the state root holding `team.json` plus an
 * `inbox/` of per-agent JSONL mailboxes. Members are continuable subagents
 * whose durable child session ids are recorded in the team file, so a team
 * survives harness restarts.
 * @module dsh-agent-orchestra/types
 */

/** Task lifecycle statuses in progression order. */
export type TaskStatus =
  | 'pending'
  | 'claimed'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Statuses after which a task can no longer be claimed or worked on. */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled']

/** One task of a team's task list. */
export interface TeamTask {
  /** Stable task id within the team (`t1`, `t2`, …). */
  id: string
  /** Brief title for the task. */
  subject: string
  /** What needs to be done. */
  description?: string
  status: TaskStatus
  /** Member name the task is assigned to; unassigned tasks await a claim. */
  assignee?: string
  /** Task ids that must reach `completed` before this task can be claimed. */
  dependencies: string[]
  /** The worker's written result, set when the task completes or fails. */
  output?: string
  createdAt: number
  updatedAt: number
}

/** Member lifecycle status. */
export type MemberStatus = 'idle' | 'working' | 'removed'

/**
 * Member tool-set mode:
 * - `minimal`  — focused coding agent: pwsh + str_replace_editor plus the
 *   team-collaboration tools (claim/update task, send message, status). NOTE:
 *   under the Anchored Standard preset this toolFilter cuts the post-promotion
 *   full toolset, so prefer `standard` unless a truly minimal one-shot member
 *   is intended.
 * - `standard` — full tools minus captain-only management tools (default).
 *   Recommended for Anchored Standard captains: the member inherits the
 *   preset's bootstrap-then-promote trajectory without losing the full set.
 */
export type MemberMode = 'minimal' | 'standard'

/** One team member: a continuable subagent plus its team-side record. */
export interface TeamMember {
  /** Durable continuable subagent session id (empty until spawned). */
  id: string
  /** Unique display name inside the team. */
  name: string
  /** Role description, e.g. `researcher`, `engineer`, `reviewer`. */
  role?: string
  /** Optional RoleDef id this member instantiated (for persona fallback). */
  roleId?: string
  /** Optional subagent provider override (e.g. `spawn`/`fork`). This is the subagent spawn provider, NOT a model vendor — for a model vendor use `model` (which may carry `provider/model`). */
  provider?: string
  /** Optional model override for this member. */
  model?: string
  /** Tool-set mode; defaults to `standard` when absent. */
  mode?: MemberMode
  /** Optional pre-synthesized persona (wins over roleId-template synthesis). */
  persona?: string
  joinedAt: number
  status: MemberStatus
}

/** One mailbox message. */
export interface TeamMessage {
  id: string
  /** `captain` or a member name. */
  from: string
  /** `captain` or a member name. */
  to: string
  content: string
  ts: number
}

/** The full durable team record. */
export interface TeamState {
  /** Original team name. */
  name: string
  /** Sanitized directory id; the team's stable identity. */
  id: string
  /** Team purpose/goal. */
  description?: string
  /** Session id of the captain agent that owns this team. */
  captainSessionId: string
  createdAt: number
  /** Teammates only; the captain is implicit (the owning session). */
  members: TeamMember[]
  tasks: TeamTask[]
  /** Active workflow id when the team is assembled from a workflow. */
  workflowId?: string
  /** Index of the workflow step currently in flight (relay advances it). */
  stepIndex?: number
  /** Monotonic task id counter. */
  taskSeq: number
}

/** One step in a workflow: what to produce and who does it next. */
export interface StepDef {
  /** Stable id of this step within its workflow. */
  stepId: string
  /** What this step should produce. */
  goal: string
  /** Expected output kind: `text`, `artifact`, or `any` (unrestricted, passed to the next step). */
  outputType: 'text' | 'artifact' | 'any'
  /** Next step's stepId; undefined means the workflow ends here. */
  next?: string
  /** When true, members of this step talk directly to each other (relay-free handoff, bypassing the captain). */
  membersDirect?: boolean
  /** Suggested role id responsible for this step (e.g. `engineer`/`reviewer`). */
  assigneeHint?: string
  /** Nested sub-workflow (lightweight: this step internally runs a predefined workflow). */
  subflow?: WorkflowDef
}

/** A workflow template: an ordered list of steps producing a goal. */
export interface WorkflowDef {
  /** Stable workflow id. */
  id: string
  /** Human-readable workflow name. */
  name: string
  /** Ordered list of steps. */
  steps: StepDef[]
}

/** A Role template in the (semi-prebuilt) identity library. */
export interface RoleDef {
  /** Stable role id (e.g. `engineer`, `reviewer`). */
  id: string
  /** Human-readable role display name. */
  displayName: string
  /** Pre-synthesized persona text for this role. */
  persona: string
  /** Optional default subagent provider override (e.g. `spawn`/`fork`). */
  defaultProvider?: string
  /** Optional default model override for this role. */
  defaultModel?: string
  /** Optional default tool-set mode for this role. */
  defaultMode?: MemberMode
  /** Optional tool whitelist for this role. */
  tools?: string[]
}
