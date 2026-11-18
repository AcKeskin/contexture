// .claude/codemap.json (or .claude/codemap.md when there is no JSON) as a tree:
// folders, files with their purpose line and exports, importer counts. Pure: no $.
// Layout from skills/update-codemap/spec.md §6 and §9. Idea from
// data-goblin/claude-code-filetree (MIT), fed by the codemap instead of a
// directory walk.

import type { CodemapTree, GitMark, TreeNode, TreeRow, Touch } from '../types'

const GROUP = /^## (.+\/)\s*$/
const FILE = /^- `([^`]+)`(?: — (.*))?$/
const EXPORTS = /^ {2}exports: (.*)$/
const DEP = /^- `([^`]+)` → (.+)$/

function dirNode(name: string, path: string): TreeNode {
  return { name, path, isDir: true, purpose: '', exports: [], importers: 0, children: [] }
}

function insert(root: TreeNode, file: TreeNode): void {
  const parts = file.path.split('/')
  let at = root
  for (let i = 0; i < parts.length - 1; i++) {
    const path = parts.slice(0, i + 1).join('/')
    let next = at.children.find(c => c.isDir && c.path === path)
    if (!next) {
      next = dirNode(parts[i] ?? '', path)
      at.children.push(next)
    }
    at = next
  }
  at.children.push(file)
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  node.children.forEach(sortTree)
}

export function parseCodemap(md: string): CodemapTree {
  const root = dirNode('', '')
  const importers = new Map<string, number>()
  let section = ''
  let last: TreeNode | undefined
  let fileCount = 0
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      section = GROUP.test(line) ? 'group' : line.slice(3).trim()
      last = undefined
      continue
    }
    if (section === 'File deps') {
      const dep = DEP.exec(line)
      for (const t of dep?.[2]?.matchAll(/`([^`]+)`/g) ?? []) {
        if (t[1]) importers.set(t[1], (importers.get(t[1]) ?? 0) + 1)
      }
      continue
    }
    if (section !== 'group') continue
    const ex = EXPORTS.exec(line)
    if (ex && last) {
      last.exports = (ex[1] ?? '')
        .split(' ; ')
        .map(e => e.split(' — ')[0]?.trim() ?? '')
        .filter(e => e !== '')
        .map(name => ({ name }))
      continue
    }
    const f = FILE.exec(line)
    if (!f || !f[1]) continue
    const path = f[1]
    last = { ...dirNode(path.split('/').at(-1) ?? path, path), isDir: false, purpose: (f[2] ?? '').trim() }
    insert(root, last)
    fileCount++
  }
  const count = (n: TreeNode): void => {
    n.importers = importers.get(n.path) ?? 0
    n.children.forEach(count)
  }
  count(root)
  sortTree(root)
  const updated = /^Last updated: (\S+)/m.exec(md)?.[1] ?? ''
  return { root, fileCount, updated }
}

type JsonSymbol = { name?: unknown; line?: unknown; exported?: unknown }
type JsonFile = { purpose?: unknown; importedBy?: unknown; symbols?: unknown }

// codemap.json from update-codemap: exports carry their line. Throws on text that is
// not a codemap JSON, so the caller shows the error.
export function parseCodemapJson(text: string): CodemapTree {
  const data: unknown = JSON.parse(text)
  if (typeof data !== 'object' || data === null || !('files' in data)) throw new Error('no files in codemap.json')
  const { files, updated } = data as { files: Record<string, JsonFile>; updated?: unknown }
  const root = dirNode('', '')
  let fileCount = 0
  for (const [path, f] of Object.entries(files)) {
    const symbols = Array.isArray(f.symbols) ? (f.symbols as JsonSymbol[]) : []
    const exports = symbols
      .filter(s => s.exported === true && typeof s.name === 'string')
      .map(s => ({ name: s.name as string, ...(typeof s.line === 'number' ? { line: s.line } : {}) }))
    insert(root, {
      ...dirNode(path.split('/').at(-1) ?? path, path),
      isDir: false,
      purpose: typeof f.purpose === 'string' ? f.purpose : '',
      exports,
      importers: Array.isArray(f.importedBy) ? f.importedBy.length : 0,
    })
    fileCount++
  }
  sortTree(root)
  return { root, fileCount, updated: typeof updated === 'string' ? updated : '' }
}

// Files the codemap lists: added changed files don't count.
function fileTotal(node: TreeNode): number {
  return node.isDir ? node.children.reduce((sum, c) => sum + fileTotal(c), 0) : node.isUnmapped ? 0 : 1
}

export type FileMarks = {
  git: Readonly<Record<string, GitMark>>
  // Changed files written after the codemap.
  stale: readonly string[]
  isChangedOnly: boolean
}
const NO_MARKS: FileMarks = { git: {}, stale: [], isChangedOnly: false }

function cloneNode(n: TreeNode): TreeNode {
  return { ...n, exports: [...n.exports], children: n.children.map(cloneNode) }
}

function hasFile(node: TreeNode, path: string): boolean {
  return node.path === path || node.children.some(c => path.startsWith(c.path) && hasFile(c, path))
}

// The tree plus the changed files the codemap does not list yet. Clones
// only when one is missing; callers keep the result while marks hold.
export function withUnmapped(tree: CodemapTree, paths: readonly string[]): TreeNode {
  const missing = paths.filter(p => !hasFile(tree.root, p))
  if (missing.length === 0) return tree.root
  const root = cloneNode(tree.root)
  for (const path of missing) {
    insert(root, { ...dirNode(path.split('/').at(-1) ?? path, path), isDir: false, isUnmapped: true })
  }
  sortTree(root)
  return root
}

function hasMarked(node: TreeNode, isMarked: (path: string) => boolean): boolean {
  // A changed folder (a submodule) counts as marked itself.
  return isMarked(node.path) || (node.isDir && node.children.some(c => hasMarked(c, isMarked)))
}

// Rows to draw from a tree (withUnmapped's): open folders show their
// children; an open file shows its exports. Touched marks a file Claude read
// or edited this session, git a file changed in the work tree. Changed-only
// keeps marked files and opens every folder that holds one.
export function visibleRows(
  root: TreeNode,
  open: readonly string[],
  touched: Readonly<Record<string, Touch>>,
  marks: FileMarks = NO_MARKS,
): TreeRow[] {
  const isOpen = new Set(open)
  const stale = new Set(marks.stale)
  const isMarked = (path: string): boolean => marks.git[path] !== undefined || touched[path] !== undefined
  const rows: TreeRow[] = []
  const walk = (node: TreeNode, depth: number): void => {
    for (const c of node.children) {
      if (marks.isChangedOnly && !hasMarked(c, isMarked)) continue
      const opened = isOpen.has(c.path) || (marks.isChangedOnly && c.isDir)
      const touch = touched[c.path]
      const git = marks.git[c.path]
      rows.push({
        key: c.path,
        depth,
        isDir: c.isDir,
        isOpen: opened,
        label: c.isDir ? `${c.name}/ (${fileTotal(c)})` : c.name,
        detail: c.isDir
          ? ''
          : c.isUnmapped
            ? git === 'D'
              ? 'deleted'
              : 'not in codemap'
            : [c.importers > 0 ? `← ${c.importers}` : '', c.purpose].filter(s => s !== '').join('  '),
        // Changed-only holds every folder open, so folders don't toggle there.
        canOpen: c.isDir ? !marks.isChangedOnly && c.children.length > 0 : c.exports.length > 0,
        ...(touch ? { touch } : {}),
        ...(git ? { git } : {}),
        ...(stale.has(c.path) && !c.isUnmapped ? { isStale: true as const } : {}),
      })
      if (!opened) continue
      if (c.isDir) walk(c, depth + 1)
      else {
        for (const e of c.exports) {
          rows.push({ key: `${c.path}#${e.name}`, depth: depth + 1, isDir: false, isOpen: false, label: e.name, detail: e.line === undefined ? '' : `:${e.line}`, canOpen: false })
        }
      }
    }
  }
  walk(root, 0)
  return rows
}

// A tool's absolute path as the codemap spells it, or undefined outside root.
// Windows paths (a drive letter) compare without case.
export function relativePath(path: string, root: string): string | undefined {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/$/, '')
  const isWindows = /^[A-Za-z]:\//.test(r)
  const head = p.slice(0, r.length + 1)
  const isInside = isWindows ? head.toLowerCase() === (r + '/').toLowerCase() : head === r + '/'
  return isInside ? p.slice(r.length + 1) : undefined
}
