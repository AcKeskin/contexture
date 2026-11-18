import { expect, test } from 'claude-code/testing'

import { detailLine, headLine, isReadyToConverge, nextNote, sortRows, titleLine } from '../hooks/agents'
import { toolSummary } from '../hooks/now'
import type { AgentRow } from '../types'

const row = (id: string, status: AgentRow['status'], startTime: number, cwd = '/repo', more: Partial<AgentRow> = {}): AgentRow => ({
  isTeammate: false,
  hasRow: true,
  ...more,
  id,
  type: 'Explore',
  description: `task ${id}`,
  status,
  startTime,
  cwd,
})

test('live agents sort first, then the newest; the head line counts both', () => {
  const rows = sortRows([row('a', 'completed', 3), row('b', 'running', 1), row('c', 'failed', 2)])
  expect(rows.map(r => r.id)).toEqual(['b', 'a', 'c'])
  expect(headLine(rows)).toBe('1 running · 2 done')
  expect(headLine([])).toBe('No subagents this session.')
})

test('a row shows its clock while live, its status after', () => {
  expect(titleLine(row('a', 'running', 0), 42_000)).toEqual({ mark: '●', title: 'Explore · task a', clock: '0:42' })
  expect(titleLine(row('a', 'failed', 0), 42_000).clock).toBe('failed')
})

test('the note keeps the last tool and the files edits named; the detail adds a worktree', () => {
  const one = nextNote(undefined, [{ name: 'Edit', input: { file_path: '/repo/.worktrees/a/x.ts' } }], toolSummary)
  const two = nextNote(one, [{ name: 'Read', input: { file_path: '/repo/y.ts' } }], toolSummary)
  expect(two).toEqual({ last: 'Read y.ts', files: ['/repo/.worktrees/a/x.ts'] })
  expect(detailLine(row('a', 'running', 0, '/repo/.worktrees/a'), two, '/repo')).toBe('Read y.ts · 1 file · .worktrees/a')
  expect(detailLine(row('a', 'running', 0), undefined, '/repo')).toBe('')
})

test('Converge shows once two or more ran and none is live', () => {
  expect(isReadyToConverge([row('a', 'completed', 1), row('b', 'completed', 1)], 0)).toBe(true)
  expect(isReadyToConverge([row('a', 'completed', 0), row('b', 'running', 0)], 0)).toBe(false)
  expect(isReadyToConverge([row('a', 'completed', 0)], 0)).toBe(false)
  // An idle teammate is still around; nested agents and an earlier batch don't count.
  expect(isReadyToConverge([row('a', 'completed', 0), row('t', 'idle', 0, '/repo', { isTeammate: true })], 0)).toBe(false)
  expect(isReadyToConverge([row('a', 'completed', 5), row('c', 'completed', 6, '/repo', { parentId: 'a' })], 0)).toBe(false)
  expect(isReadyToConverge([row('a', 'completed', 5), row('b', 'completed', 6)], 10)).toBe(false)
  expect(titleLine(row('w', 'waiting', 0), 9_000).clock).toBe('waiting')
})
