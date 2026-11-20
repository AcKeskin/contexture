import { expect, test } from 'claude-code/testing'

import {
  commandOf,
  executeCommand,
  matchProgress,
  parseIndex,
  planSteps,
  resolveSlug,
  specPin,
  statusText,
  stepMarks,
  useCaseCoverage,
  useCases,
} from '../hooks/chain'

const SPEC_DONE = '---\nstatus: active\ndone_criteria:\n  - login works\n---\n# Auth\n'
const PLAN = (pin: string) =>
  `---\nspec: ${pin}\n---\n## Step 1: Add token store\n- Verification: tests pass\n## Step 2: Wire login route\n`

test('parseIndex reads slug, version and status', () => {
  const rows = parseIndex('| Slug | Current | Status |\n|---|---|---|\n| auth | v2 | active |\n| old | v1 | abandoned |')
  expect(rows.get('auth')).toEqual({ version: 2, status: 'active' })
  expect(rows.get('old')?.status).toBe('abandoned')
  expect(rows.has('Slug')).toBe(false)
})

test('specPin reads a path, a bare version and none', () => {
  expect(specPin(PLAN('../../specs/auth/v2.md'))).toBe(2)
  expect(specPin(PLAN('v3'))).toBe(3)
  expect(specPin(PLAN('none'))).toBe('none')
  expect(specPin(PLAN('none — task description in Context'))).toBe('none')
  expect(specPin('# no frontmatter')).toBeUndefined()
})

test('a plan pinned to an older spec is stale and next is /draft-plan', () => {
  const s = resolveSlug('auth', {
    hasVision: false,
    hasBlueprint: false,
    spec: { version: 2, text: SPEC_DONE },
    plan: { version: 1, text: PLAN('../../specs/auth/v1.md') },
  })
  const plan = s.stages.find(st => st.name === 'plan')
  expect(plan?.status).toBe('stale')
  expect(plan?.detail).toBe('pins spec v1, active spec is v2')
  expect(s.next).toBe('/draft-plan auth (stale)')
})

test('a draft spec sends you back to /spec', () => {
  const s = resolveSlug('billing', {
    hasVision: true,
    hasBlueprint: false,
    spec: { version: 1, text: '---\nstatus: draft\n---\n' },
  })
  expect(s.stages.map(st => st.status)).toEqual(['present', 'present', 'missing', 'missing', 'unknown'])
  expect(s.next).toBe('/spec billing (v1 draft)')
})

test('no spec blocks the plan unless the plan is a task plan', () => {
  const blocked = resolveSlug('x', { hasVision: false, hasBlueprint: false })
  expect(blocked.stages[2]?.status).toBe('blocked')
  expect(blocked.next).toBe('/spec x')
  const task = resolveSlug('x', { hasVision: false, hasBlueprint: false, plan: { version: 1, text: PLAN('none') } })
  expect(task.stages[2]?.detail).toBe('v1, task plan')
  expect(task.next).toBe('/execute x')
})

test('a legacy spec with no done criteria still lets the plan run', () => {
  const s = resolveSlug('x', {
    hasVision: false,
    hasBlueprint: false,
    spec: { version: 1, text: '---\nstatus: active\n---\n' },
    plan: { version: 1, text: PLAN('v1') },
  })
  expect(s.next).toBe('/execute x')
})

test('the single-plan fallback needs a step with that number', () => {
  const slugs = [{ slug: 'auth', steps: planSteps(PLAN('v1')) }]
  expect(matchProgress('✓ Step 2 complete: reworded goal. Verified', slugs)?.step).toBe(2)
  expect(matchProgress('✓ Step 9 complete: other work. Verified', slugs)).toBeUndefined()
})

test('step lines go to the slug whose plan has that goal', () => {
  const slugs = [
    { slug: 'auth', steps: planSteps(PLAN('v1')) },
    { slug: 'billing', steps: [{ n: 1, goal: 'Add invoice table' }] },
  ]
  const p = matchProgress('✓ Step 2 complete: Wire login route. Verified by tests.', slugs)
  expect(p).toEqual({ slug: 'auth', step: 2, total: 2, isComplete: false })
  expect(matchProgress('unrelated text', slugs, p)).toBe(p)
})

test('plan complete counts only after the last step line', () => {
  const slugs = [{ slug: 'auth', steps: planSteps(PLAN('v1')) }]
  const old = 'Plan complete. 2 steps done\n✓ Step 1 complete: Add token store. Verified by tests.'
  expect(matchProgress(old, slugs)?.isComplete).toBe(false)
  const now = '✓ Step 2 complete: Wire login route. Verified by tests.\nPlan complete. 2 steps done'
  expect(matchProgress(now, slugs)?.isComplete).toBe(true)
})

test('statusText prefers the running step, then the one slug, then a count', () => {
  const one = resolveSlug('auth', { hasVision: false, hasBlueprint: false })
  expect(statusText({ slugs: [one], scopes: [] })).toBe('auth next /spec')
  expect(statusText({ slugs: [one, one], scopes: ['universal'] })).toBe('2 slugs · rules universal')
  const progress = { slug: 'auth', step: 3, total: 7, isComplete: false }
  expect(statusText({ slugs: [one], progress, scopes: [] })).toBe('auth step 3/7')
  expect(statusText({ slugs: [], scopes: [] })).toBeUndefined()
})

test('steps read done, next and to do from the run seen', () => {
  const s = { slug: 'auth', stages: [], next: '/execute auth', steps: [{ n: 1, goal: 'a' }, { n: 2, goal: 'b' }, { n: 3, goal: 'c' }] }
  expect(stepMarks(s).map(st => st.mark)).toEqual(['next', 'todo', 'todo'])
  expect(stepMarks(s, { slug: 'auth', step: 1, total: 3, isComplete: false }).map(st => st.mark)).toEqual(['done', 'next', 'todo'])
  expect(stepMarks(s, { slug: 'other', step: 2, total: 3, isComplete: false }).map(st => st.mark)).toEqual(['next', 'todo', 'todo'])
  expect(stepMarks(s, { slug: 'auth', step: 3, total: 3, isComplete: true }).map(st => st.mark)).toEqual(['done', 'done', 'done'])
})

test('execute commands carry the start step and a chosen strategy', () => {
  expect(executeCommand('auth')).toBe('/execute auth')
  expect(executeCommand('auth', 1)).toBe('/execute auth')
  expect(executeCommand('auth', 3, 'multi-agent')).toBe('/execute auth --from 3 --strategy multi-agent')
  expect(commandOf('/draft-plan auth (stale)')).toBe('/draft-plan auth')
  expect(commandOf('/execute auth')).toBe('/execute auth')
})

// A spec and plan in the use-case format (skills/spec/use-cases.md).
const UC_SPEC = `---
status: active
done_criteria:
  - "UC1: signing in shows the dashboard"
  - "UC2: a reset link arrives"
---
# Spec

## Use cases

### UC1: Sign in with email
- **Actor:** user
- **Goal:** get in

### UC2: Reset a forgotten password
- **Actor:** user

## Technical approach
not addressed during interview
`
const UC_PLAN = `---
spec: ../../specs/auth/v1.md
---
## Done criteria
1. UC1: signing in shows the dashboard

## Use cases

### UC1: Sign in with email
- **Actor:** user

### UC2: Reset a forgotten password

### UC3: Sign out

## Step 1: Add token store
- Files: src/store.ts
- Serves criteria: [1] · use cases: [UC1, UC2]

## Step 2: Wire login route
- Use cases: [UC1]

## Notes
- use cases: [UC9]
`

test('use cases come from the plan, else the spec; steps carry their IDs', () => {
  const steps = planSteps(UC_PLAN)
  expect(steps).toEqual([
    { n: 1, goal: 'Add token store', useCases: ['UC1', 'UC2'] },
    { n: 2, goal: 'Wire login route', useCases: ['UC1'] },
  ])
  expect(useCases(UC_SPEC)).toEqual([
    { id: 'UC1', goal: 'Sign in with email' },
    { id: 'UC2', goal: 'Reset a forgotten password' },
  ])
  const s = resolveSlug('auth', {
    hasVision: false,
    hasBlueprint: false,
    spec: { version: 1, text: UC_SPEC },
    plan: { version: 1, text: UC_PLAN },
  })
  expect(s.next).toBe('/execute auth')
  expect(s.stages.find(st => st.name === 'spec')?.status).toBe('done')
  expect(useCaseCoverage(s)).toEqual({
    isTracked: true,
    rows: [
      { id: 'UC1', goal: 'Sign in with email', steps: [1, 2] },
      { id: 'UC2', goal: 'Reset a forgotten password', steps: [1] },
      { id: 'UC3', goal: 'Sign out', steps: [] },
    ],
  })
  const specOnly = resolveSlug('auth', { hasVision: false, hasBlueprint: false, spec: { version: 1, text: UC_SPEC } })
  expect(specOnly.useCases).toHaveLength(2)
})

test('an untagged plan tracks no coverage; none and no section read as such', () => {
  const s = resolveSlug('auth', {
    hasVision: false,
    hasBlueprint: false,
    spec: { version: 1, text: UC_SPEC },
    plan: { version: 1, text: PLAN('v1') },
  })
  expect(s.steps.every(st => st.useCases === undefined)).toBe(true)
  expect(useCaseCoverage(s).isTracked).toBe(false)
  expect(useCases('# x\n\n## Use cases\nnone — internal change\n\n## Goals\n')).toBe('none')
  expect(useCases(SPEC_DONE)).toBeUndefined()
  expect(useCases('## Use cases\r\n\r\n### UC1: CRLF goal\r\n')).toEqual([{ id: 'UC1', goal: 'CRLF goal' }])
})
