import assert from 'node:assert/strict'
import { getWorkflow } from '../lib/workflow.js'
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

console.log('\norchestrator: ' + passed + ' passed')
