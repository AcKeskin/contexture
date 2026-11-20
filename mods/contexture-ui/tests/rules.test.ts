import { expect, test } from 'claude-code/testing'

import type { RuleRow } from '../types'
import { byScope, filterRules, parseRules, ruleDetail, toggleArgs } from '../hooks/rules'

const row = (key: string, extra: Partial<RuleRow> = {}): RuleRow => ({
  key,
  name: `${key} rule`,
  scope: [],
  tier: 'shipped',
  tiers: ['shipped'],
  isLocked: false,
  disabledIn: [],
  ...extra,
})

test('rules-cli output parses; bad rows and bad output drop', () => {
  expect(parseRules(JSON.stringify({ rules: [row('a/b'), { key: 'x' }, row('c/d', { tier: 'odd' as never })] }))).toEqual([row('a/b')])
  expect(parseRules('not json')).toBeUndefined()
  expect(parseRules('{"other":1}')).toBeUndefined()
})

test('rules group by scope folder and filter by key or name', () => {
  const list = [row('web/a'), row('universal/b'), row('universal/c', { name: 'Naming' })]
  expect(byScope(list).map(([s, l]) => [s, l.length])).toEqual([
    ['universal', 2],
    ['web', 1],
  ])
  expect(filterRules(list, ' NAMING ').map(r => r.key)).toEqual(['universal/c'])
  expect(filterRules(list, '')).toHaveLength(3)
})

test('the detail line names the tiers, the lock and where a rule is off', () => {
  expect(ruleDetail(row('a/b'))).toBe('shipped')
  expect(
    ruleDetail(row('a/b', { tier: 'project', tiers: ['shipped', 'company', 'project'], isLocked: true, disabledIn: ['user', 'project'] })),
  ).toBe('project over shipped, company · locked · off for you · off in this project')
})

test('a rule that is on turns off where picked; one that is off turns on', () => {
  expect(toggleArgs('/c.js', '/r', row('a/b'), false)).toEqual(['node', '/c.js', 'disable', 'a/b', '--cwd', '/r'])
  expect(toggleArgs('/c.js', '/r', row('a/b'), true)).toEqual(['node', '/c.js', 'disable', 'a/b', '--cwd', '/r', '--project'])
  expect(toggleArgs('/c.js', '/r', row('a/b', { disabledIn: ['project'] }), true)).toEqual(['node', '/c.js', 'enable', 'a/b', '--cwd', '/r'])
})
