import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChainView, Progress } from '../types'
import { cacheText, coldWarning, contextOf, isCold, NO_CLOCK, ttlFrom, ttlSetting } from './cache'
import { agentStep, clearAgents, loadAgents, tickAgents } from './agents-tab'
import { clearChanges, registerChanges } from './changes-tab'
import { clearCodemapMarks, loadCodemap, registerCodemap, startCodemap } from './files-tab'
import { matchProgress, planSteps, resolveSlug, statusText } from './chain'
import { loadFiles, loadScopes } from './load'
import { openWork, openWorkUnasked } from './work-open'
import { registerWorkPane } from './work-pane'
import { setFocusLook } from './focus-look'
import { nowClear, nowModel, nowTools, registerNowBand, startNowClock } from './now-band'
import { clearProblems, loadProblems } from './problems-tab'

// The engine lists each file's state reads from atoms written in that file,
// so plan-tab.tsx declares this same atom. Change the tag in both when
// ChainView changes: it declines what an older version stored.
const chain = atom({ plugin: 'contexture-ui', key: 'chain' } as const, { slugs: [], scopes: [] } as ChainView, {
  shape: 'chain-2',
})

const cache = atom({ plugin: 'contexture-ui', key: 'cache' } as const, NO_CLOCK, { shape: 'cache-1' })
const TICK_MS = 60 * 1000
// The codemap-refresh hook regenerates .claude/codemap.md in the background after a turn:
// look again a few times so the pane shows it without waiting for the next turn.
const CODEMAP_RECHECK_MS = [3_000, 15_000, 45_000]

// Rows read back for /execute step lines at each turn's end.
const RECENT_ROWS = 200

// Re-reads .claude/ and the rule watermark; `recent` is assistant text read
// for /execute step lines.
async function refresh($: EngineInterface, recent = ''): Promise<ChainView> {
  const prior = await read($, chain)
  const files = await loadFiles($)
  const plans = [...files].map(([slug, f]) => ({ slug, steps: f.plan ? planSteps(f.plan.text) : [] }))
  const matched = matchProgress(recent, plans, prior.progress)
  const progress = pinVersion(matched, prior.progress, slug => files.get(slug)?.plan?.version)
  const view: ChainView = {
    slugs: [...files].map(([slug, f]) => resolveSlug(slug, f, progress)),
    scopes: await loadScopes($),
    ...(progress ? { progress } : {}),
  }
  await update($, chain, () => view)
  await showStatus($)
  return view
}

// New step lines run against the plan version active now; progress seen
// against an older version (or a slug gone from the indexes) is dropped,
// so a redrafted plan's steps don't read as done.
function pinVersion(
  matched: Progress | undefined,
  prior: Progress | undefined,
  versionOf: (slug: string) => number | undefined,
): Progress | undefined {
  if (!matched) return undefined
  const version = versionOf(matched.slug)
  if (version === undefined) return undefined
  const pinned = matched === prior ? matched : { ...matched, planVersion: version }
  return pinned.planVersion === version ? pinned : undefined
}

// One status entry for the mod: the chain part, then the cache part.
async function showStatus($: EngineInterface): Promise<void> {
  const view = await read($, chain)
  const clock = await read($, cache)
  const parts = [statusText(view), cacheText(clock, await $.clock.now())].filter((p): p is string => p !== undefined)
  $.ui.status(parts.length > 0 ? parts.join(' · ') : undefined)
}

// A toast once per cold spell; the next request clears isColdSaid.
async function warnIfCold($: EngineInterface): Promise<void> {
  const clock = await read($, cache)
  if (clock.isColdSaid || !isCold(clock, await $.clock.now())) return
  await update($, cache, c => ({ ...c, isColdSaid: true }))
  $.ui.toast(coldWarning(clock))
}

async function tick($: EngineInterface): Promise<void> {
  await warnIfCold($)
  await showStatus($)
}

export const register: Register = (on, options) => {
  registerCodemap(on)
  registerChanges(on)
  registerWorkPane(on)
  registerNowBand(on, options.nowLine !== false)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'work', description: 'Show the Work pane: files and plan' })
    await $.command.register({ name: 'chain', description: 'Show where each slug stands in the scope chain' })
    const view = await refresh($)
    await startCodemap($)
    if (options.focusColors === true) await setFocusLook($)
    if (options.nowLine !== false) startNowClock($)
    $.clock.every(TICK_MS, () => {
      tick($).catch(err => $.ui.log(`contexture-ui: cache tick failed: ${String(err)}`))
      tickAgents($).catch(err => $.ui.log(`contexture-ui: Agents tab: ${String(err)}`))
    })
    // Opened unasked only where a pane sits beside the chat, never inline in a terminal.
    if (e.surface !== null && e.surface !== 'terminal' && view.slugs.length > 0) await openWorkUnasked($)
    return started
  })

  on('command.run', { command: 'work' }, async $ => {
    await refresh($)
    await loadCodemap($)
    const isPlaced = await openWork($)
    return { text: isPlaced ? 'Work pane opened.' : 'This surface shows no panes.' }
  })

  on('command.run', { command: 'chain' }, async $ => {
    const view = await refresh($)
    const isPlaced = await openWork($, 'plan')
    return { text: isPlaced ? 'Work pane opened on Plan.' : (statusText(view) ?? 'No slugs in flight.') }
  })

  // A resumed session carries how long ago its last response was; /clear starts over.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const since = e.seconds_since_last_response
    if (e.source === 'clear') {
      // A new conversation: no run, no cache, a new session id for the rule scopes.
      await update($, cache, () => NO_CLOCK)
      await update($, chain, v => ({ slugs: v.slugs, scopes: v.scopes }))
      await clearCodemapMarks($)
      await clearChanges($)
      await clearProblems($)
      await clearAgents($)
      await refresh($)
      return r
    }
    if (typeof since === 'number') {
      const now = await $.clock.now()
      const setting = ttlSetting(await $.settings.read({ key: 'promptCacheTtl' }))
      await update($, cache, c => {
        const ttl = setting ?? c.ttlMs
        return {
          lastRequestAt: now - since * 1000,
          // The engine knows the TTL it resumed with; trust its "likely expired".
          ttlMs: e.prompt_cache_likely_expired === true ? Math.min(ttl, since * 1000) : ttl,
          contextTokens: e.context_tokens ?? c.contextTokens,
          isColdSaid: false,
        }
      })
    }
    await showStatus($)
    return r
  })

  // Each main-loop request rewrites or reads the cache: restart the clock.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const step = yield* next(e)
      await agentStep($, e.agentId, step.toolUses)
      return step
    }
    const sentAt = await $.clock.now()
    await nowModel($)
    const r = yield* next(e)
    await nowTools($, r.toolUses)
    const usage = r.usage
    const setting = ttlSetting(await $.settings.read({ key: 'promptCacheTtl' }))
    await update($, cache, c => ({
      lastRequestAt: sentAt,
      ttlMs: usage ? ttlFrom(usage, setting ?? c.ttlMs) : (setting ?? c.ttlMs),
      contextTokens: usage ? contextOf(usage) : c.contextTokens,
      isColdSaid: false,
    }))
    await showStatus($)
    return r
  })

  // Main loop only: a subagent's turn end does not move the chain.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await loadAgents($).catch(err => $.ui.log(`contexture-ui: Agents tab: ${String(err)}`))
    if (e.agentId !== undefined) return done
    await nowClear($)
    // Read all and keep the tail: `{ last }` is not in Claude Code 2.1.325.
    const rows = await $.session.messages()
    // A deny (not expected for a main-loop read) leaves the step lines out.
    const seen = Array.isArray(rows) ? rows.slice(-RECENT_ROWS) : []
    const recent = seen.filter(r => r.role === 'assistant').map(r => r.text)
    await refresh($, recent.join('\n'))
    await loadProblems($, seen)
    await loadCodemap($)
    for (const ms of CODEMAP_RECHECK_MS) {
      $.clock.after(ms, () => {
        loadCodemap($).catch(err => $.ui.log(`contexture-ui: codemap recheck failed: ${String(err)}`))
      })
    }
    return done
  })
}
