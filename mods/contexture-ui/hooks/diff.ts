// Line diff of a file before Claude's first edit and now, as unified-diff
// hunks, and the two ways back: undo a hunk in the file, or keep it as the
// new baseline. Pure: no $.

export type Hunk = {
  id: string
  // 0-based line ranges, context included, the same lines on both sides.
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  // 0-based line in the new text where the first change sits.
  at: number
  adds: number
  dels: number
  // Unified-diff text for a Code element: header plus lines, no '\r'.
  text: string
}

type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number }

// Past this many cells the LCS table is too big: the changed middle reads
// as one replace.
const MAX_CELLS = 4_000_000

function ops(a: readonly string[], b: readonly string[]): Op[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const am = a.slice(head, a.length - tail)
  const bm = b.slice(head, b.length - tail)
  const out: Op[] = []
  for (let i = 0; i < head; i++) out.push({ kind: ' ', line: a[i] ?? '', a: i, b: i })
  out.push(...middle(am, bm, head))
  for (let i = tail; i > 0; i--) out.push({ kind: ' ', line: a[a.length - i] ?? '', a: a.length - i, b: b.length - i })
  return out
}

function middle(a: readonly string[], b: readonly string[], at: number): Op[] {
  const n = a.length
  const m = b.length
  if (n * m > MAX_CELLS) {
    return [
      ...a.map((line, i) => ({ kind: '-' as const, line, a: at + i, b: at })),
      ...b.map((line, j) => ({ kind: '+' as const, line, a: at + n, b: at + j })),
    ]
  }
  // lcs[i][j]: common length of a[i..] and b[j..], one flat row-major array.
  const lcs = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[i] === b[j] ? (lcs[(i + 1) * (m + 1) + j + 1] ?? 0) + 1 : Math.max(lcs[(i + 1) * (m + 1) + j] ?? 0, lcs[i * (m + 1) + j + 1] ?? 0)
    }
  }
  const out: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: ' ', line: a[i] ?? '', a: at + i, b: at + j })
      i++
      j++
    } else if (i < n && (j === m || (lcs[(i + 1) * (m + 1) + j] ?? 0) >= (lcs[i * (m + 1) + j + 1] ?? 0))) {
      // Removals first, as unified diffs read.
      out.push({ kind: '-', line: a[i] ?? '', a: at + i, b: at + j })
      i++
    } else {
      out.push({ kind: '+', line: b[j] ?? '', a: at + i, b: at + j })
      j++
    }
  }
  return out
}

export function splitLines(text: string): string[] {
  return text.split('\n')
}

// The lines a diff compares: the final newline ends a line, it doesn't start
// an empty one, and an empty text has none. Line numbers match splitLines'.
function diffLines(text: string): string[] {
  if (text === '') return []
  return splitLines(text.endsWith('\n') ? text.slice(0, -1) : text)
}

// Short djb2 hash, so a hunk's id changes when its text does.
function hash(text: string): string {
  let n = 5381
  for (let i = 0; i < text.length; i++) n = ((n << 5) + n + text.charCodeAt(i)) >>> 0
  return n.toString(36)
}

export function hunks(before: string, after: string, context = 3): Hunk[] {
  const all = ops(diffLines(before), diffLines(after))
  const changed = all.flatMap((op, k) => (op.kind === ' ' ? [] : [k]))
  const out: Hunk[] = []
  let k = 0
  while (k < changed.length) {
    const from = Math.max(0, (changed[k] ?? 0) - context)
    let to = Math.min(all.length, (changed[k] ?? 0) + context + 1)
    k++
    while (k < changed.length && (changed[k] ?? 0) - context <= to) {
      to = Math.min(all.length, (changed[k] ?? 0) + context + 1)
      k++
    }
    out.push(toHunk(all.slice(from, to), all[from]))
  }
  return out
}

function toHunk(slice: Op[], first: Op | undefined): Hunk {
  const oldStart = first?.a ?? 0
  const newStart = first?.b ?? 0
  const oldLines = slice.filter(o => o.kind !== '+').length
  const newLines = slice.filter(o => o.kind !== '-').length
  const body = slice.map(o => o.kind + o.line.replace(/\r$/, '')).join('\n')
  const header = `@@ -${oldStart + 1},${oldLines} +${newStart + 1},${newLines} @@`
  const text = `${header}\n${body}`
  return {
    id: `${oldStart}:${newStart}:${oldLines}:${newLines}:${hash(text)}`,
    oldStart,
    oldLines,
    newStart,
    newLines,
    adds: slice.filter(o => o.kind === '+').length,
    at: slice.find(o => o.kind !== ' ')?.b ?? newStart,
    dels: slice.filter(o => o.kind === '-').length,
    text,
  }
}

function splice(into: string, start: number, count: number, from: string, fromStart: number, fromCount: number): string {
  const lines = splitLines(into)
  const src = splitLines(from)
  // A hunk that reaches the end on both sides takes the other side's ending
  // too, so its final newline (or its lack) comes along.
  const isAtEnd = start + count >= diffLines(into).length && fromStart + fromCount >= diffLines(from).length
  const repl = isAtEnd ? src.slice(fromStart) : src.slice(fromStart, fromStart + fromCount)
  return [...lines.slice(0, start), ...repl, ...(isAtEnd ? [] : lines.slice(start + count))].join('\n')
}

// The file with this hunk's lines put back as they were.
export function undoHunk(before: string, after: string, h: Hunk): string {
  return splice(after, h.newStart, h.newLines, before, h.oldStart, h.oldLines)
}

// The baseline with this hunk taken in, so it no longer shows.
export function keepHunk(before: string, after: string, h: Hunk): string {
  return splice(before, h.oldStart, h.oldLines, after, h.newStart, h.newLines)
}
