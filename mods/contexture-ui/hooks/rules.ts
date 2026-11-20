// Pure parts of the Rules tab: contexture's hook switches out of the /config
// rows, rules-cli.js output, grouping, filtering and the /rules commands.
import type { ConfigRow } from 'claude-code'

import type { HookRow, RuleRow } from '../types'

// The contexture plugin's own rows: `contexture.<bundle>`, not this mod's.
function isContexture(plugin: string): boolean {
  return plugin === 'contexture' || plugin.startsWith('contexture@')
}

export function hookRows(rows: readonly ConfigRow[]): HookRow[] {
  return rows.flatMap(r =>
    r.kind === 'boolean' && typeof r.value === 'boolean' && isContexture(r.provider.plugin)
      ? [{ key: r.key, label: r.label, description: r.description ?? '', isOn: r.value, isLocked: r.isLocked }]
      : [],
  )
}

const TIERS = new Set(['shipped', 'company', 'user', 'project'])

function isRuleRow(x: unknown): x is RuleRow {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return (
    typeof r.key === 'string' &&
    typeof r.name === 'string' &&
    Array.isArray(r.scope) &&
    typeof r.tier === 'string' &&
    TIERS.has(r.tier) &&
    Array.isArray(r.tiers) &&
    typeof r.isLocked === 'boolean' &&
    Array.isArray(r.disabledIn)
  )
}

// `rules-cli.js list` prints `{ rules: [...] }`; anything else is undefined.
export function parseRules(stdout: string): RuleRow[] | undefined {
  try {
    const rules: unknown = JSON.parse(stdout)?.rules
    return Array.isArray(rules) ? rules.filter(isRuleRow) : undefined
  } catch {
    return undefined
  }
}

export function isOff(r: RuleRow): boolean {
  return r.disabledIn.length > 0
}

// Rules by their scope folder (`universal`, `typescript`), folders in order.
export function byScope(rules: readonly RuleRow[]): Array<[string, RuleRow[]]> {
  const groups = new Map<string, RuleRow[]>()
  for (const r of rules) {
    const scope = r.key.split('/')[0] ?? r.key
    groups.set(scope, [...(groups.get(scope) ?? []), r])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

// Rules whose key or name holds the text, any case.
export function filterRules(rules: readonly RuleRow[], query: string): RuleRow[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...rules]
  return rules.filter(r => r.key.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
}

// Where the rule comes from and where it is off: `company over shipped`, `off for you`.
export function ruleDetail(r: RuleRow): string {
  const from = r.tiers.length > 1 ? `${r.tier} over ${r.tiers.filter(t => t !== r.tier).join(', ')}` : r.tier
  const off = r.disabledIn.map(m => (m === 'user' ? 'off for you' : 'off in this project'))
  return [from, ...(r.isLocked ? ['locked'] : []), ...off].join(' · ')
}

export function rulesCommand(kind: 'edit' | 'where' | 'disable', key: string): string {
  return `/rules ${kind} ${key}`
}

// Argument vectors for rules-cli.js.
export function listArgs(cli: string, root: string): string[] {
  return ['node', cli, 'list', '--cwd', root]
}

export function toggleArgs(cli: string, root: string, r: RuleRow, isProjectOnly: boolean): string[] {
  if (isOff(r)) return ['node', cli, 'enable', r.key, '--cwd', root]
  return ['node', cli, 'disable', r.key, '--cwd', root, ...(isProjectOnly ? ['--project'] : [])]
}
