import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, ResolveInput } from 'claude-code'

import type { CodemapTree, CodemapView, GitMark, GitView, Touch, TreeNode } from '../types'
import { parseCodemap, parseCodemapJson, relativePath, visibleRows, withUnmapped } from './codemap'
import { parseGitStatus } from './git'
import { openWork } from './work-open'

const codemap = atom({ plugin: 'contexture-ui', key: 'codemap' } as const, { mtimeMs: 0 } as CodemapView, {
  shape: 'codemap-2',
})
const open = atom({ plugin: 'contexture-ui', key: 'open' } as const, [] as string[], { shape: 'open-1' })
const touched = atom({ plugin: 'contexture-ui', key: 'touched' } as const, {} as Record<string, Touch>, {
  shape: 'touched-1',
})
const NO_GIT: GitView = { marks: {}, stale: [] }
const git = atom({ plugin: 'contexture-ui', key: 'git' } as const, NO_GIT, { shape: 'git-1' })
const isChangedOnly = atom({ plugin: 'contexture-ui', key: 'isChangedOnly' } as const, false, { shape: 'changedOnly-1' })
const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const
// Files stat'ed for the stale mark, at most: a huge change set skips the rest.
const MAX_STAT = 200
const GIT_COLOR: Record<GitMark, 'warning' | 'success' | 'error' | undefined> = {
  M: 'warning',
  R: 'warning',
  A: 'success',
  '?': 'success',
  D: 'error',
}

// Re-reads the codemap and the work tree's git status.
export async function loadCodemap($: EngineInterface): Promise<void> {
  await loadCodemapFile($)
  await loadGit($)
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
  const changed = Object.entries(marks)
    .filter(([, m]) => m !== 'D')
    .slice(0, MAX_STAT)
    .map(([path]) => path)
  const stats = await Promise.all(changed.map(path => $.fs.stat(`${root}/${path}`).catch(() => undefined)))
  const stale = changed.filter((_, i) => (stats[i]?.mtimeMs ?? 0) > codemapMtime)
  return { marks, stale }
}

// The tree with unmapped changed files, kept while the codemap and the
// marks stay the same, so a redraw doesn't clone it.
let merged: { tree?: CodemapTree; marks?: GitView['marks']; root?: TreeNode } = {}

function mergedRoot(tree: CodemapTree, marks: GitView['marks']): TreeNode {
  if (merged.tree !== tree || merged.marks !== marks || !merged.root) {
    merged = { tree, marks, root: withUnmapped(tree, Object.keys(marks)) }
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

// The Work pane's Files tab.
export async function filesTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  const view = await read($, codemap)
  if (view.error) return <Text color="error">{view.error}</Text>
  if (!view.tree) return <Text dimColor>No .claude/codemap.md yet. Run /update-codemap.</Text>
  const status = await read($, git)
  const changedOnly = await read($, isChangedOnly)
  const rows = visibleRows(mergedRoot(view.tree, status.marks), await read($, open), await read($, touched), {
    git: status.marks,
    stale: status.stale,
    isChangedOnly: changedOnly,
  })
  const toggle = (key: string) => update($, open, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
  const changedCount = Object.keys(status.marks).length

  return (
    <Box flexDirection="column">
      <Box>
        <Button
          key="changed-only"
          label={changedOnly ? 'All files' : `Changed only (${changedCount})`}
          onPress={() => update($, isChangedOnly, v => !v)}
        />
        <Text dimColor>
          {' '}
          {view.tree.fileCount} files · updated {view.tree.updated || 'unknown'} · ● edited ○ read · ← importers · ⟳ newer
          than codemap
        </Text>
      </Box>
      {changedOnly && rows.length === 0 && <Text dimColor>No changed, read or edited files.</Text>}
      {rows.map(row => (
        <Box>
          <Text>{'  '.repeat(row.depth)}</Text>
          <Text color={row.git ? GIT_COLOR[row.git] : undefined}>{row.git ?? ' '} </Text>
          {row.canOpen ? (
            <Button key={row.key} plain label={`${row.isOpen ? '▾' : '▸'} ${row.label}`} onPress={() => toggle(row.key)} />
          ) : (
            <Text>
              {'  '}
              {row.label}
            </Text>
          )}
          {row.touch && <Text color={row.touch === 'edit' ? 'warning' : 'suggestion'}> {row.touch === 'edit' ? '●' : '○'}</Text>}
          {row.isStale && <Text dimColor> ⟳</Text>}
          {row.detail !== '' && <Text dimColor> {row.detail}</Text>}
        </Box>
      ))}
    </Box>
  )
}
