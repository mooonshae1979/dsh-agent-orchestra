import type { AgentOrchestraBubbleData } from './bubble-pure.ts'

/** One member row of a host snapshot (structural subset; avoid ActivityPanel import to keep pure). */
export interface EnrichMember { readonly id?: string; readonly name?: string; readonly role?: string }
/** One task row of a host snapshot. */
export interface EnrichTask { readonly id?: string; readonly subject?: string }
/** One team snapshot (structural subset). */
export interface EnrichTeam {
  readonly members?: readonly EnrichMember[]
  readonly tasks?: readonly EnrichTask[]
  readonly captainSessionId?: string
}

export interface BubbleEnrichment {
  readonly name?: string
  readonly role: string
  readonly sessionId: string
  readonly taskSubject: string
}

/**
 * Match one bubble against team snapshots; missing matches degrade to ''.
 * Looks up by `fromMember` name first; if not found and `data.fromId` is set,
 * falls back to `member.id === data.fromId` (e.g. subagent-settled bubbles).
 * Pure + total: never throws on malformed input.
 */
export function enrichBubble(
  data: AgentOrchestraBubbleData | undefined,
  teams: readonly EnrichTeam[] | undefined,
): BubbleEnrichment {
  const empty: BubbleEnrichment = { role: '', sessionId: '', taskSubject: '' }
  if (data === undefined || !Array.isArray(teams)) return empty
  const from = data.fromMember ?? ''
  const fromId = data.fromId ?? ''
  let name = ''
  let role = ''
  let sessionId = ''
  let subject = ''
  for (const team of teams) {
    if (!team || !Array.isArray(team.members)) continue
    for (const member of team.members) {
      if (!member) continue
      const nameMatch = member.name === from
      const idMatch = fromId !== '' && member.id === fromId
      if (!nameMatch && !idMatch) continue
      if (name === '' && member.name) name = member.name
      if (role === '' && member.role) role = member.role
      if (sessionId === '' && member.id) sessionId = member.id
    }
  }
  // Captain is not in members[]; allow task-done (from captain) to navigate.
  if (sessionId === '' && from === 'captain') {
    for (const team of teams) {
      if (team && team.captainSessionId) { sessionId = team.captainSessionId; break }
    }
  }
  if (data.kind === 'task-done' && data.taskId) {
    for (const team of teams) {
      if (!team || !Array.isArray(team.tasks)) continue
      for (const task of team.tasks) {
        if (task && task.id === data.taskId && task.subject) { subject = task.subject; break }
      }
      if (subject !== '') break
    }
  }
  return {
    ...(name !== '' ? { name } : {}),
    role,
    sessionId,
    taskSubject: subject,
  }
}
