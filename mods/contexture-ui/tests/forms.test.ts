import { expect, test } from 'claude-code/testing'

import { formCommand, parseBoard, parseContract } from '../hooks/forms'

test('each form writes its command; a needed field left empty writes nothing', () => {
  expect(formCommand('orchestrate', { goal: 'Ship SSE retry' })).toBe('/orchestrate Ship SSE retry')
  expect(formCommand('orchestrate', { goal: 'Ship it', units: 'server: server/\n- client: web/', placement: 'worktree' })).toBe(
    '/orchestrate Ship it\nUnits (name: folder):\n- server: server/\n- client: web/\nGive each unit its own worktree.',
  )
  expect(formCommand('orchestrate', {})).toBeUndefined()
  expect(formCommand('dispatch', { tasks: 'a\n\nb' })).toBe('/dispatch\n- a\n- b')
  expect(formCommand('execute', { slug: 'auth', from: '3', strategy: 'subtask' })).toBe('/execute auth --from 3 --strategy subtask')
  expect(formCommand('execute', { slug: 'auth', from: 'x' })).toBe('/execute auth')
  expect(formCommand('checkpoint', { scope: 'module' })).toBe('/checkpoint --scope module')
  expect(formCommand('capture', { text: 'retries need jitter' })).toBe('/capture retries need jitter')
  expect(formCommand('capture', { kind: 'warning', text: 'x broke y' })).toBe('/capture warning: x broke y')
  expect(formCommand('dispatch', { tasks: 'a; b' })).toBe('/dispatch\n- a\n- b')
  expect(formCommand('autonomy', { effort: 'thorough', stopping: 'keep', ask: 'forks-only' })).toBe('/autonomize effort=thorough ask=forks-only')
  expect(formCommand('autonomy', { effort: 'keep', stopping: 'keep', ask: 'keep' })).toBeUndefined()
  expect(formCommand('sessions', { to: 'ui', note: 'token contract changed' })).toBe('/coordinate handoff ui token contract changed')
})

test('the review form builds target, angles and output flags', () => {
  expect(formCommand('review', {})).toBe('/review')
  expect(formCommand('review', { target: 'pr', value: '#88', angles: 'auto', output: 'page' })).toBe('/review --pr 88 --angles auto --artifact')
  expect(formCommand('review', { target: 'path', value: 'src/my dir' })).toBe('/review "src/my dir"')
  expect(formCommand('review', { target: 'since', value: 'main', angles: 'custom', custom: 'performance, security' })).toBe(
    '/review --since main --angles performance,security',
  )
  expect(formCommand('review', { target: 'pr' })).toBe('/review --pr')
  expect(formCommand('review', { target: 'pr', value: 'abc' })).toBeUndefined()
  expect(formCommand('review', { target: 'path' })).toBeUndefined()
})

test('the contract and the board read from their files', () => {
  expect(parseContract('effort: thorough   # x\nstopping: budget\nask: sometimes')).toEqual({ effort: 'thorough', stopping: 'budget' })
  const board = [
    '# Active sessions',
    '| Session | Owns | Status | Updated | Hand-offs / assignments |',
    '|---------|------|--------|---------|-------------------------|',
    '| auth | slug:auth | executing step 3 | 2026-06-11T14:20 | — |',
  ].join('\n')
  expect(parseBoard(board)).toEqual([{ session: 'auth', owns: 'slug:auth', status: 'executing step 3', handoffs: '—' }])
})
