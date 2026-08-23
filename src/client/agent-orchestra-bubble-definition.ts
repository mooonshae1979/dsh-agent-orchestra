/** AgentOrchestra conversation bubble node data. */
import type {
  ChatConversationViewNode, ConversationNodeContext,
  ConversationMatch, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { AgentOrchestraBubbleData } from './bubble-pure.ts'
export type { AgentOrchestraBubbleData }
import { parseSendMessageBubble, parseUpdateTaskBubble, parseSubagentSettledBubble, collapseText, BUBBLE_EXCERPT_LEN } from './bubble-pure.ts'
// Module-loading imports: the declaration merges below extend modules that
// must be present in the program — a type-only import both loads them and is
// erased from the bundle.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One member's interaction bubble in the conversation. */
    'member-message': AgentOrchestraBubbleData
    /** One completed-task bubble in the conversation. */
    'task-done': AgentOrchestraBubbleData
    /** One member direct-reply (subagent-settled) notice in the conversation. */
    'member-settled': AgentOrchestraBubbleData
  }
}

/** Mutable business state folded out of the durable tool events. */
export interface MutableBubbleState {
  readonly kind: 'member-message' | 'task-done' | 'member-settled'
  readonly fromMember: string
  readonly fromRole: string
  readonly fromId: string
  readonly toMember?: string
  readonly taskId?: string
  readonly taskSubject?: string
  readonly text: string
  readonly ts: number
  readonly accepted: boolean
}

/** Safety-returned empty state when a start cannot rebuild bubble data. */
function emptyState(kind: 'member-message' | 'task-done' | 'member-settled'): MutableBubbleState {
  return {
    kind,
    fromMember: '未知成员',
    fromRole: '',
    fromId: '',
    toMember: undefined,
    taskId: undefined,
    taskSubject: undefined,
    text: '',
    ts: 0,
    accepted: false,
  }
}

/** True when a tool/result event indicates a failed call. */
function resultFailed(event: ConversationMatch['event']): boolean {
  if (event.type !== 'tool/result') return true
  if (event.data.error !== undefined) return true
  const content = event.data.message?.content
  return !Array.isArray(content)
    || content.some((block) => block.type === 'tool-result' && block.isError === true)
}

/**
 * Fold each durable `orchestra_send_message` tool/call + tool/result pair into
 * one member-message bubble anchored at the tool/call.
 * @module dsh-agent-orchestra/client/bubble
 */
export const memberMessageDefinition: ConversationNodeDefinition<MutableBubbleState> = {
  kind: 'member-message',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool/call' && event.data.name === 'orchestra_send_message') {
      try {
        const parsed: unknown = JSON.parse(event.data.arguments)
        if (parseSendMessageBubble(parsed) === undefined) return null
      } catch {
        return null
      }
      return { id: String(event.data.callId), role: 'start' }
    }
    if (event.type === 'tool/result' && event.data.message?.source?.kind === 'tool') {
      return { id: String(event.data.message.source.callId), role: 'update' }
    }
    return null
  },
  start: (_context, match): MutableBubbleState => {
    if (match.event.type !== 'tool/call') return emptyState('member-message')
    try {
      const parsed: unknown = JSON.parse(match.event.data.arguments)
      const b = parseSendMessageBubble(parsed)
      if (b === undefined) return emptyState('member-message')
      return { ...b, accepted: false }
    } catch {
      return emptyState('member-message')
    }
  },
  update: (context, match): MutableBubbleState => {
    if (resultFailed(match.event)) return context.state
    return { ...context.state, accepted: true }
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined) return null
    const s = context.state
    if (s === undefined) return null
    if (!s.accepted || s.kind !== 'member-message') return null
    return {
      key: context.key,
      kind: 'member-message',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        kind: 'member-message',
        fromMember: s.fromMember,
        fromRole: s.fromRole,
        fromId: s.fromId,
        toMember: s.toMember,
        text: s.text,
        ts: s.ts,
      },
    }
  },
}

/**
 * Fold each durable `orchestra_update_task` (status completed) tool/call +
 * tool/result pair into one task-done bubble anchored at the tool/call.
 * @module dsh-agent-orchestra/client/bubble
 */
export const taskDoneDefinition: ConversationNodeDefinition<MutableBubbleState> = {
  kind: 'task-done',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool/call' && event.data.name === 'orchestra_update_task') {
      try {
        const parsed: unknown = JSON.parse(event.data.arguments)
        if (parseUpdateTaskBubble(parsed) === undefined) return null
      } catch {
        return null
      }
      return { id: String(event.data.callId), role: 'start' }
    }
    if (event.type === 'tool/result' && event.data.message?.source?.kind === 'tool') {
      return { id: String(event.data.message.source.callId), role: 'update' }
    }
    return null
  },
  start: (_context, match): MutableBubbleState => {
    if (match.event.type !== 'tool/call') return emptyState('task-done')
    try {
      const parsed: unknown = JSON.parse(match.event.data.arguments)
      const b = parseUpdateTaskBubble(parsed)
      if (b === undefined) return emptyState('task-done')
      return { ...b, accepted: false }
    } catch {
      return emptyState('task-done')
    }
  },
  update: (context, match): MutableBubbleState => {
    if (resultFailed(match.event)) return context.state
    return { ...context.state, accepted: true }
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined) return null
    const s = context.state
    if (s === undefined) return null
    if (!s.accepted || s.kind !== 'task-done') return null
    return {
      key: context.key,
      kind: 'task-done',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        kind: 'task-done',
        fromMember: s.fromMember,
        fromRole: '',
        fromId: '',
        taskId: s.taskId,
        taskSubject: s.taskSubject,
        text: s.text,
        ts: s.ts,
      },
    }
  },
}

/**
 * Fold each DSH `user/message` `subagent-settled` event (member direct
 * reply after being woken by the captain, without calling
 * orchestra_send_message) into one member-settled bubble anchored at the
 * event. One-shot notice: no update/result pairing; accept holds directly.
 * @module dsh-agent-orchestra/client/bubble
 */
export const memberSettledDefinition: ConversationNodeDefinition<MutableBubbleState> = {
  kind: 'member-settled',
  target: 'chat',
  match: (event) => {
    if (event.type !== 'user/message') return null
    const source = event.data?.message?.source
    if (source?.kind !== 'subagent-settled') return null
    const sender = String(source.senderSessionId ?? '')
    if (sender === '') return null
    const id = 'member-settled:' + sender + ':' + (event.seq !== undefined ? String(event.seq) : sender)
    return { id, role: 'start' }
  },
  start: (_context, match): MutableBubbleState => {
    if (match.event.type !== 'user/message') return emptyState('member-settled')
    try {
      const b = parseSubagentSettledBubble(match.event.data?.message)
      if (b === undefined) return emptyState('member-settled')
      return {
        kind: 'member-settled',
        fromMember: '',
        fromRole: '',
        fromId: b.fromId,
        toMember: undefined,
        taskId: undefined,
        taskSubject: undefined,
        text: b.text,
        ts: b.ts,
        accepted: true,
      }
    } catch {
      return emptyState('member-settled')
    }
  },
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined) return null
    const s = context.state
    if (s === undefined) return null
    if (!s.accepted || s.kind !== 'member-settled') return null
    if (s.fromId === '' || s.text === '') return null
    return {
      key: context.key,
      kind: 'member-settled',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        kind: 'member-message',
        fromMember: s.fromMember,
        fromRole: '',
        fromId: s.fromId,
        text: s.text,
        ts: s.ts,
      },
    }
  },
}
