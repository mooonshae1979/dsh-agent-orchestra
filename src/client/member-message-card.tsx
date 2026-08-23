/** Member message rendered as a channel-conversation card in the chat flow.
 *
 * Registered into DSH's keyed `tool.call.toolview` slot for the
 * `orchestra_send_message` wire tool, so every time a team member sends a
 * message to the captain the card appears inline in the conversation (no
 * folding). Mirrors the openhanako AgentOriginMessage visual: avatar + name
 * head and a pre-wrap body with long-text collapse.
 * @module dsh-agent-orchestra/client/member-message-card
 */

import { useState } from 'react'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { BubbleErrorBoundary } from './bubble-error-boundary.tsx'
import { collapseText } from './bubble-pure.ts'
import { memberArtUrl } from './artwork.ts'
import css from './member-message-card.module.css'

/** Long-text fold thresholds (lines or characters). */
const MAX_LINES = 12
const MAX_CHARS = 900

/** Parse a raw JSON string into a flat record; defensive, never throws. */
function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {}
  try {
    const value: unknown = JSON.parse(raw)
    return (typeof value === 'object' && value !== null && !Array.isArray(value))
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function safeStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Count display lines of a pre-wrap text (crude but stable for folding). */
function lineCount(text: string): number {
  if (text === '') return 0
  // Estimate a wrapped line as ~56 CJK chars (rough, good enough for folding).
  const hardLines = text.split('\n').length
  const softLines = Math.max(1, Math.ceil(text.length / 56))
  return Math.max(hardLines, softLines)
}

/** Unwrapped card body; isolated by {@link BubbleErrorBoundary} in the export. */
function MemberMessageCardInner({ block }: { block: ToolCallOwnerProps['block'] }) {
  const [expanded, setExpanded] = useState(false)
  const raw = 'kind' in block ? (block as { call?: { argsRaw?: string } }).call?.argsRaw : (block as { argsRaw?: string }).argsRaw
  const args = parseArgs(raw)
  const from = safeStr(args.from).trim()
  const content = safeStr(args.content).trim()
  const displayName = from !== '' ? from : '成员'
  const art = memberArtUrl(from, '')
  const text = content
  const truncated = text.length > MAX_CHARS || lineCount(text) > MAX_LINES
  const excerpt = collapseText(text, MAX_CHARS).excerpt
  const body = (truncated && !expanded) ? excerpt : (text !== '' ? text : '（消息无正文）')
  const collapsed = truncated && !expanded
  return (
    <div className={css.memberMsgCard} data-member-msg>
      <div className={css.memberMsgHeader}>
        {art !== null ? (
          <img className={css.memberMsgAvatar} src={art} alt="" aria-hidden />
        ) : (
          <span className={css.memberMsgAvatar}>{displayName.trim().slice(0, 1).toUpperCase() || '?'}</span>
        )}
        <span className={css.memberMsgName}>fromAgent: {displayName}</span>
      </div>
      <div className={collapsed ? `${css.memberMsgBody} ${css.memberMsgBodyCollapsed}` : css.memberMsgBody} data-member-msg-body>
        {body}
      </div>
      {truncated && (
        <button type="button" className={css.memberMsgToggle} onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}

/** Member message conversation card, protected against any render failure. */
export function MemberMessageCard(props: ToolCallOwnerProps) {
  return (
    <BubbleErrorBoundary>
      <MemberMessageCardInner block={props.block} />
    </BubbleErrorBoundary>
  )
}
