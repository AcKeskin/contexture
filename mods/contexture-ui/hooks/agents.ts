// The Agents tab's rows: each subagent of this session, its state, how long
// it has run and what it last did. Pure: no $.

import type { AgentRow, AgentNote } from '../types'
import { relativePath } from './codemap'
import { clockText } from './now'

const MARK: Record<AgentRow['status'], string> = {
  pending: '○',
  running: '●',
  waiting: '◌',
  idle: '◌',
  completed: '✓',
  failed: '✗',
  killed: '✗',
}
const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])
const MAX_FILES = 200

// An idle teammate waits for a message: still around, not done.
export function isLive(row: AgentRow): boolean {
  return row.status === 'pending' || row.status === 'running' || row.status === 'waiting' || row.status === 'idle'
}

// Live ones first, then the newest.
export function sortRows(rows: readonly AgentRow[]): AgentRow[] {
  return [...rows].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.startTime - a.startTime)
}

export function headLine(rows: readonly AgentRow[]): string {
  if (rows.length === 0) return 'No subagents this session.'
  const live = rows.filter(isLive).length
  const done = rows.length - live
  return [live > 0 ? `${live} running` : '', done > 0 ? `${done} done` : ''].filter(s => s !== '').join(' · ')
}

export function titleLine(row: AgentRow, now: number): { mark: string; title: string; clock: string } {
  const clock = row.status === 'running' ? clockText(now - row.startTime) : row.status
  return { mark: MARK[row.status] ?? '·', title: `${row.type} · ${row.description}`, clock }
}

// What it last did, the files it wrote, and its folder when not the session's.
export function detailLine(row: AgentRow, note: AgentNote | undefined, root: string): string {
  const files = note?.files.length ?? 0
  const where = row.cwd === root ? '' : (relativePath(row.cwd, root) ?? row.cwd)
  const parts = [note?.last ?? '', files === 0 ? '' : `${files} ${files === 1 ? 'file' : 'files'}`, where]
  return parts.filter(s => s !== '').join(' · ')
}

// The note after one step: its last tool, and the files its edits named.
export function nextNote(
  note: AgentNote | undefined,
  uses: ReadonlyArray<{ name: string; input: unknown }>,
  summary: (tool: string, input: unknown) => string,
): AgentNote {
  const last = uses.at(-1)
  const files = new Set(note?.files ?? [])
  for (const u of uses) {
    const path = (u.input as Record<string, unknown> | null)?.file_path
    if (EDIT_TOOLS.has(u.name) && typeof path === 'string' && files.size < MAX_FILES) files.add(path)
  }
  return { last: last ? summary(last.name, last.input) : (note?.last ?? ''), files: [...files] }
}

// Converge shows once two or more top-level subagents started since the last
// Converge have all finished, at least one of them done.
export function isReadyToConverge(rows: readonly AgentRow[], since: number): boolean {
  const top = rows.filter(r => r.parentId === undefined && !r.isTeammate && r.startTime > since)
  return top.length >= 2 && !top.some(isLive) && top.some(r => r.status === 'completed')
}

export const CONVERGE =
  "Converge the subagents' results: merge their work, run the full tests, then check it against the goal."
