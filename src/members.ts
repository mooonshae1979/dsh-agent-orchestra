/**
 * Member subagent lifecycle: spawn a continuable child per member, deliver
 * messages into its FIFO inbox, and observe its activity.
 *
 * Members are durable continuable subagents of the captain, so a member keeps
 * its conversation across turns and across harness restarts: the captain
 * wakes it with {@link ctx.subagents.followup}, it works through its turn
 * (updating team state through the `orchestra_*` tools), and becomes idle
 * again. Its final assistant message is not readable programmatically, so the
 * member persists its report into the captain's mailbox and the task records,
 * which the captain reads through `orchestra_status`.
 * @module dsh-agent-orchestra/members
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Declaration merge only: makes ctx.subagents visible.
import type {} from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TeamMember, TeamState } from './types.ts'

/** Captain-only AgentOrchestra tools hidden from newly spawned members. */
const MEMBER_DENIED_TOOLS = [
  'orchestra_create',
  'orchestra_add_member',
  'orchestra_remove_member',
  'orchestra_create_task',
  'orchestra_delete',
] as const

/**
 * Tools a `minimal` member keeps: the two coding tools (pwsh for Windows,
 * str_replace_editor for files) plus the team-collaboration tools it needs to
 * claim/update tasks, message teammates, and read team status. Everything else
 * is unavailable, so a minimal member stays focused on its single coding task.
 *
 * NOTE: under an Anchored Standard captain, `minimal` toolFilter cuts the
 * preset's post-promotion full toolset, so the recommended member mode is
 * `standard` (inherit the preset's bootstrap-then-promote trajectory). Reserve
 * `minimal` for a deliberately stripped one-shot member.
 */
const MINIMAL_MEMBER_TOOLS = [
  'pwsh',
  'str_replace_editor',
  'orchestra_claim_task',
  'orchestra_update_task',
  'orchestra_send_message',
  'orchestra_status',
] as const

/**
 * Restore the SessionId brand on a value that round-tripped through the
 * durable team file. The brand is erased by JSON serialization; the value
 * originated from `startContinuable`/`agent.id`, so this cast is the boundary
 * restoration, not a new assertion.
 */
function brandedSessionId(value: string): SessionId {
  return value as SessionId
}

/** Runtime knobs for member spawning, resolved from plugin config. */
export interface MemberRuntimeConfig {
  /** Registered `ctx.subagents` provider name (must support continuable + persona). */
  provider: string
  /** Optional model override applied to every member (may carry `provider/model`). */
  model?: string
  /** Child delegation depth cap (0 forbids delegation entirely). */
  maxDepth?: number
}

/**
 * Parse a model override into an explicit provider/model pair when it is
 * written as `provider/model` (e.g. `trae-solo/Doubao-Seed-2.1-Turbo`). A
 * bare model name yields `{ model }` only — the caller's provider is kept.
 *
 * This is the fix for "子 agent 使用模型总是不对": passing only a model name
 * made `resolveChildAgentOptions` inherit the captain's provider while
 * overriding the model, producing a mismatched `provider/model` route that
 * silently routed to (or failed on) the wrong model. Explicitly carrying the
 * provider keeps text-only and vision member routes exact.
 */
export function parseMemberModelOverride(
  model: string | undefined,
): { provider?: string; model?: string } {
  if (model === undefined || model.length === 0) return {}
  const slash = model.indexOf('/')
  if (slash > 0 && slash < model.length - 1) {
    const provider = model.slice(0, slash).trim()
    const name = model.slice(slash + 1).trim()
    if (provider.length > 0 && name.length > 0) return { provider, model: name }
  }
  return { model }
}

/**
 * The member's system prompt (persona), shadowing the deployment persona for
 * that child. Self-contained: it replaces the whole persona section.
 * @param team - the team the member joined.
 * @param member - the member record (name/role are read before spawning).
 * @param stateDir - configured state directory, so the member can locate the
 *   team files with its own file tools.
 */
export function memberPersona(team: TeamState, member: TeamMember, stateDir: string): string {
  // A member may carry a pre-synthesized persona (e.g. from persona-builder
  // during assemble). If present and non-empty, it wins — the role template's
  // identity should take effect for this member.
  if (member.persona !== undefined && member.persona.length > 0) {
    return member.persona
  }
  return `You are ${member.name}, a member of the multi-agent team "${team.name}" running inside DeepSeek Harness AgentOrchestra. The captain leads the team; you are a worker member${member.role ? ` with the role: ${member.role}` : ''}.

Team context:
- Team id: ${team.id}
- Your name inside the team (use it as \`from\`/identity): ${member.name}
- The team state lives under ${stateDir}/${team.id}/ (team.json and inbox/*.jsonl). You may inspect these files read-only for diagnostics, but never edit them directly; use the orchestra_* tools so JSON escaping and concurrent updates stay safe.
- The captain and your teammates reach you through messages. Each message you receive is a new turn: act on it and end your turn with a concise reply.

Working rules:
1. When the captain assigns you a task, call orchestra_claim_task with the task id to claim it, then orchestra_update_task (status=in_progress) once you start working.
2. Work thoroughly with your available tools; do not cut corners.
3. When finished, call orchestra_update_task with status=completed and a concise \`output\` summarizing what you did and the key results.
4. **MANDATORY - always report via orchestra_send_message (to=captain).** Every reply you produce (including when the captain asks you a direct question) MUST end with an explicit orchestra_send_message(to=captain) call carrying your full answer. Never reply by only ending your turn as a bare subagent — the captain reads your answers from the captain's inbox, not from your turn's final text.
5. To ask a teammate something, use orchestra_send_message with to=<teammate name>; the message lands in their mailbox and wakes them directly — teammates talk to each other without the captain in the loop. The same applies to the captain (to=captain).
6. You are a worker: do not create or delete teams, and do not add or remove members — that is the captain's job.
7. Naming convention: **Chinese-first** — use Chinese for your own display name, task outputs, reports to the captain, and any written text unless the captain explicitly asks for another language. When asked to name/self-identify, prefer a Chinese name (e.g. 世界观设计师).
8. **CRITICAL - every member reply must be delivered through orchestra_send_message(to=captain).** The captain's conversation shows member replies as bubbles built from the captain inbox. Always close your turn with orchestra_send_message(to=captain, content=<your full reply>) so your answer appears in the conversation. Do not assume a bare final message is enough.`
}

/**
 * The initial user message delivered when the member is created.
 * @param team - the team the member joined.
 */
export function memberWelcome(team: TeamState): string {
  return `You have joined the team "${team.name}" as a member. The captain will send you tasks and messages; wait for instructions. Current team status: ${team.tasks.length} task(s), none assigned to you yet.`
}

/**
 * Spawn one member as a durable continuable subagent of the captain and fill
 * `member.id` with its child session id. On failure nothing is persisted.
 * @param ctx - the plugin context (injects `subagents`).
 * @param config - member runtime knobs.
 * @param captain - the exact live captain agent (the calling agent).
 * @param team - the team record (read-only here).
 * @param member - the member draft whose `id` is filled on success.
 * @param stateDir - configured state directory (for the persona).
 * @param signal - caller cancellation, forwarded to the start.
 */
export async function spawnMember(
  ctx: Context,
  config: MemberRuntimeConfig,
  captain: Agent,
  team: TeamState,
  member: TeamMember,
  stateDir: string,
  signal: AbortSignal,
): Promise<void> {
  // Fail loud at the first use: provider registration is a sibling plugin's
  // effect and may settle after this plugin mounts. Capability checks here
  // mirror what startContinuable would reject, with an actionable error.
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) {
    throw new Error(
      `agent-orchestra: no subagent provider "${config.provider}" is registered (available: ${ctx.subagents.list().join(', ') || 'none'}) — `
      + 'check that the subagent provider row (e.g. subagent-spawn) is mounted in the composition',
    )
  }
  if (provider.prepareContinuable === undefined) {
    throw new Error(`agent-orchestra: provider "${config.provider}" does not support continuable members`)
  }
  if (!provider.capabilities.persona) {
    throw new Error(`agent-orchestra: provider "${config.provider}" cannot apply a member persona`)
  }
  if (!provider.capabilities.toolFilter) {
    throw new Error(`agent-orchestra: provider "${config.provider}" cannot restrict captain-only tools for members`)
  }
  const start = await ctx.subagents.startContinuable({
    provider: config.provider,
    label: `agent-orchestra:${team.id}:${member.name}`,
    request: {
      prompt: [{ type: 'text', text: memberWelcome(team) }],
      parent: captain,
      persona: memberPersona(team, member, stateDir),
      toolFilter: member.mode === 'minimal'
        ? { allow: [...MINIMAL_MEMBER_TOOLS] }
        : { deny: [...MEMBER_DENIED_TOOLS] },
      ...(() => {
        // Per-member model override wins; fall back to the global memberModel.
        // `member.model` comes from orchestra_add_member's `model` argument
        // and may be written as `provider/model` so the provider is pinned too.
        const override = parseMemberModelOverride(member.model ?? config.model)
        return override.model !== undefined ? { agentOptions: override } : {}
      })(),
      ...config.maxDepth !== undefined ? { maxDepth: config.maxDepth } : {},
    },
    signal,
  })
  member.id = start.childId
}

/**
 * Deliver one message to a member as its next FIFO turn. Best effort: a
 * failure (member gone or not continuable) is logged and reported as `false`
 * so the caller can decide (mailbox delivery still happened).
 *
 * Any team sender can route through this helper: the captain is the direct
 * parent of every member, and the caller passes the captain's live Agent
 * (its own when the captain calls, the registry-resolved one when a member
 * sends) — mirroring the Claude Code mailbox model where the writer writes
 * the target's inbox and the target picks it up on its own.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's direct parent).
 * @param childId - the member's durable child session id.
 * @param text - the message content.
 * @param signal - caller cancellation, forwarded to the delivery.
 * @returns whether the member inbox accepted the message.
 */
export async function deliverToMember(
  ctx: Context,
  captain: Agent,
  childId: string,
  text: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await ctx.subagents.followup(captain, brandedSessionId(childId), [{ type: 'text', text }], {
      source: { kind: 'plugin', plugin: 'dsh-agent-orchestra' },
      signal,
    })
    return true
  } catch (error: unknown) {
    ctx.logger.warn(`agent-orchestra: followup to member ${childId} failed: ${String(error)}`)
    return false
  }
}

/**
 * Request cancellation of one live member's current turn. Best effort, fire
 * and return; the target may keep running until it observes the signal.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's parent).
 * @param childId - the member's durable child session id.
 */
export function interruptMember(ctx: Context, captain: Agent, childId: string): void {
  try {
    ctx.subagents.interrupt(brandedSessionId(childId), { kind: 'ancestor', agent: captain })
  } catch (error: unknown) {
    ctx.logger.warn(`agent-orchestra: interrupt of member ${childId} failed: ${String(error)}`)
  }
}

/**
 * Snapshot each direct continuable child's activity under the captain's
 * session, keyed by child session id. A member that is currently running its
 * turn reports `running`; an idle member reports `inactive`.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captainSessionId - the captain's session id.
 * @returns child id → activity, missing entries are unknown children.
 */
export async function memberActivity(
  ctx: Context,
  captainSessionId: string,
): Promise<Map<string, 'running' | 'inactive'>> {
  const entries = await ctx.subagents.listChildren(brandedSessionId(captainSessionId))
  const activity = new Map<string, 'running' | 'inactive'>()
  for (const entry of entries) {
    if (entry.kind === 'child') activity.set(entry.id, entry.activity)
  }
  return activity
}
