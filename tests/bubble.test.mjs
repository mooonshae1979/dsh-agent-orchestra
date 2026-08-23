import assert from 'node:assert/strict'
import { parseSendMessageBubble, parseUpdateTaskBubble, collapseText } from './.bubble-pure.mjs'

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

console.log('\nbubble: ' + passed + ' passed')
