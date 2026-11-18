// Reads the scope-chain files and rule-prime's watermark through $.fs.
// A missing file or folder is a normal state here (a stage not started yet),
// so those reads resolve to undefined or [] on purpose.

import type { EngineInterface } from 'claude-code'

import { parseIndex } from './chain'
import type { SlugFiles, Versioned } from './chain'

function readOrNone($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).then(
    text => text,
    () => undefined,
  )
}

function namesIn($: EngineInterface, path: string): Promise<string[]> {
  return $.fs.list(path).then(
    entries => entries.map(e => e.name),
    () => [],
  )
}

const highestVersion = (names: string[]): number | undefined => {
  const versions = names.flatMap(n => {
    const m = /^v(\d+)\.md$/.exec(n)
    return m ? [Number(m[1])] : []
  })
  return versions.length > 0 ? Math.max(...versions) : undefined
}

// Active version per INDEX.md, else the highest vN.md in the slug's folder.
async function activeFile($: EngineInterface, dir: string, slug: string, indexed?: number): Promise<Versioned | undefined> {
  const version = indexed ?? highestVersion(await namesIn($, `${dir}/${slug}`))
  if (version === undefined) return undefined
  const text = await readOrNone($, `${dir}/${slug}/v${version}.md`)
  return text === undefined ? undefined : { version, text }
}

const LIVE = new Set(['active', 'draft', ''])

export async function loadFiles($: EngineInterface): Promise<Map<string, SlugFiles>> {
  const base = `${await $.session.root()}/.claude`
  const specIndex = parseIndex((await readOrNone($, `${base}/specs/INDEX.md`)) ?? '')
  const planIndex = parseIndex((await readOrNone($, `${base}/plans/INDEX.md`)) ?? '')
  const archived = new Set(
    (await namesIn($, `${base}/archive`)).flatMap(n => {
      const m = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(n)
      return m && m[1] ? [m[1]] : []
    }),
  )

  const slugs = new Set<string>()
  for (const [slug, row] of [...specIndex, ...planIndex]) if (LIVE.has(row.status)) slugs.add(slug)

  const found = new Map<string, SlugFiles>()
  for (const slug of [...slugs].sort()) {
    if (archived.has(slug)) continue
    const [spec, plan, visionFiles, blueprintFiles] = await Promise.all([
      activeFile($, `${base}/specs`, slug, specIndex.get(slug)?.version),
      activeFile($, `${base}/plans`, slug, planIndex.get(slug)?.version),
      namesIn($, `${base}/visions/${slug}`),
      namesIn($, `${base}/docs/${slug}`),
    ])
    found.set(slug, {
      hasVision: highestVersion(visionFiles) !== undefined,
      hasBlueprint: highestVersion(blueprintFiles) !== undefined,
      ...(spec ? { spec } : {}),
      ...(plan ? { plan } : {}),
    })
  }
  return found
}

// Scopes rule-prime recorded for this session in ~/.claude/session-state.json.
export async function loadScopes($: EngineInterface): Promise<string[]> {
  // os.homedir() order, as rule-prime uses: USERPROFILE on Windows, else HOME.
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return []
  const raw = await readOrNone($, `${home}/.claude/session-state.json`)
  if (raw === undefined) return []
  const sid = await $.session.id()
  try {
    const scopes = JSON.parse(raw)?.rulePrime?.[sid]?.scopes
    return Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === 'string') : []
  } catch {
    // rule-prime writes this file atomically; a parse failure means another
    // writer's partial file. Show no scopes until the next refresh.
    return []
  }
}
