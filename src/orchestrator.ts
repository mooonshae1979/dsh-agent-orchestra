/**
 * Orchestration-core pure decision logic: how a conversation request becomes
 * a set of member instances and a task/step queue, and how a completed step
 * relays to the next.
 *
 * Pure-logic module (no DSH runtime) — unit-testable with plain node.
 * @module dsh-agent-orchestra/orchestrator
 */

import type { MemberMode, RoleDef, StepDef, TeamMember, WorkflowDef } from './types.ts'
import { getRole } from './workflow.ts'

export interface MemberInstantiation {
  name?: string
  role?: string
  provider?: string
  model?: string
  mode?: MemberMode
}

/** Derive a deterministic member name from role + index (dedupe-friendly). */
export function defaultMemberName(roleId: string, index: number): string {
  return index === 0 ? roleId : roleId + '-' + (index + 1)
}

/** Build a fresh member instance for a step from a role template + overrides. */
export function instantiateMember(
  role: RoleDef | undefined,
  overrides: Partial<MemberInstantiation>,
  index: number,
): TeamMember {
  return {
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
}

/** Build one member per distinct assigneeHint in a workflow, honoring overrides. */
export function assembleMembers(
  workflow: WorkflowDef,
  overrides: Record<string, Partial<MemberInstantiation>> = {},
): TeamMember[] {
  const members: TeamMember[] = []
  const seen = new Set<string>()
  let index = 0
  for (const step of workflow.steps) {
    const hint = step.assigneeHint
    if (hint === undefined) continue
    if (seen.has(hint)) continue
    const ov = overrides[hint] ?? {}
    const role = getRole(hint)
    const member = instantiateMember(role, ov, index)
    members.push(member)
    seen.add(hint)
    index += 1
  }
  return members
}

export interface RelayDecision {
  nextStep: StepDef | undefined
  done: boolean
}

/** Given the completed step id, decide the next step by `next` pointer. */
export function decideNext(workflow: WorkflowDef, completedStepId: string): RelayDecision {
  const step = workflow.steps.find((s) => s.stepId === completedStepId)
  if (step === undefined) return { nextStep: undefined, done: true }
  if (step.next === undefined) return { nextStep: undefined, done: true }
  const next = workflow.steps.find((s) => s.stepId === step.next)
  return { nextStep: next, done: next === undefined }
}

/** Whether a step should let members talk directly (no captain relay). */
export function isMembersDirect(workflow: WorkflowDef, stepId: string): boolean {
  const step = workflow.steps.find((s) => s.stepId === stepId)
  return step?.membersDirect === true
}
