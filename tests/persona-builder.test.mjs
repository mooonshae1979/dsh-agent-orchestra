import assert from 'node:assert/strict'
import { buildPersona } from '../lib/persona-builder.js'
import { getRole } from '../lib/workflow.js'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

t('uses explicit persona verbatim', () => {
  const p = buildPersona({ member: { name: 'x', persona: 'CUSTOM', role: 'r' }, teamName: 't' })
  assert.equal(p, 'CUSTOM')
})
t('synthesizes from role template + runtime', () => {
  const p = buildPersona({ role: getRole('novelist'), member: { name: 'xiaowen', role: 'novelist', model: 'trae-solo/Doubao-Seed-2.1-Turbo' }, teamName: 'writing' })
  assert.ok(p.includes('xiaowen'))
  assert.ok(p.includes('model: trae-solo/Doubao-Seed-2.1-Turbo'))
  assert.ok(p.includes('You are an AI novelist'))
})
t('defaults mode to standard', () => {
  const p = buildPersona({ role: getRole('reviewer'), member: { name: 'a', role: 'reviewer' }, teamName: 't' })
  assert.ok(p.includes('mode: standard'))
})

console.log('\npersona-builder: ' + passed + ' passed')
