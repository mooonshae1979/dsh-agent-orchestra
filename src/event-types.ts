/**
 * AgentOrchestra session event types — pure types only, zero imports.
 *
 * This file intentionally imports nothing: both the host program (the
 * emitter in `events.ts`) and the browser program (the Conversation Node
 * definition) must be able to load these types and the `SessionEventMap`
 * declaration merge without pulling in host-side `Context` augmentations
 * (dsh-session's index declares `Context.sessions: SessionStore`, which
 * collides with the browser runtime's `ISessions` under the same name).
 * @module dsh-agent-orchestra/event-types
 */

/** Opens one team record: the captain created the team. */
export interface AgentOrchestraTeamCreatedData {
  readonly teamId: string
  /** The captain session that owns this team (UI follows it). */
  readonly captainSessionId: string
  readonly name: string
  readonly description?: string
}

/** Records one member after its continuable subagent is spawned. */
export interface AgentOrchestraMemberAddedData {
  readonly teamId: string
  readonly memberId: string
  readonly name: string
  readonly role?: string
}

/** Marks one member removed. */
export interface AgentOrchestraMemberRemovedData {
  readonly teamId: string
  readonly memberId: string
}

/** Records one task in the team's task list. */
export interface AgentOrchestraTaskCreatedData {
  readonly teamId: string
  readonly taskId: string
  readonly subject: string
  readonly dependencies: readonly string[]
  readonly assignee?: string
}

/** Records one task status/assignee/output transition. */
export interface AgentOrchestraTaskUpdatedData {
  readonly teamId: string
  readonly taskId: string
  readonly status: string
  readonly assignee?: string
  readonly output?: string
}

/** Closes one team record: the team was deleted. */
export interface AgentOrchestraTeamDeletedData {
  readonly teamId: string
}

/** Records one mailbox message sent between team agents. */
export interface AgentOrchestraMessageSentData {
  readonly teamId: string
  readonly messageId: string
  /** `captain` or a member name. */
  readonly from: string
  /** `captain` or a member name. */
  readonly to: string
  readonly content: string
  readonly ts: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one team record.
     * @param data - stable team identity and display name.
     */
    'agent-orchestra/team-created': AgentOrchestraTeamCreatedData
    /**
     * Records one team member.
     * @param data - team identity, member child session, and display identity.
     */
    'agent-orchestra/member-added': AgentOrchestraMemberAddedData
    /**
     * Records one member removal.
     * @param data - team identity and the member's child session id.
     */
    'agent-orchestra/member-removed': AgentOrchestraMemberRemovedData
    /**
     * Records one task creation.
     * @param data - team identity, task id, subject, dependencies, assignee.
     */
    'agent-orchestra/task-created': AgentOrchestraTaskCreatedData
    /**
     * Records one task transition.
     * @param data - team identity, task id, and the new status/assignee/output.
     */
    'agent-orchestra/task-updated': AgentOrchestraTaskUpdatedData
    /**
     * Records one mailbox message.
     * @param data - team identity, sender, recipient, and content.
     */
    'agent-orchestra/message-sent': AgentOrchestraMessageSentData
    /**
     * Closes one team record after deletion.
     * @param data - stable team identity.
     */
    'agent-orchestra/team-deleted': AgentOrchestraTeamDeletedData
  }
}

/** The full set of `agent-orchestra/*` event names. */
export type AgentOrchestraEventType =
  | 'agent-orchestra/team-created'
  | 'agent-orchestra/member-added'
  | 'agent-orchestra/member-removed'
  | 'agent-orchestra/task-created'
  | 'agent-orchestra/task-updated'
  | 'agent-orchestra/message-sent'
  | 'agent-orchestra/team-deleted'
