import assert from 'node:assert/strict'
import { getWorkflow, getRole } from '../lib/workflow.js'
import { assembleMembers, decideNext, isMembersDirect } from '../lib/orchestrator.js'
import { buildPersona } from '../lib/persona-builder.js'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

t('research workflow: assemble produces members that relay hint can resolve by roleId', () => {
  const w = getWorkflow('research')
  const members = assembleMembers(w, {}, 'teamA')
  const first = w.steps[0]
  const candidate = members.find(m => m.name === first.assigneeHint || m.roleId === first.assigneeHint)
  assert.ok(candidate, 'relay hint should resolve to an assembled member')
})
t('write workflow: novelist member has novelist roleId + persona + tools on role', () => {
  const w = getWorkflow('write')
  const members = assembleMembers(w, {}, 'writing-team')
  const novelist = members.find(m => m.roleId === 'novelist')
  assert.ok(novelist)
  assert.ok(novelist.persona.includes('AI novelist'))
  assert.deepStrictEqual(getRole('novelist').tools ?? [], ['novel_read', 'novel_apply_change'])
})
t('dev workflow relay: reviewer step is membersDirect', () => {
  const w = getWorkflow('dev')
  const d = decideNext(w, 'engineer')
  assert.equal(d.nextStep?.stepId, 'reviewer')
  assert.equal(isMembersDirect(w, 'reviewer'), true)
})
t('persona-builder roundtrip: buildPersona of assembled novelist uses model override', () => {
  const m = assembleMembers(getWorkflow('write'), { novelist: { model: 'trae-solo/Doubao-Seed-2.1-Turbo' } }, 'writing')
  const novelist = m.find(x => x.roleId === 'novelist')
  const p = buildPersona({ role: getRole('novelist'), member: novelist, teamName: 'writing' })
  assert.ok(p.includes('trae-solo/Doubao-Seed-2.1-Turbo'))
})

console.log('\nb2-complete: ' + passed + ' passed')
