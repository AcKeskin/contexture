// The Work pane's Changes tab: each file Claude edited this session, as
// hunks against a copy taken before its first edit, with Keep, Undo and
// Comment per hunk. Edits made through Bash (sed, scripts) aren't seen, but
// once a file has a copy, any later change to it shows, yours too.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { FileChange } from '../types'
import { relativePath } from './codemap'
import { hunks, keepHunk, undoHunk } from './diff'
import type { Hunk } from './diff'
import { card, isRich } from './look'
import { fillReply } from './reply'

// Copies of files before Claude's first edit: path → text, null for a file
// that did not exist. Large files, and any past the total budget, are left
// out (no diff, no undo).
const before = atom({ plugin: 'contexture-ui', key: 'before' } as const, {} as Record<string, string | null>, {
  shape: 'before-1',
})
const changes = atom({ plugin: 'contexture-ui', key: 'changes' } as const, [] as FileChange[], { shape: 'changes-1' })
// The file whose hunks show: null shows the first with hunks.
const shownChange = atom({ plugin: 'contexture-ui', key: 'shownChange' } as const, null as string | null, {
  shape: 'shown-change-1',
})
const MAX_BYTES = 400_000
const MAX_TOTAL = 4_000_000
const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const

// The edited path, its Windows drive letter in one case so `c:` and `C:`
// share a copy.
function toolPath(e: object): string | undefined {
  const input = e as Record<string, unknown>
  const path = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
  return typeof path === 'string' ? path.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`) : undefined
}

// $.fs.read and write are UTF-8 only: a file with a BOM, a NUL or bytes that
// don't decode would come back changed from an Undo, so it gets no copy.
function isPlainText(text: string): boolean {
  return !text.startsWith('\uFEFF') && !text.includes('\u0000') && !text.includes('\uFFFD')
}

async function readOrNull($: EngineInterface, path: string): Promise<string | null> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : null
}

// Takes the copy once per file per conversation, before the edit runs.
async function snapshot($: EngineInterface, path: string): Promise<void> {
  const copies = await read($, before)
  if (path in copies) return
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat && stat.size > MAX_BYTES) return
  const text = await readOrNull($, path)
  if (text !== null && !isPlainText(text)) return
  const total = Object.values(copies).reduce((n, t) => n + (t?.length ?? 0), 0)
  if (total + (text?.length ?? 0) > MAX_TOTAL) return
  await update($, before, c => (path in c ? c : { ...c, [path]: text }))
}

async function diffOne($: EngineInterface, root: string, path: string, was: string | null): Promise<FileChange | undefined> {
  const now = await readOrNull($, path)
  if (now === null || now === was) return undefined
  const rel = relativePath(path, root) ?? path
  const hs = hunks(was ?? '', now)
  if (hs.length === 0) return undefined
  return { path, rel, isNew: was === null, hunks: hs }
}

// Recomputes the hunks from the copy and the file now: of one file when
// `only` names it, else of every file.
export async function loadChanges($: EngineInterface, only?: string): Promise<void> {
  const root = await $.session.root()
  const copies = await read($, before)
  const paths = only === undefined ? Object.keys(copies) : only in copies ? [only] : []
  const found = await Promise.all(paths.map(path => diffOne($, root, path, copies[path] ?? null)))
  const fresh = found.filter((c): c is FileChange => c !== undefined)
  await update($, changes, list =>
    [...(only === undefined ? [] : list.filter(f => f.path !== only)), ...fresh].sort((a, b) => a.rel.localeCompare(b.rel)),
  )
}

// A new conversation (/clear) starts from the files as they are.
export async function clearChanges($: EngineInterface): Promise<void> {
  await update($, before, () => ({}))
  await update($, changes, () => [])
  await update($, shownChange, () => null)
}

// The hunk as it stands now, or undefined when the file moved on since the
// tab drew it (the person then looks again).
async function current($: EngineInterface, path: string, id: string): Promise<{ was: string; now: string; h: Hunk } | undefined> {
  const was = (await read($, before))[path]
  const now = await readOrNull($, path)
  if (was === undefined || was === null || now === null) return undefined
  const h = hunks(was, now).find(x => x.id === id)
  return h ? { was, now, h } : undefined
}

// Presses run one at a time, so a second press reads what the first wrote.
let pressing: Promise<void> = Promise.resolve()
function serial(run: () => Promise<void>): Promise<void> {
  const done = pressing.then(run)
  pressing = done.catch(() => undefined)
  return done
}

async function keep($: EngineInterface, path: string, id: string): Promise<void> {
  const at = await current($, path, id)
  if (!at) return stale($)
  await update($, before, c => ({ ...c, [path]: keepHunk(at.was, at.now, at.h) }))
  await loadChanges($, path)
}

async function undo($: EngineInterface, path: string, id: string): Promise<void> {
  const at = await current($, path, id)
  if (!at) return stale($)
  await $.fs.write(path, undoHunk(at.was, at.now, at.h))
  await loadChanges($, path)
}

// A new file has no copy to go back to: keeping it drops it from the list.
async function keepFile($: EngineInterface, path: string): Promise<void> {
  const now = await readOrNull($, path)
  await update($, before, c => ({ ...c, [path]: now }))
  await loadChanges($, path)
}

// Keep all: every file as it is now becomes its own copy.
async function keepAll($: EngineInterface): Promise<void> {
  for (const f of await read($, changes)) await keepFile($, f.path)
}

async function stale($: EngineInterface): Promise<void> {
  $.ui.toast('That change moved since the tab drew it. Look again.')
  await loadChanges($)
}

export function registerChanges(on: On): void {
  on('tool.call', { tool: [...EDIT_TOOLS] }, async ($, e, next) => {
    // A failure here must not fail Claude's edit: log it and go on.
    const log = (err: unknown) => $.ui.log(`contexture-ui: Changes tab: ${String(err)}`)
    const path = toolPath(e)
    if (path !== undefined) await snapshot($, path).catch(log)
    const r = await next(e)
    if (path !== undefined && r.deny === undefined && r.isError !== true) await loadChanges($, path).catch(log)
    return r
  })
}

// For the tab label: files with edits to look at.
export async function changesCount($: EngineInterface): Promise<number> {
  return (await read($, changes)).length
}

function lineCounts(f: FileChange): { adds: number; dels: number } {
  return { adds: f.hunks.reduce((n, x) => n + x.adds, 0), dels: f.hunks.reduce((n, x) => n + x.dels, 0) }
}

// One card per file: the shown file with its hunks, the others with a count
// and Show.
export async function changesTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Code, Text } = $.ui.resolve(e)
  const rich = isRich(e)
  const list = await read($, changes)
  if (list.length === 0) return <Text dimColor>No edits by Claude this session.</Text>
  // The file you showed while it still has hunks, else the first that has.
  const chosen = await read($, shownChange)
  const shown = list.find(f => f.rel === chosen && !f.isNew)?.rel ?? list.find(f => !f.isNew)?.rel
  const adds = list.reduce((n, f) => n + lineCounts(f).adds, 0)
  const dels = list.reduce((n, f) => n + lineCounts(f).dels, 0)

  return (
    <Box flexDirection="column" gap={rich ? 1 : 0}>
      <Box justifyContent="space-between" gap={1} alignItems="center">
        <Box gap={1}>
          <Text weight="semibold">
            {list.length} {list.length === 1 ? 'file' : 'files'}
          </Text>
          <Text dimColor tabular mono>
            +{adds} −{dels}
          </Text>
        </Box>
        <Button key="keep-all" label="Keep all" onPress={() => serial(() => keepAll($))} />
      </Box>
      {list.map(f => {
        const n = lineCounts(f)
        const isShown = f.rel === shown
        return (
          <Box flexDirection="column" {...card(rich)}>
            <Box justifyContent="space-between" gap={1}>
              <Text weight="semibold" wrap="truncate-end">
                {f.rel}
              </Text>
              <Text dimColor tabular mono>
                {f.isNew ? 'new file' : `+${n.adds} −${n.dels}`}
              </Text>
            </Box>
            {f.isNew ? (
              <Box gap={1}>
                <Button key={`keep-${f.rel}`} label="Keep" onPress={() => serial(() => keepFile($, f.path))} />
                <Button key={`comment-${f.rel}`} label="Comment" onPress={() => fillReply($, `About ${f.rel}: `)} />
              </Box>
            ) : !isShown ? (
              <Box gap={1} alignItems="center">
                <Text dimColor>
                  {f.hunks.length} {f.hunks.length === 1 ? 'hunk' : 'hunks'}
                </Text>
                <Button key={`show-${f.rel}`} label="Show" onPress={() => update($, shownChange, () => f.rel)} />
                <Button key={`keep-${f.rel}`} label="Keep" onPress={() => serial(() => keepFile($, f.path))} />
              </Box>
            ) : (
              f.hunks.map(hunk => (
                <Box flexDirection="column" marginTop={1}>
                  <Code source={hunk.text} format="diff" />
                  <Box gap={1}>
                    <Button key={`keep-${f.rel}-${hunk.id}`} label="Keep" onPress={() => serial(() => keep($, f.path, hunk.id))} />
                    <Button key={`undo-${f.rel}-${hunk.id}`} label="Undo" onPress={() => serial(() => undo($, f.path, hunk.id))} />
                    <Button
                      key={`comment-${f.rel}-${hunk.id}`}
                      label="Comment"
                      onPress={() => fillReply($, `About ${f.rel}:${hunk.at + 1}: `)}
                    />
                  </Box>
                </Box>
              ))
            )}
          </Box>
        )
      })}
      <Box gap={1}>
        <Button key="review" label="/review" onPress={() => fillReply($, '/review')} />
        <Button key="pre-push" label="/pre-push" onPress={() => fillReply($, '/pre-push')} />
        <Button key="pr-author" label="/pr-author" onPress={() => fillReply($, '/pr-author')} />
      </Box>
    </Box>
  )
}
