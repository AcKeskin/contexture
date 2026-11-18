import { expect, test } from 'claude-code/testing'

import { filterFiles, parseCodemap, parseCodemapJson, relativePath, visibleRows, withUnmapped } from '../hooks/codemap'
import { parseGitStatus } from '../hooks/git'
import { CODEMAP, CODEMAP_JSON } from './fixtures'


test('parses groups, nested folders, exports and importers', () => {
  const tree = parseCodemap(CODEMAP)
  expect(tree.fileCount).toBe(5)
  expect(tree.updated).toBe('2026-11-18')
  expect(tree.root.children.map(c => c.name)).toEqual(['hooks', 'tests', 'README.md'])
  const hooks = tree.root.children[0]
  expect(hooks?.children.map(c => c.name)).toEqual(['sub', 'chain.ts', 'load.ts'])
  const chain = hooks?.children[1]
  expect(chain?.exports.map(e => e.name)).toEqual(['parseIndex', 'planSteps', 'statusText'])
  expect(chain?.importers).toBe(2)
  expect(chain?.purpose).toBe('Scope-chain state')
})

test('rows open folders and files on demand and carry marks', () => {
  const tree = parseCodemap(CODEMAP)
  const closed = visibleRows(tree.root, [], {})
  expect(closed.map(r => r.label)).toEqual(['hooks/ (3)', 'tests/ (1)', 'README.md'])
  const rows = visibleRows(tree.root, ['hooks', 'hooks/chain.ts'], { 'hooks/chain.ts': 'edit' })
  expect(rows.map(r => `${r.depth}:${r.label}`)).toEqual([
    '0:hooks/ (3)',
    '1:sub/ (1)',
    '1:chain.ts',
    '2:parseIndex',
    '2:planSteps',
    '2:statusText',
    '1:load.ts',
    '0:tests/ (1)',
    '0:README.md',
  ])
  const chain = rows.find(r => r.key === 'hooks/chain.ts')
  expect(chain?.touch).toBe('edit')
  expect(chain?.detail).toBe('Scope-chain state · used by 2')
  expect(rows.find(r => r.key === 'hooks/load.ts')?.canOpen).toBe(false)
})

test('a file without the codemap sections gives an empty tree', () => {
  expect(parseCodemap('# nothing').fileCount).toBe(0)
})

test('relativePath strips the root on both separators', () => {
  expect(relativePath('/repo/hooks/a.ts', '/repo')).toBe('hooks/a.ts')
  expect(relativePath('C:\\repo\\hooks\\a.ts', 'C:\\repo')).toBe('hooks/a.ts')
  expect(relativePath('/other/a.ts', '/repo')).toBeUndefined()
  expect(relativePath('c:\\Repo\\a.ts', 'C:\\repo')).toBe('a.ts')
  expect(relativePath('/Repo/a.ts', '/repo')).toBeUndefined()
})

test('codemap.json gives exports with their line', () => {
  const tree = parseCodemapJson(CODEMAP_JSON)
  expect(tree.fileCount).toBe(2)
  expect(tree.updated).toBe('2026-11-18')
  const rows = visibleRows(tree.root, ['hooks', 'hooks/chain.ts'], {})
  expect(rows.map(r => `${r.label}${r.detail === '' ? '' : ' ' + r.detail}`)).toEqual([
    'hooks/ (2)',
    'chain.ts Scope-chain state · used by 1',
    'parseIndex :3',
    'load.ts Reads files',
  ])
})

test('text that is not a codemap JSON throws', () => {
  expect(() => parseCodemapJson('{"version":1}')).toThrow()
})

test('git status reads one mark per path, under the session root', () => {
  const z = ' M hooks/load.ts\0?? hooks/new file.ts\0A  docs/x.md\0R  hooks/b.ts\0hooks/a.ts\0 R hooks/c.ts\0hooks/d.ts\0 D README.md\0'
  expect(parseGitStatus(z)).toEqual({
    'hooks/load.ts': 'M',
    'hooks/new file.ts': '?',
    'docs/x.md': 'A',
    'hooks/b.ts': 'R',
    'hooks/c.ts': 'R',
    'README.md': 'D',
  })
  expect(parseGitStatus(' M mod/hooks/load.ts\0 M other/x.ts\0', 'mod/')).toEqual({ 'hooks/load.ts': 'M' })
  // Cut output: the last entry may be partial, so it is dropped.
  expect(parseGitStatus(' M a.ts\0 M b.t', '', true)).toEqual({ 'a.ts': 'M' })
})

test('changed-only keeps marked files, opens their folders and adds files the codemap lacks', () => {
  const tree = parseCodemap(CODEMAP)
  const marks = { git: { 'hooks/load.ts': 'M', 'hooks/new.ts': '?' } as const, stale: ['hooks/load.ts'], isChangedOnly: true }
  const root = withUnmapped(tree, Object.keys(marks.git))
  const rows = visibleRows(root, [], { 'README.md': 'read' }, marks)
  expect(rows.map(r => `${r.depth}:${r.label}:${r.git ?? ''}`)).toEqual(['0:hooks/ (3):', '1:load.ts:M', '1:new.ts:?', '0:README.md:'])
  expect(rows.find(r => r.key === 'hooks/load.ts')?.isStale).toBe(true)
  expect(rows.find(r => r.key === 'hooks/new.ts')?.detail).toBe('not in codemap yet')
  expect(rows[0]?.canOpen).toBe(false)
  // The parsed tree is left as it was.
  expect(tree.root.children[0]?.children.map(c => c.name)).toEqual(['sub', 'chain.ts', 'load.ts'])
  expect(withUnmapped(tree, ['hooks/load.ts'])).toBe(tree.root)
})

test('a changed folder (a submodule) stays in changed-only', () => {
  const tree = parseCodemap(CODEMAP)
  const rows = visibleRows(tree.root, [], {}, { git: { 'hooks/sub': 'M' }, stale: [], isChangedOnly: true })
  expect(rows.map(r => `${r.label}:${r.git ?? ''}`)).toEqual(['hooks/ (3):', 'sub/ (1):M'])
})

test('filterFiles finds paths by any part, any case, up to the limit', () => {
  const root = parseCodemap(CODEMAP).root
  expect(filterFiles(root, 'HOOKS/CHAIN', 10)).toEqual(['hooks/chain.ts'])
  expect(filterFiles(root, 'hooks/', 1)).toHaveLength(1)
  expect(filterFiles(root, '  ', 10)).toEqual([])
})
