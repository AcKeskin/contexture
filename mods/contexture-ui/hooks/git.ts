// `git status --porcelain=v1 -z` as one mark per path. Pure: no $.

import type { GitMark } from '../types'

// Porcelain paths are relative to the repo root; `prefix` (rev-parse
// --show-prefix) is where the session root sits inside it.
// `isTruncated`: the output was cut, so its last entry may be partial.
export function parseGitStatus(z: string, prefix = '', isTruncated = false): Record<string, GitMark> {
  const marks: Record<string, GitMark> = {}
  const parts = z.split('\0')
  if (isTruncated) parts.pop()
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) continue
    const xy = entry.slice(0, 2)
    const path = entry.slice(3)
    // A rename or copy, staged or in the work tree, carries its source as the next entry.
    if (isMove(xy)) i++
    if (!path.startsWith(prefix)) continue
    marks[path.slice(prefix.length)] = markOf(xy)
  }
  return marks
}

function isMove(xy: string): boolean {
  return xy.includes('R') || xy.includes('C')
}

function markOf(xy: string): GitMark {
  if (xy === '??') return '?'
  if (xy.includes('D')) return 'D'
  if (xy.includes('A')) return 'A'
  if (isMove(xy)) return 'R'
  return 'M'
}
