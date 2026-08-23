import assert from 'node:assert/strict'
import { parseSendMessageBubble, parseUpdateTaskBubble, parseSubagentSettledBubble, collapseText } from './.bubble-pure.mjs'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

t('parse send_message bubble', () => {
  const b = parseSendMessageBubble({ to: 'alice', content: 'hello', from: 'bob' })
  assert.equal(b?.kind, 'member-message')
  assert.equal(b?.fromMember, 'bob')
  assert.equal(b?.toMember, 'alice')
  assert.equal(b?.text, 'hello')
})
t('send_message missing from falls back to captain', () => {
  const b = parseSendMessageBubble({ to: 'alice', content: 'hi' })
  assert.equal(b?.fromMember, 'captain')
})
t('update_task non-completed yields undefined', () => {
  assert.equal(parseUpdateTaskBubble({ task_id: 't1', status: 'in_progress' }), undefined)
})
t('update_task completed bubble', () => {
  const b = parseUpdateTaskBubble({ task_id: 't1', status: 'completed', output: 'done the thing' })
  assert.equal(b?.kind, 'task-done')
  assert.equal(b?.taskId, 't1')
  assert.equal(b?.text, 'done the thing')
})
t('collapseText short stays', () => {
  assert.deepStrictEqual(collapseText('short'), { excerpt: 'short', truncated: false })
})
t('collapseText long truncates with ellipsis', () => {
  const long = 'x'.repeat(300)
  const r = collapseText(long)
  assert.equal(r.truncated, true)
  assert.ok(r.excerpt.endsWith('…'))
  assert.ok(r.excerpt.length <= 201)
})
t('parse send_message invalid args returns undefined', () => {
  assert.equal(parseSendMessageBubble(null), undefined)
  assert.equal(parseSendMessageBubble('not-json'), undefined)
  assert.equal(parseSendMessageBubble({}), undefined)
})
t('parse update_task invalid args returns undefined', () => {
  assert.equal(parseUpdateTaskBubble(null), undefined)
  assert.equal(parseUpdateTaskBubble('not-json'), undefined)
  assert.equal(parseUpdateTaskBubble({ task_id: 't1' }), undefined)
})
t('collapseText tolerates empty string', () => {
  assert.deepStrictEqual(collapseText(''), { excerpt: '', truncated: false })
})
t('parse subagent-settled with closing message', () => {
  const b = parseSubagentSettledBubble({
    source: { kind: 'subagent-settled', senderSessionId: 'child-1', summary: 'summary text' },
    content: [
      { type: 'text', text: 'summary text' },
      { type: 'text', text: 'Its closing message:' },
      { type: 'text', text: 'direct reply one' },
      { type: 'text', text: 'direct reply two' },
    ],
  })
  assert.equal(b?.fromId, 'child-1')
  assert.equal(b?.text, 'direct reply one\ndirect reply two')
})
t('parse subagent-settled no closing falls back to summary', () => {
  const b = parseSubagentSettledBubble({
    source: { kind: 'subagent-settled', senderSessionId: 'child-2', summary: 'the summary' },
    content: [
      { type: 'text', text: 'the summary' },
      { type: 'text', text: 'It left no closing message.' },
    ],
  })
  assert.equal(b?.fromId, 'child-2')
  assert.equal(b?.text, 'the summary')
})
t('parse subagent-settled malformed returns undefined', () => {
  assert.equal(parseSubagentSettledBubble(null), undefined)
  assert.equal(parseSubagentSettledBubble({ source: { kind: 'other' } }), undefined)
  assert.equal(parseSubagentSettledBubble({ source: { kind: 'subagent-settled', senderSessionId: '' }, content: [] }), undefined)
})

console.log('\nbubble: ' + passed + ' passed')
