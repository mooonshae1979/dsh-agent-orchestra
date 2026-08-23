import { useState } from 'react'
import type { AgentOrchestraBubbleData } from './agent-orchestra-bubble-definition.ts'
import { collapseText } from './bubble-pure.ts'
import css from './AgentOrchestraBubble.module.css'

export interface BubbleProps { data: AgentOrchestraBubbleData }

/** One member's interaction bubble. Defensive: never throws on bad data. */
export function AgentOrchestraBubble({ data }: BubbleProps) {
  const [expanded, setExpanded] = useState(false)
  const member = data?.fromMember ? data.fromMember : '未知成员'
  const role = data?.fromRole ? (' · ' + data.fromRole) : ''
  const text = (data?.text ?? '').trim()
  const { excerpt, truncated } = collapseText(text)
  const body = (truncated && !expanded) ? excerpt : (text || '（无正文）')
  const time = data?.ts ? new Date(data.ts).toLocaleTimeString() : ''
  const meta = data?.kind === 'member-message'
    ? ('→ ' + (data.toMember || 'captain'))
    : (data?.kind === 'task-done' ? ('完成任务 ' + (data.taskId || '') + (data.taskSubject ? ': ' + data.taskSubject : '')) : '')
  return (
    <div className={css.root} data-bubble-kind={data?.kind ?? ''} data-bubble-from={data?.fromMember ?? ''}>
      <div className={css.head}>
        <span className={css.avatar}>{member.trim().slice(0, 1).toUpperCase() || '?'}</span>
        <span className={css.name}>{member}</span>
        <span className={css.role}>{role}</span>
        <span className={css.time}>{time}</span>
      </div>
      <div className={css.meta}>{meta}</div>
      <div className={css.body} data-bubble-text>{body}</div>
      {truncated && (
        <button type="button" className={css.toggle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : '展开全文'}
        </button>
      )}
    </div>
  )
}
