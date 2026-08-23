import assert from 'node:assert/strict'
import { getWorkflow } from '../lib/workflow.js'
import { getRole } from '../lib/workflow.js'
import { buildPersona } from '../lib/persona-builder.js'
import { assembleMembers, decideNext, isMembersDirect, defaultMemberName } from '../lib/orchestrator.js'

let passed = 0
function t(name, fn) { try { fn(); passed++; console.log('  PASS ' + name) } catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 } }

t('assemble a research workflow -> researcher + reviewer', () => {
  const m = assembleMembers(getWorkflow('research'))
  assert.deepStrictEqual(m.map(x => x.roleId).sort(), ['researcher', 'reviewer'])
})
t('assemble with rename override (engineer -> xiao-li)', () => {
  const m = assembleMembers(getWorkflow('dev'), { engineer: { name: 'xiao-li' } })
  assert.ok(m.some(x => x.name === 'xiao-li'))
})
t('assemble dedupes repeated assigneeHint', () => {
  const m = assembleMembers({ id: 'x', name: 'x', steps: [{ stepId: 'a', goal: 'a', outputType: 'text', assigneeHint: 'researcher' }, { stepId: 'b', goal: 'b', outputType: 'text', assigneeHint: 'researcher' }] })
  assert.equal(m.filter(x => x.roleId === 'researcher').length, 1)
})
t('decideNext follows the next pointer', () => {
  const d = decideNext(getWorkflow('research'), 'researcher')
  assert.equal(d.nextStep?.stepId, 'reviewer')
  assert.equal(d.done, false)
})
t('decideNext terminal step is done', () => {
  const d = decideNext(getWorkflow('research'), 'reviewer')
  assert.equal(d.done, true)
})
t('isMembersDirect true on dev reviewer', () => {
  assert.equal(isMembersDirect(getWorkflow('dev'), 'reviewer'), true)
})
t('defaultMemberName dedupes', () => {
  assert.equal(defaultMemberName('engineer', 0), 'engineer')
  assert.equal(defaultMemberName('engineer', 1), 'engineer-2')
})

// assemble 用 getRole 取模板默认（novelist 的 persona 非空 → assemble 出的成员应带 roleId 且可被 persona-builder 用）
t('assemble members carry roleId so persona-template is usable', () => {
  const m = assembleMembers(getWorkflow('write'))
  const novelist = m.find(x => x.roleId === 'novelist')
  assert.ok(novelist)
  const persona = buildPersona({ role: getRole('novelist'), member: novelist, teamName: 't' })
  assert.ok(persona.includes('You are an AI novelist'))
})
t('decideNext unknown step is done', () => {
  const d = decideNext(getWorkflow('research'), 'ghost')
  assert.equal(d.done, true)
})
t('isMembersDirect false on non-direct step', () => {
  assert.equal(isMembersDirect(getWorkflow('research'), 'researcher'), false)
})

console.log('\norchestrator: ' + passed + ' passed')
