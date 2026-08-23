/**
 * Synthesize a member persona from a Role template plus per-member overrides.
 * Pure-logic module: imports only types (no DSH runtime).
 * @module dsh-agent-orchestra/persona-builder
 */

import type { RoleDef, TeamMember } from './types.ts'

export interface PersonaInput {
  role?: RoleDef
  member: Pick<TeamMember, 'name' | 'role' | 'model' | 'provider' | 'mode' | 'persona'>
  teamName: string
}

/** When a member carries an explicit `persona`, it wins entirely. */
export function buildPersona(input: PersonaInput): string {
  if (input.member.persona !== undefined && input.member.persona.length > 0) {
    return input.member.persona
  }
  const base = input.role?.persona ?? 'You are a member of team "' + input.teamName + '".'
  const runtime = [
    input.member.role !== undefined ? 'role: ' + input.member.role : '',
    input.member.provider !== undefined ? 'provider: ' + input.member.provider : '',
    input.member.model !== undefined ? 'model: ' + input.member.model : '',
    'mode: ' + (input.member.mode ?? 'standard'),
  ].filter(Boolean).join(', ')
  return [
    'You are ' + input.member.name + ' of team "' + input.teamName + '".',
    runtime.length > 0 ? 'Runtime — ' + runtime + '.' : '',
    base,
    'Naming: Chinese-first — prefer Chinese for your display name, outputs, and reports unless the captain requests otherwise.',
    'Reporting: MANDATORY — always close your turn with orchestra_send_message(to=captain, content=<your full reply>); the captain reads member answers from the inbox and shows them as bubbles in the conversation.',
  ].filter(Boolean).join('\n')
}
