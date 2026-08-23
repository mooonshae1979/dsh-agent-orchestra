/** AgentOrchestra conversation bubble node data (pure, no DSH/react deps). */
export interface AgentOrchestraBubbleData {
  readonly kind: 'member-message' | 'task-done'
  readonly fromMember: string
  readonly fromRole: string
  readonly fromId: string
  readonly toMember?: string
  readonly taskId?: string
  readonly taskSubject?: string
  readonly text: string
  readonly ts: number
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Parse orchestra_send_message tool/call args → bubble data (pure). */
export function parseSendMessageBubble(args: unknown, fromFallback = 'captain', ts = Date.now()): AgentOrchestraBubbleData | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const a = args as Record<string, unknown>
  const to = str(a.to)
  const content = str(a.content)
  if (to === '' && content === '') return undefined
  const from = str(a.from) || fromFallback
  return {
    kind: 'member-message',
    fromMember: from,
    fromRole: '',
    fromId: '',
    toMember: to === '' ? undefined : to,
    text: content,
    ts,
  }
}

/** Parse orchestra_update_task (status completed) args → bubble data (pure). */
export function parseUpdateTaskBubble(args: unknown, fromFallback = 'captain', ts = Date.now()): AgentOrchestraBubbleData | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const a = args as Record<string, unknown>
  if (str(a.status) !== 'completed') return undefined
  const taskId = str(a.task_id)
  const output = str(a.output)
  if (taskId === '' && output === '') return undefined
  return {
    kind: 'task-done',
    fromMember: fromFallback,
    fromRole: '',
    fromId: '',
    taskId: taskId === '' ? undefined : taskId,
    taskSubject: '',
    text: output,
    ts,
  }
}

/** Default excerpt length for collapsed bubble text. */
export const BUBBLE_EXCERPT_LEN = 200

/** Collapse long text to excerpt + whether truncated (pure). */
export function collapseText(text: string, max = BUBBLE_EXCERPT_LEN): { excerpt: string; truncated: boolean } {
  if (text.length <= max) return { excerpt: text, truncated: false }
  return { excerpt: text.slice(0, max) + '…', truncated: true }
}
