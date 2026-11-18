// The now line: what the session waits on and for how long, as ClauDeck's
// Focus look shows it. Pure: no $.

import type { NowState } from '../types'

const LABEL: Record<NowState['kind'], string> = {
  you: 'On you',
  tool: 'On a tool',
  agent: 'On a subagent',
  claude: 'On Claude',
}
const MAX_WHAT = 60

function cut(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > MAX_WHAT ? `${one.slice(0, MAX_WHAT - 1)}…` : one
}

function field(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

// The short form of a tool call: a command, a path, a pattern, or the name.
export function toolSummary(tool: string, input: unknown): string {
  const path = field(input, 'file_path') ?? field(input, 'notebook_path') ?? field(input, 'path')
  const what = field(input, 'command') ?? path?.split(/[\\/]/).at(-1) ?? field(input, 'pattern') ?? field(input, 'url')
  return what ? `${tool} ${cut(what)}` : tool
}

// A subagent call says its type and task.
export function agentSummary(input: unknown): string {
  const type = field(input, 'subagent_type') ?? 'agent'
  const task = field(input, 'description')
  return task ? `${type}: ${cut(task)}` : type
}

// The state the model's tool requests put the session in: the first call
// names it, an Agent call reads as a subagent.
export function fromToolUses(uses: ReadonlyArray<{ name: string; input: unknown }>, since: number): NowState | undefined {
  const first = uses[0]
  if (!first) return undefined
  const more = uses.length > 1 ? ` +${uses.length - 1}` : ''
  return first.name === 'Agent'
    ? { kind: 'agent', what: agentSummary(first.input) + more, since }
    : { kind: 'tool', what: toolSummary(first.name, first.input) + more, since }
}

export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function nowParts(state: NowState, now: number): { label: string; what: string; clock: string } {
  return { label: LABEL[state.kind], what: state.what, clock: clockText(now - state.since) }
}
