/**
 * One member's reply bubble, rendered inside the team card from the host
 * snapshot's `captainInbox` — the messages members sent to the captain.
 *
 * Defensive by design: never throws on missing/malformed `msg`/`content`, and
 * falls back to the raw sender name when no roster member matches. Each bubble
 * is wrapped in {@link BubbleErrorBoundary} so a single bad row can never
 * crash the conversation card.
 * @module dsh-agent-orchestra/client/member-reply-bubble
 */

import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { collapseText } from './bubble-pure.ts'
import { memberArtUrl } from './artwork.ts'
import { BubbleErrorBoundary } from './bubble-error-boundary.tsx'
import css from './AgentOrchestraCard.module.css'

/** One member row the card knows about (subset of the roster). */
export interface MemberReplyMember {
  readonly id: string
  readonly name: string
  readonly role: string
}

/** A single captain-inbox entry. */
export interface MemberReplyMsg {
  readonly from: string
  readonly content: string
}

export interface MemberReplyBubbleProps {
  readonly msg: MemberReplyMsg
  readonly members: readonly MemberReplyMember[]
  readonly openSession: (id: SessionId) => void
}

function safeStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Unwrapped bubble body; keeps the error boundary wrapper reusable. */
function MemberReplyBubbleInner({ msg, members, openSession }: MemberReplyBubbleProps) {
  const [expanded, setExpanded] = useState(false)
  const from = safeStr(msg?.from)
  const content = safeStr(msg?.content)
  const matched = Array.isArray(members)
    ? members.find((member) => member !== null && typeof member === 'object'
        && safeStr(member.name) !== '' && safeStr(member.name) === from)
    : undefined
  const name = (matched !== undefined && safeStr(matched.name) !== '')
    ? safeStr(matched.name)
    : (from !== '' ? from : '未知成员')
  const role = matched !== undefined ? safeStr(matched.role) : ''
  const id = matched !== undefined ? safeStr(matched.id) : ''
  const text = content.trim()
  const { excerpt, truncated } = collapseText(text)
  const body = (truncated && !expanded) ? excerpt : (text !== '' ? text : '（无正文）')
  const canNavigate = id !== '' && typeof openSession === 'function'
  const rootProps = {
    className: css.reply,
    'data-member-reply': '',
    ...(canNavigate
      ? { onClick: () => openSession(id as SessionId), 'data-navigable': '', title: `打开 ${name} 的对话` }
      : {}),
  }
  return (
    <div {...rootProps}>
      <div className={css.replyHead}>
        {memberArtUrl(name, role) !== null ? (
          <img className={css.replyAvatar} src={memberArtUrl(name, role) ?? ''} alt="" aria-hidden />
        ) : (
          <span className={css.replyInitial}>{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
        )}
        <span className={css.replyName}>{name}</span>
        {role !== '' && <span className={css.replyRole}>{role}</span>}
      </div>
      <div className={css.replyBody} data-reply-text>{body}</div>
      {truncated && (
        <button type="button" className={css.replyToggle} onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}

/** Member reply bubble isolated by an error boundary. */
export function MemberReplyBubble(props: MemberReplyBubbleProps) {
  return (
    <BubbleErrorBoundary>
      <MemberReplyBubbleInner {...props} />
    </BubbleErrorBoundary>
  )
}
