import assert from 'node:assert/strict'
import { enrichBubble } from './.bubble-enrich.mjs'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

const teams = [{
  members: [{ id: 'sess-1', name: 'alice', role: 'researcher' }, { id: 'sess-2', name: 'bob', role: 'engineer' }],
  tasks: [{ id: 't1', subject: '调研主题' }, { id: 't2', subject: '实现功能' }],
}]

t('match member role', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'hi', ts: 1 }, teams)
  assert.equal(r.role, 'researcher')
})
t('match member sessionId', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'bob', fromRole: '', fromId: '', text: 'hi', ts: 1 }, teams)
  assert.equal(r.sessionId, 'sess-2')
})
t('match task subject', () => {
  const r = enrichBubble({ kind: 'task-done', fromMember: 'bob', fromRole: '', fromId: '', taskId: 't1', text: 'o', ts: 1 }, teams)
  assert.equal(r.taskSubject, '调研主题')
})
t('undefined data → empty', () => {
  assert.deepStrictEqual(enrichBubble(undefined, teams), { role: '', sessionId: '', taskSubject: '' })
})
t('undefined/malformed teams → empty, no throw', () => {
  assert.deepStrictEqual(enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'x', ts: 1 }, undefined), { role: '', sessionId: '', taskSubject: '' })
  assert.deepStrictEqual(enrichBubble({ kind: 'member-message', fromMember: 'alice', fromRole: '', fromId: '', text: 'x', ts: 1 }, [null, { members: 'bad' }]), { role: '', sessionId: '', taskSubject: '' })
})
t('no match → empty fields', () => {
  const r = enrichBubble({ kind: 'member-message', fromMember: 'carol', fromRole: '', fromId: '', text: 'x', ts: 1 }, teams)
  assert.deepStrictEqual(r, { role: '', sessionId: '', taskSubject: '' })
})
t('task-done no matching task → empty subject', () => {
  const r = enrichBubble({ kind: 'task-done', fromMember: 'bob', fromRole: '', fromId: '', taskId: 'nope', text: 'o', ts: 1 }, teams)
  assert.equal(r.taskSubject, '')
})

t('task-done from captain matches captainSessionId', () => {
  const teamsC = [{ captainSessionId: 'cap-1', members: [], tasks: [{ id: 't1', subject: 'x' }] }]
  const r = enrichBubble({ kind: 'task-done', fromMember: 'captain', fromRole: '', fromId: '', taskId: 't1', text: 'o', ts: 1 }, teamsC)
  assert.equal(r.sessionId, 'cap-1')
})
t('captain but no captainSessionId → empty sessionId', () => {
  const r = enrichBubble({ kind: 'task-done', fromMember: 'captain', fromRole: '', fromId: '', taskId: 't1', text: 'o', ts: 1 }, [{ members: [] }])
  assert.equal(r.sessionId, '')
})

console.log('\nbubble-enrich: ' + passed + ' passed')
