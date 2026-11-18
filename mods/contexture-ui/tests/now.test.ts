import { expect, test } from 'claude-code/testing'

import { agentSummary, clockText, fromToolUses, nowParts, toolSummary } from '../hooks/now'

test('a tool call reads as its command, file name or pattern', () => {
  expect(toolSummary('Bash', { command: 'bun test server/' })).toBe('Bash bun test server/')
  expect(toolSummary('Edit', { file_path: 'C:\\repo\\server\\live.ts' })).toBe('Edit live.ts')
  expect(toolSummary('Grep', { pattern: 'retry\\(' })).toBe('Grep retry\\(')
  expect(toolSummary('TodoWrite', {})).toBe('TodoWrite')
  expect(toolSummary('Bash', { command: 'x'.repeat(100) })).toHaveLength('Bash '.length + 60)
})

test('an Agent call reads as a subagent with its task', () => {
  expect(agentSummary({ subagent_type: 'Explore', description: 'find SSE handlers' })).toBe('Explore: find SSE handlers')
  const state = fromToolUses(
    [
      { name: 'Agent', input: { description: 'a' } },
      { name: 'Read', input: {} },
    ],
    5,
  )
  expect(state).toEqual({ kind: 'agent', what: 'agent: a +1', since: 5 })
  expect(fromToolUses([], 5)).toBeUndefined()
})

test('the clock reads minutes and seconds', () => {
  expect(clockText(42_000)).toBe('0:42')
  expect(clockText(125_900)).toBe('2:05')
  expect(nowParts({ kind: 'you', what: 'approve Bash ls', since: 0 }, 72_000)).toEqual({
    label: 'On you',
    what: 'approve Bash ls',
    clock: '1:12',
  })
})
