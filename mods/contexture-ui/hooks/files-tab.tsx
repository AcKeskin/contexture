import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { CodemapTree, CodemapView, FileChange, GitMark, GitView, Touch, TourView, TreeNode } from '../types'
import { filterFiles, parseCodemap, parseCodemapJson, relativePath, visibleRows, withUnmapped } from './codemap'
import { parseGitStatus, parseNameList } from './git'
import { foldersOf, parseTour } from './tour'
import { card, chip, isRich, label } from './look'
import { fillReply } from './reply'
import { openWork, showTab } from './work-open'

const codemap = atom({ plugin: 'contexture-ui', key: 'codemap' } as const, { mtimeMs: 0 } as CodemapView, {
  shape: 'codemap-2',
})
const open = atom({ plugin: 'contexture-ui', key: 'open' } as const, [] as string[], { shape: 'open-1' })
const touched = atom({ plugin: 'contexture-ui', key: 'touched' } as const, {} as Record<string, Touch>, {
  shape: 'touched-1',
})
const NO_GIT: GitView = { marks: {}, stale: [], branch: [] }
const git = atom({ plugin: 'contexture-ui', key: 'git' } as const, NO_GIT, { shape: 'git-2' })
const NO_TOUR: TourView = { stops: [], mtimeMs: 0, isDraft: false }
const tour = atom({ plugin: 'contexture-ui', key: 'tour' } as const, NO_TOUR, { shape: 'tour-1' })
// The tour stop shown; null while the tour is closed.
const tourStop = atom({ plugin: 'contexture-ui', key: 'tourStop' } as const, null as number | null, { shape: 'tour-stop-1' })
const hasMapPage = atom({ plugin: 'contexture-ui', key: 'hasMapPage' } as const, false, { shape: 'map-page-1' })
const isChangedOnly = atom({ plugin: 'contexture-ui', key: 'isChangedOnly' } as const, false, { shape: 'changedOnly-1' })
const fileFilter = atom({ plugin: 'contexture-ui', key: 'fileFilter' } as const, '', { shape: 'file-filter-1' })
// Same atoms as changes-tab.tsx's: keep the declarations alike.
const changes = atom({ plugin: 'contexture-ui', key: 'changes' } as const, [] as FileChange[], { shape: 'changes-1' })
const shownChange = atom({ plugin: 'contexture-ui', key: 'shownChange' } as const, null as string | null, {
  shape: 'shown-change-1',
})
// Rows in the touched card and in a filter's result, at most.
const MAX_TOUCHED = 12
const MAX_FOUND = 40
const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const
// Files stat'ed for the stale mark, at most: a huge change set skips the rest.
const MAX_STAT = 200
// Where a branch starts, tried in order: the first that has a merge base with HEAD.
const BASE_REFS = ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master']
const GIT_COLOR: Record<GitMark, 'warning' | 'success' | 'error' | undefined> = {
  M: 'warning',
  R: 'warning',
  A: 'success',
  '?': 'success',
  D: 'error',
}

// Re-reads the codemap, its tour and map page, and the work tree's git status.
export async function loadCodemap($: EngineInterface): Promise<void> {
  await loadCodemapFile($)
  await loadTour($)
  await loadMapPage($)
  await loadGit($)
}

// visualise-codemap's tour. No file is a normal state (no tour drafted).
async function loadTour($: EngineInterface): Promise<void> {
  const path = `${await $.session.root()}/.claude/codemap.tour.json`
  const stat = await $.fs.stat(path).catch(() => undefined)
  const prior = await read($, tour)
  if (!stat) {
    if (prior.mtimeMs !== 0) await update($, tour, () => NO_TOUR)
    return
  }
  if (stat.mtimeMs === prior.mtimeMs) return
  try {
    const parsed = parseTour(await $.fs.read(path))
    await update($, tour, () => ({ ...parsed, mtimeMs: stat.mtimeMs }))
  } catch (err) {
    await update($, tour, () => ({ ...NO_TOUR, mtimeMs: stat.mtimeMs, error: `cannot read codemap.tour.json: ${String(err)}` }))
  }
  await update($, tourStop, () => null)
}

async function loadMapPage($: EngineInterface): Promise<void> {
  const stat = await $.fs.stat(`${await $.session.root()}/.claude/codemap.html`).catch(() => undefined)
  const isThere = stat !== undefined
  if ((await read($, hasMapPage)) !== isThere) await update($, hasMapPage, () => isThere)
}

// Opens .claude/codemap.html with the system's handler for .html files.
async function openMapPage($: EngineInterface): Promise<void> {
  const root = await $.session.root()
  const path = `${root}/.claude/codemap.html`
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  try {
    if (isWindows) {
      // explorer exits 1 even when it opened the file, so its code says nothing.
      await $.process.run(['explorer.exe', path.replace(/\//g, '\\')])
    } else {
      const uname = await $.process.run(['uname'])
      const opener = uname.stdout.trim() === 'Darwin' ? 'open' : 'xdg-open'
      const run = await $.process.run([opener, path])
      if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `${opener} exited ${run.exitCode}`)
    }
  } catch (err) {
    await $.ui.toast(`Cannot open ${path}: ${String(err)}`)
  }
}

// Re-parses the codemap when its mtime moved: codemap.json when update-codemap wrote
// one (exports with lines), else codemap.md. No file is a normal state (codemap not
// generated yet), so a failed stat means "none".
async function loadCodemapFile($: EngineInterface): Promise<void> {
  const dir = `${await $.session.root()}/.claude`
  const jsonStat = await $.fs.stat(`${dir}/codemap.json`).catch(() => undefined)
  const isJson = jsonStat !== undefined
  const path = isJson ? `${dir}/codemap.json` : `${dir}/codemap.md`
  const stat = jsonStat ?? (await $.fs.stat(path).catch(() => undefined))
  const prior = await read($, codemap)
  if (!stat) {
    if (prior.mtimeMs !== 0) await update($, codemap, () => ({ mtimeMs: 0 }))
    return
  }
  if (stat.mtimeMs === prior.mtimeMs) return
  try {
    const text = await $.fs.read(path)
    const tree = isJson ? parseCodemapJson(text) : parseCodemap(text)
    await update($, codemap, () => ({ tree, mtimeMs: stat.mtimeMs }))
  } catch (err) {
    await update($, codemap, () => ({ mtimeMs: stat.mtimeMs, error: `cannot read codemap: ${String(err)}` }))
  }
}

// Outside a git repo, or without git, the tree shows no git marks. Skipped
// with no codemap: the tab then shows how to make one.
async function loadGit($: EngineInterface): Promise<void> {
  const root = await $.session.root()
  const { mtimeMs, tree } = await read($, codemap)
  if (!tree) return
  const view = await readGit($, root, mtimeMs).catch((err: unknown) => {
    $.ui.log(`contexture-ui: git status failed: ${String(err)}`, { to: 'debug' })
    return NO_GIT
  })
  await update($, git, () => view)
}

async function readGit($: EngineInterface, root: string, codemapMtime: number): Promise<GitView> {
  const prefix = await $.process.run(['git', 'rev-parse', '--show-prefix'], { cwd: root })
  if (prefix.exitCode !== 0) return NO_GIT
  // No optional locks: a status at turn end must not hold index.lock
  // while Claude's own git commands run.
  const status = await $.process.run(
    ['git', '--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'],
    { cwd: root },
  )
  if (status.exitCode !== 0) return NO_GIT
  const marks = parseGitStatus(status.stdout, prefix.stdout.trim(), status.isStdoutTruncated)
  const branch = await readBranch($, root)
  const changed = Object.entries(marks)
    .filter(([, m]) => m !== 'D')
    .slice(0, MAX_STAT)
    .map(([path]) => path)
  const stats = await Promise.all(changed.map(path => $.fs.stat(`${root}/${path}`).catch(() => undefined)))
  const stale = changed.filter((_, i) => (stats[i]?.mtimeMs ?? 0) > codemapMtime)
  return { marks, stale, branch }
}

// Files changed since the branch left the default branch, committed or not,
// relative to the session root. Deleted files are left out. None when no base
// ref is found (a new repo, an odd remote name).
async function readBranch($: EngineInterface, root: string): Promise<string[]> {
  for (const ref of BASE_REFS) {
    const base = await $.process.run(['git', 'merge-base', 'HEAD', ref], { cwd: root })
    if (base.exitCode !== 0) continue
    const diff = await $.process.run(
      ['git', '--no-optional-locks', 'diff', '--name-only', '-z', '--relative', '--diff-filter=d', base.stdout.trim(), '--'],
      { cwd: root },
    )
    return diff.exitCode === 0 ? parseNameList(diff.stdout, diff.isStdoutTruncated) : []
  }
  return []
}

// The tree with unmapped changed files, kept while the codemap and the
// marks stay the same, so a redraw doesn't clone it.
let merged: { tree?: CodemapTree; status?: GitView; root?: TreeNode } = {}

function mergedRoot(tree: CodemapTree, status: GitView): TreeNode {
  if (merged.tree !== tree || merged.status !== status || !merged.root) {
    merged = { tree, status, root: withUnmapped(tree, [...Object.keys(status.marks), ...status.branch]) }
  }
  return merged.root ?? tree.root
}

function toolPath(e: object): string | undefined {
  const input = e as Record<string, unknown>
  if (typeof input.file_path === 'string') return input.file_path
  return typeof input.notebook_path === 'string' ? input.notebook_path : undefined
}

// Called from register.tsx's session.start: one hook per event and module.
export async function startCodemap($: EngineInterface): Promise<void> {
  await $.command.register({ name: 'codemap', description: 'Show .claude/codemap.md as a tree' })
  await loadCodemap($)
}

// A new conversation (/clear) starts with no read or edit marks.
export async function clearCodemapMarks($: EngineInterface): Promise<void> {
  await update($, touched, () => ({}))
}

export function registerCodemap(on: On): void {

  on('command.run', { command: 'codemap' }, async $ => {
    await loadCodemap($)
    const isPlaced = await openWork($, 'files')
    const view = await read($, codemap)
    if (isPlaced) return { text: 'Work pane opened on Files.' }
    return { text: view.tree ? `Codemap: ${view.tree.fileCount} files.` : 'No .claude/codemap.md. Run /update-codemap.' }
  })

  // Marks files Claude read or edited, like a file tree's activity marks.
  // Matched to these tools only: a hook that may match Bash turns off its
  // move to the background.
  on('tool.call', { tool: ['Read', ...EDIT_TOOLS] }, async ($, e, next) => {
    const r = await next(e)
    const isEdit = e.tool !== 'Read'
    if (r.deny !== undefined || r.isError === true) return r
    const abs = toolPath(e)
    const rel = abs === undefined ? undefined : relativePath(abs, await $.session.root())
    const mark: Touch = isEdit ? 'edit' : 'read'
    if (rel !== undefined) await update($, touched, t => (t[rel] === 'edit' ? t : { ...t, [rel]: mark }))
    return r
  })
}

// A path with its folder dimmed, as one Button's children.
function pathParts(path: string): { dir: string; name: string } {
  const at = path.lastIndexOf('/')
  return { dir: path.slice(0, at + 1), name: path.slice(at + 1) }
}

// The Work pane's Files tab: a card of the files Claude touched this
// session, a filter, then the codemap tree.
export async function filesTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Button, Input, Text } = els
  const rich = isRich(e)
  const view = await read($, codemap)
  const marks = await read($, touched)
  const edits = await read($, changes)
  const query = await read($, fileFilter)
  const touchedCard = touchedFiles()
  if (view.error) return <Text color="error">{view.error}</Text>
  if (!view.tree) {
    return (
      <Box flexDirection="column">
        {touchedCard}
        <Text dimColor>No .claude/codemap.md yet. Run /update-codemap.</Text>
      </Box>
    )
  }
  const status = await read($, git)
  const changedOnly = await read($, isChangedOnly)
  const root = mergedRoot(view.tree, status)
  const rows = visibleRows(root, await read($, open), marks, {
    git: status.marks,
    stale: status.stale,
    branch: status.branch,
    isChangedOnly: changedOnly,
  })
  const found = filterFiles(root, query, MAX_FOUND)
  const toggle = (key: string) => update($, open, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
  const changedCount = new Set([...Object.keys(status.marks), ...status.branch]).size
  const tourView = await read($, tour)
  const at = await read($, tourStop)
  const isMapPage = await read($, hasMapPage)

  return (
    <Box flexDirection="column">
      {touchedCard}
      {tourCard()}
      <Box gap={1} alignItems="center">
        <Box flexGrow={1}>
          <Input
            key="file-filter"
            placeholder="Filter files"
            value={query}
            onInput={value => update($, fileFilter, () => value)}
            onSubmit={value => update($, fileFilter, () => value)}
          />
        </Box>
        <Button
          key="changed-only"
          label={changedOnly ? 'All files' : `Changed only (${changedCount})`}
          onPress={() => update($, isChangedOnly, v => !v)}
        />
        {isMapPage ? <Button key="open-map" label="Open map" onPress={() => openMapPage($)} /> : null}
      </Box>
      <Box justifyContent="space-between" gap={1} marginTop={1}>
        {label(els, `ALL FILES · ${view.tree.fileCount}`)}
        <Text size="caption" dimColor>
          codemap {view.tree.updated || 'date unknown'}
          {status.stale.length > 0 ? <Text color="warning"> · {status.stale.length} newer</Text> : null}
          {status.branch.length > 0 ? <Text color="merged"> · • {status.branch.length} in branch</Text> : null}
        </Text>
      </Box>
      {query.trim() !== '' ? (
        found.length === 0 ? (
          <Text dimColor>No file path holds "{query.trim()}".</Text>
        ) : (
          found.map(path => {
            const p = pathParts(path)
            return (
              <Text wrap="truncate-end">
                <Text dimColor>{p.dir}</Text>
                {p.name}
              </Text>
            )
          })
        )
      ) : (
        <Box flexDirection="column">
          {changedOnly && rows.length === 0 && <Text dimColor>No changed, read or edited files.</Text>}
          {rows.map(row => (
            <Box gap={1}>
              <Text>{'  '.repeat(row.depth)}</Text>
              <Text color={row.git ? GIT_COLOR[row.git] : undefined}>{row.git ?? ' '}</Text>
              {row.canOpen ? (
                <Button key={row.key} plain label={`${row.isOpen ? '▾' : '▸'} ${row.label}`} onPress={() => toggle(row.key)} />
              ) : (
                <Text>
                  {'  '}
                  {row.label}
                </Text>
              )}
              {row.touch && <Text color={row.touch === 'edit' ? 'warning' : 'suggestion'}>{row.touch === 'edit' ? '●' : '○'}</Text>}
              {row.isStale && <Text color="warning">⟳</Text>}
              {row.isBranch && <Text color="merged">•</Text>}
              {row.detail !== '' && (
                <Text dimColor wrap="truncate-end">
                  {row.detail}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )

  // Shows stop i and opens the folders that hold its file in the tree.
  async function goToStop(i: number): Promise<void> {
    const file = tourView.stops[i]?.file
    if (file === undefined) return
    await update($, tourStop, () => i)
    await update($, open, list => [...new Set([...list, ...foldersOf(file)])])
  }

  // The guided tour as a list: the stop shown has its reason under it.
  function tourCard(): RenderElement | null {
    if (tourView.error) return <Text color="error">{tourView.error}</Text>
    const { stops } = tourView
    if (stops.length === 0) return null
    const shown = at !== null && at < stops.length ? at : null
    return (
      <Box flexDirection="column" marginBottom={1} {...card(rich)}>
        <Box justifyContent="space-between" gap={1}>
          {label(els, `GUIDED TOUR · ${stops.length} ${stops.length === 1 ? 'STOP' : 'STOPS'}`)}
          <Button
            key="tour-toggle"
            plain
            label={shown === null ? 'Start' : 'Close'}
            onPress={() => (shown === null ? goToStop(0) : update($, tourStop, () => null))}
          />
        </Box>
        {tourView.isDraft ? <Text size="caption" dimColor>Draft: the reasons are not checked against the code yet.</Text> : null}
        {shown === null
          ? null
          : stops.map((s, i) =>
              i === shown ? (
                <Box flexDirection="column">
                  <Text color="suggestion" weight="semibold">
                    ▸ {i + 1}. {s.title}
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {s.file}:{s.line}
                  </Text>
                  {s.why === '' ? null : <Text>{s.why}</Text>}
                </Box>
              ) : (
                <Button key={`tour-${i}`} plain label={`${i + 1}. ${s.title}`} onPress={() => goToStop(i)} />
              ),
            )}
        {shown === null ? null : (
          <Box gap={1} marginTop={1}>
            {shown > 0 ? <Button key="tour-prev" label="Previous" onPress={() => goToStop(shown - 1)} /> : null}
            {shown < stops.length - 1 ? (
              <Button key="tour-next" label="Next" onPress={() => goToStop(shown + 1)} />
            ) : (
              <Button key="tour-done" label="Done" onPress={() => update($, tourStop, () => null)} />
            )}
          </Box>
        )}
      </Box>
    )
  }

  async function showChange(path: string): Promise<void> {
    await update($, shownChange, () => path)
    await showTab($, 'changes')
  }

  // Edits first, then reads. A file with hunks in Changes opens them there;
  // any other puts a question about it in the reply box.
  function touchedFiles(): RenderElement | null {
    const list = Object.entries(marks).sort(([a, x], [b, y]) => (x === y ? a.localeCompare(b) : x === 'edit' ? -1 : 1))
    if (list.length === 0) return null
    return (
      <Box flexDirection="column" marginBottom={1} {...card(rich)}>
        {label(els, `CLAUDE TOUCHED · ${list.length} ${list.length === 1 ? 'FILE' : 'FILES'}`)}
        {list.slice(0, MAX_TOUCHED).map(([path, mark]) => {
          const p = pathParts(path)
          const change = edits.find(c => c.rel === path)
          const adds = change?.hunks.reduce((n, h) => n + h.adds, 0) ?? 0
          const dels = change?.hunks.reduce((n, h) => n + h.dels, 0) ?? 0
          return (
            <Box justifyContent="space-between" gap={1}>
              <Button
                key={`touched-${path}`}
                plain
                label={path}
                onPress={() => (change !== undefined ? showChange(path) : fillReply($, `About ${path}: `))}
              >
                <Text dimColor>{p.dir}</Text>
                {p.name}
              </Button>
              <Box gap={1} flexShrink={0}>
                {change === undefined ? null : (
                  <Text dimColor tabular mono>
                    +{adds} −{dels}
                  </Text>
                )}
                {chip(els, rich, mark === 'edit' ? 'Edited' : 'Read', mark === 'edit' ? 'warn' : 'run')}
              </Box>
            </Box>
          )
        })}
        {list.length > MAX_TOUCHED ? <Text dimColor>and {list.length - MAX_TOUCHED} more</Text> : null}
      </Box>
    )
  }
}
