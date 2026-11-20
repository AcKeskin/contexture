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

// This session's entry in rule-prime's watermark, ~/.claude/session-state.json.
async function ruleMark($: EngineInterface): Promise<Record<string, unknown> | undefined> {
  // os.homedir() order, as rule-prime uses: USERPROFILE on Windows, else HOME.
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return undefined
  const raw = await readOrNone($, `${home}/.claude/session-state.json`)
  if (raw === undefined) return undefined
  const sid = await $.session.id()
  try {
    const mark: unknown = JSON.parse(raw)?.rulePrime?.[sid]
    return typeof mark === 'object' && mark !== null ? (mark as Record<string, unknown>) : undefined
  } catch {
    // rule-prime writes this file atomically; a parse failure means another
    // writer's partial file. Read nothing until the next refresh.
    return undefined
  }
}

// Scopes rule-prime recorded for this session.
export async function loadScopes($: EngineInterface): Promise<string[]> {
  const scopes = (await ruleMark($))?.scopes
  return Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === 'string') : []
}

// The rules-cli.js path rule-prime recorded for this session.
export async function loadRulesCli($: EngineInterface): Promise<string | undefined> {
  const cli = (await ruleMark($))?.rulesCli
  return typeof cli === 'string' && cli !== '' ? cli : undefined
}
