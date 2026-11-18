// The run bar's forms: what each asks and the command it writes into the
// reply box. Pure: no $.

import type { BoardRow, FormId } from '../types'
import { executeCommand } from './chain'
import type { Strategy } from './chain'

export type Fields = Readonly<Record<string, string>>
type Option = { value: string; label: string }

export const FORMS: ReadonlyArray<{ id: FormId; label: string }> = [
  { id: 'orchestrate', label: 'Orchestrate' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'execute', label: 'Execute' },
  { id: 'review', label: 'Review' },
  { id: 'checkpoint', label: 'Checkpoint' },
  { id: 'capture', label: 'Capture' },
  { id: 'autonomy', label: 'Autonomy' },
  { id: 'sessions', label: 'Sessions' },
]

export const PLACEMENTS: readonly Option[] = [
  { value: 'auto', label: 'placement: let Claude pick' },
  { value: 'worktree', label: 'a worktree per unit' },
  { value: 'shared', label: 'shared tree' },
]
export const STRATEGY_OPTIONS: readonly Option[] = [
  { value: 'auto', label: 'sequential (default)' },
  { value: 'subtask', label: 'subtask' },
  { value: 'multi-agent', label: 'multi-agent' },
]
export const TARGETS: readonly Option[] = [
  { value: 'local', label: 'whole project' },
  { value: 'path', label: 'a path' },
  { value: 'since', label: 'since a ref' },
  { value: 'pr', label: 'a pull request' },
]
export const ANGLES: readonly Option[] = [
  { value: 'default', label: 'default angles' },
  { value: 'auto', label: 'auto: add up to 3' },
  { value: 'all', label: 'all angles' },
  { value: 'custom', label: 'these angles' },
]
export const OUTPUTS: readonly Option[] = [
  { value: 'chat', label: 'findings in the chat' },
  { value: 'page', label: 'review page' },
]
export const SCOPES: readonly Option[] = [
  { value: 'auto', label: 'scope: auto' },
  { value: 'diff', label: 'diff' },
  { value: 'module', label: 'module' },
  { value: 'corpus', label: 'corpus' },
]
// The kinds /capture knows; `auto` leaves the pick to it.
export const CAPTURE_KINDS: readonly Option[] = [
  { value: 'auto', label: 'kind: let Claude pick' },
  { value: 'lesson', label: 'lesson' },
  { value: 'decision', label: 'decision' },
  { value: 'architectural-rule', label: 'architectural rule' },
  { value: 'preference', label: 'preference' },
  { value: 'warning', label: 'warning' },
]
// Each contract picker starts on `keep`: a field left there falls through to
// the project default, as /autonomize does with unset fields.
export const KEEP = 'keep'
export const CONTRACT: Readonly<Record<'effort' | 'stopping' | 'ask', readonly string[]>> = {
  effort: ['minimal', 'balanced', 'thorough', 'exhaustive'],
  stopping: ['criteria-met', 'diminishing-returns', 'budget', 'user-anytime'],
  ask: ['forks-only', 'every-step', 'until-blocked'],
}

function field(fields: Fields, name: string, fallback = ''): string {
  return (fields[name] ?? fallback).trim()
}

// One item per line, or split with `;` (Enter in a field may not add a line).
function lines(text: string): string[] {
  return text
    .split(/\n|;/)
    .map(l => l.trim().replace(/^[-*]\s*/, ''))
    .filter(l => l !== '')
}

// A value with spaces goes in quotes, its own quotes escaped.
function quoted(text: string): string {
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}

function isStrategy(value: string): value is Strategy {
  return value === 'auto' || value === 'subtask' || value === 'multi-agent'
}

// The command a form writes, or undefined while a needed field is empty.
export function formCommand(id: FormId, fields: Fields): string | undefined {
  switch (id) {
    case 'orchestrate': {
      const goal = field(fields, 'goal')
      if (goal === '') return undefined
      const units = lines(fields.units ?? '')
      const placement = field(fields, 'placement', 'auto')
      return [
        `/orchestrate ${goal}`,
        ...(units.length === 0 ? [] : ['Units (name: folder):', ...units.map(u => `- ${u}`)]),
        ...(placement === 'worktree' ? ['Give each unit its own worktree.'] : placement === 'shared' ? ['Keep all units in the shared tree.'] : []),
      ].join('\n')
    }
    case 'dispatch': {
      const tasks = lines(fields.tasks ?? '')
      return tasks.length === 0 ? undefined : ['/dispatch', ...tasks.map(t => `- ${t}`)].join('\n')
    }
    case 'execute': {
      const slug = field(fields, 'slug')
      if (slug === '') return undefined
      const from = Number(field(fields, 'from'))
      const how = field(fields, 'strategy', 'auto')
      return executeCommand(slug, Number.isInteger(from) && from > 0 ? from : undefined, isStrategy(how) ? how : 'auto')
    }
    case 'review': {
      const target = field(fields, 'target', 'local')
      const value = field(fields, 'value')
      if ((target === 'path' || target === 'since') && value === '') return undefined
      // An empty PR field means the current branch's PR.
      if (target === 'pr' && value !== '' && !/^#?\d+$/.test(value)) return undefined
      const angles = field(fields, 'angles', 'default')
      const custom = field(fields, 'custom').replace(/\s+/g, '')
      if (angles === 'custom' && custom === '') return undefined
      const parts = ['/review']
      if (target === 'path') parts.push(quoted(value))
      if (target === 'since') parts.push(`--since ${quoted(value)}`)
      if (target === 'pr') parts.push(value === '' ? '--pr' : `--pr ${value.replace(/^#/, '')}`)
      if (angles === 'auto' || angles === 'all') parts.push(`--angles ${angles}`)
      if (angles === 'custom') parts.push(`--angles ${custom}`)
      if (field(fields, 'output', 'chat') === 'page') parts.push('--artifact')
      return parts.join(' ')
    }
    case 'checkpoint': {
      const scope = field(fields, 'scope', 'auto')
      return scope === 'auto' ? '/checkpoint' : `/checkpoint --scope ${scope}`
    }
    case 'capture': {
      const text = field(fields, 'text')
      const kind = field(fields, 'kind', 'auto')
      if (text === '') return undefined
      return kind === 'auto' ? `/capture ${text}` : `/capture ${kind}: ${text}`
    }
    case 'autonomy': {
      const set = (['effort', 'stopping', 'ask'] as const).flatMap(k => {
        const v = field(fields, k)
        return CONTRACT[k].includes(v) ? [`${k}=${v}`] : []
      })
      return set.length === 0 ? undefined : `/autonomize ${set.join(' ')}`
    }
    case 'sessions': {
      const to = field(fields, 'to')
      const note = field(fields, 'note')
      return to === '' || note === '' ? undefined : `/coordinate handoff ${to} ${note}`
    }
  }
}

// The contract `.claude/autonomy/active.md` holds: `effort: thorough` lines.
export function parseContract(text: string): Partial<Record<'effort' | 'stopping' | 'ask', string>> {
  const out: Partial<Record<'effort' | 'stopping' | 'ask', string>> = {}
  for (const k of ['effort', 'stopping', 'ask'] as const) {
    const m = new RegExp(`^${k}:\\s*([\\w-]+)`, 'm').exec(text)
    if (m?.[1] && CONTRACT[k].includes(m[1])) out[k] = m[1]
  }
  return out
}

// The rows of `.claude/sessions-active.md`'s table, header and rule left out.
export function parseBoard(text: string): BoardRow[] {
  return text
    .split('\n')
    .filter(l => l.trim().startsWith('|'))
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    .filter(c => c.length >= 3 && c[0] !== 'Session' && !/^-+$/.test(c[0] ?? ''))
    .map(c => ({ session: c[0] ?? '', owns: c[1] ?? '', status: c[2] ?? '', handoffs: c[4] ?? '' }))
}
