/**
 * Workflow / Role definitions and pure validation for the orchestration core.
 *
 * Pure-logic module: imports only types from `./types.ts` (no DSH runtime).
 * @module dsh-agent-orchestra/workflow
 */

import type { RoleDef, StepDef, WorkflowDef } from './types.ts'

/** Validate a workflow's step graph: every `next` must reference a real step. */
export function validateWorkflow(workflow: WorkflowDef): string[] {
  const errors: string[] = []
  if (workflow === undefined || workflow === null || typeof workflow !== 'object') {
    return ['workflow must be an object']
  }
  if (!Array.isArray(workflow.steps)) {
    return ['workflow must have a steps array']
  }
  const ids = new Set<string>()
  for (const step of workflow.steps) {
    if (step === undefined || typeof step !== 'object' || typeof step.stepId !== 'string' || step.stepId.length === 0) {
      errors.push('a step is missing a non-empty stepId')
      continue
    }
    ids.add(step.stepId)
  }
  if (ids.size !== workflow.steps.length) {
    errors.push(`workflow "${String(workflow.id ?? '')}" has duplicate step ids`)
  }
  for (const step of workflow.steps) {
    if (step === undefined || typeof step !== 'object' || typeof step.stepId !== 'string' || step.stepId.length === 0) {
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

/** Default role templates for the semi-prebuilt identity library. */
export const DEFAULT_ROLES: RoleDef[] = [
  { id: 'researcher', displayName: 'researcher', persona: 'You are a thorough researcher. Gather, verify and summarize information with cited sources. Output a clear research report.' },
  { id: 'engineer', displayName: 'engineer', persona: 'You are a pragmatic software engineer. Implement clean, tested code following the task spec. Report what you changed and why.' },
  { id: 'reviewer', displayName: 'reviewer', persona: 'You are a rigorous reviewer. Review the produced artifact for correctness, quality and completeness. Provide actionable feedback or an approval.' },
  { id: 'planner', displayName: 'planner', persona: 'You are an architect/planner. Turn the goal into a concrete execution plan with clear steps, boundaries and acceptance criteria.' },
  // Novel tools are declarative suggestions (the member persona references them);
  // applying them as a spawn toolFilter is wired in a later milestone.
  { id: 'novelist', displayName: 'novelist', persona: 'You are an AI novelist. Write engaging, coherent prose. Use the novel tools (novel_read / novel_apply_change) when available. Produce polished creative text.', tools: ['novel_read', 'novel_apply_change'] },
]

/** Default workflow templates. */
export const DEFAULT_WORKFLOWS: WorkflowDef[] = [
  {
    id: 'research', name: 'research',
    steps: [
      { stepId: 'researcher', goal: 'research and report', outputType: 'text', assigneeHint: 'researcher', next: 'reviewer' },
      { stepId: 'reviewer', goal: 'review report', outputType: 'text', assigneeHint: 'reviewer' },
    ],
  },
  {
    id: 'dev', name: 'dev',
    steps: [
      { stepId: 'engineer', goal: 'implement', outputType: 'artifact', assigneeHint: 'engineer', next: 'reviewer' },
      { stepId: 'reviewer', goal: 'code review', outputType: 'text', assigneeHint: 'reviewer', membersDirect: true },
    ],
  },
  {
    id: 'implement', name: 'implement',
    steps: [
      { stepId: 'planner', goal: 'plan', outputType: 'text', assigneeHint: 'planner', next: 'engineer' },
      { stepId: 'engineer', goal: 'implement per plan', outputType: 'artifact', assigneeHint: 'engineer', next: 'reviewer' },
      { stepId: 'reviewer', goal: 'review implement', outputType: 'text', assigneeHint: 'reviewer', membersDirect: true },
    ],
  },
  {
    id: 'write', name: 'write',
    steps: [
      { stepId: 'novelist', goal: 'write text', outputType: 'text', assigneeHint: 'novelist', next: 'reviewer' },
      { stepId: 'reviewer', goal: 'review/polish', outputType: 'text', assigneeHint: 'reviewer', membersDirect: true },
    ],
  },
]

/** Look up a workflow by id; `undefined` when unknown. */
export function getWorkflow(id: string): WorkflowDef | undefined {
  return DEFAULT_WORKFLOWS.find((workflow) => workflow.id === id)
}

/** Look up a role by id; `undefined` when unknown. */
export function getRole(id: string): RoleDef | undefined {
  return DEFAULT_ROLES.find((role) => role.id === id)
}

/** Find a step by id within a workflow (including subflows). */
export function findStep(workflow: WorkflowDef, stepId: string): StepDef | undefined {
  for (const step of workflow.steps) {
    if (step.stepId === stepId) return step
    if (step.subflow !== undefined) {
      const found = findStep(step.subflow, stepId)
      if (found !== undefined) return found
    }
  }
  return undefined
}
