import { useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentOrchestraBubbleData } from './agent-orchestra-bubble-definition.ts'
import { collapseText } from './bubble-pure.ts'
import { enrichBubble, type EnrichTeam } from './bubble-enrich.ts'
import { loadTeams } from './bubble-teams.ts'
import css from './AgentOrchestraBubble.module.css'

export interface BubbleProps { data: AgentOrchestraBubbleData; openSession?: (id: SessionId) => void }

/** One member's interaction bubble. Defensive: never throws on bad data. */
export function AgentOrchestraBubble({ data, openSession }: BubbleProps) {
  const [expanded, setExpanded] = useState(false)
  const [teams, setTeams] = useState<readonly EnrichTeam[]>([])
  useEffect(() => {
    let cancelled = false
    void loadTeams().then((t) => {
      if (!cancelled) setTeams(t)
    })
    return () => { cancelled = true }
  }, [])
  const enr = enrichBubble(data, teams)
  const member = data?.fromMember ? data.fromMember : '未知成员'
  const roleText = (data?.fromRole || enr.role) ? (' · ' + (data.fromRole || enr.role)) : ''
  const text = (data?.text ?? '').trim()
  const { excerpt, truncated } = collapseText(text)
  const body = (truncated && !expanded) ? excerpt : (text || '（无正文）')
  const safeTs = data?.ts !== undefined && data?.ts !== null && Number.isFinite(data.ts) ? data.ts : 0
  const time = safeTs ? new Date(safeTs).toLocaleTimeString() : ''
  const subject = data?.kind === 'task-done' ? (enr.taskSubject || data.taskSubject || '') : ''
  const meta = data?.kind === 'member-message'
    ? ('→ ' + (data.toMember || 'captain'))
    : (data?.kind === 'task-done' ? ('完成任务 ' + (data.taskId || '') + (subject ? ': ' + subject : '')) : '')
  const canNavigate = Boolean(enr.sessionId) && typeof openSession === 'function'
  const rootProps = {
    className: css.root,
    'data-bubble-kind': data?.kind ?? '',
    'data-bubble-from': data?.fromMember ?? '',
    ...(canNavigate
      ? { onClick: () => openSession(enr.sessionId as SessionId), 'data-navigable': '', title: ('打开 ' + member + ' 的对话') }
      : {}),
  }
  return (
    <div {...rootProps}>
      <div className={css.head}>
        <span className={css.avatar}>{member.trim().slice(0, 1).toUpperCase() || '?'}</span>
        <span className={css.name}>{member}</span>
        <span className={css.role}>{roleText}</span>
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
