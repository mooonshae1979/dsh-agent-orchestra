import assert from 'node:assert/strict'
import { DEFAULT_WORKFLOWS, getWorkflow, getRole, findStep, validateWorkflow } from '../lib/workflow.js'

let passed = 0
function t(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name) }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1 }
}

t('4 default workflows exist', () => {
  assert.deepStrictEqual(DEFAULT_WORKFLOWS.map(w => w.id).sort(), ['dev', 'implement', 'research', 'write'])
})
t('research workflow has 2 steps with next chain', () => {
  const w = getWorkflow('research')
  assert.ok(w)
  assert.equal(w.steps.length, 2)
  assert.equal(w.steps[0].next, 'reviewer')
  assert.equal(w.steps[1].next, undefined)
})
t('dev reviewer step is membersDirect', () => {
  assert.equal(getWorkflow('dev').steps[1].membersDirect, true)
})
t('write workflow includes novelist', () => {
  assert.equal(getWorkflow('write').steps[0].assigneeHint, 'novelist')
})
t('roles include novelist', () => {
  assert.ok(getRole('novelist'))
})
t('findStep works across subflow', () => {
  const w = { id: 'parent', name: 'p', steps: [{ stepId: 'a', goal: 'a', outputType: 'text', subflow: { id: 'sub', name: 's', steps: [{ stepId: 'deep', goal: 'd', outputType: 'text' }] } }] }
  assert.equal(findStep(w, 'deep')?.stepId, 'deep')
})
t('validateWorkflow catches bad next', () => {
  const w = { id: 'bad', name: 'b', steps: [{ stepId: 'a', goal: 'a', outputType: 'text', next: 'nope' }] }
  assert.ok(validateWorkflow(w).length > 0)
})
t('validateWorkflow accepts valid', () => {
  assert.deepStrictEqual(validateWorkflow(getWorkflow('research')), [])
})

t('every workflow assigneeHint maps to a known role', () => {
  for (const w of DEFAULT_WORKFLOWS) {
    for (const step of w.steps) {
      if (step.assigneeHint !== undefined) {
        assert.ok(getRole(step.assigneeHint), 'missing role for assigneeHint ' + step.assigneeHint)
      }
    }
  }
})

t('validateWorkflow requires steps array', () => {
  assert.ok(validateWorkflow({ id: 'x', name: 'x', steps: undefined }).length > 0)
})
t('validateWorkflow rejects missing goal', () => {
  const w = { id: 'x', name: 'x', steps: [{ stepId: 'a', outputType: 'text' }] }
  assert.ok(validateWorkflow(w).length > 0)
})
t('validateWorkflow rejects invalid outputType', () => {
  const w = { id: 'x', name: 'x', steps: [{ stepId: 'a', goal: 'g', outputType: 'bogus' }] }
  assert.ok(validateWorkflow(w).length > 0)
})
t('novelist role has novel tools whitelist', () => {
  assert.deepStrictEqual(getRole('novelist').tools, ['novel_read', 'novel_apply_change'])
})
t('validateWorkflow does not throw on malformed step entries', () => {
  assert.deepStrictEqual(validateWorkflow({ id: 'x', name: 'x', steps: [undefined] }).length > 0, true)
})
t('validateWorkflow does not throw on null step entries', () => {
  assert.ok(validateWorkflow({ id: 'x', name: 'x', steps: [null] }).length > 0)
})

console.log('\nworkflow: ' + passed + ' passed')

