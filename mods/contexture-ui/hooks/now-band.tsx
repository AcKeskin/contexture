// The now line as a band above the prompt, from the first model request of a
// turn to its end. It hooks no tool.call: a hook there turns off a Bash
// call's move to the background.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { NowState } from '../types'
import { fromToolUses, nowParts, toolSummary } from './now'

const TICK_MS = 1000
const now = atom({ plugin: 'contexture-ui', key: 'now' } as const, null as NowState | null, { shape: 'now-1' })
// Bumped each second while a turn runs, so the band's clock redraws.
const nowAt = atom({ plugin: 'contexture-ui', key: 'nowAt' } as const, 0, { shape: 'nowAt-1' })

export function startNowClock($: EngineInterface): void {
  $.clock.every(TICK_MS, () => {
    tickNow($).catch(err => $.ui.log(`contexture-ui: now tick failed: ${String(err)}`))
  })
}

async function tickNow($: EngineInterface): Promise<void> {
  if ((await read($, now)) === null) return
  const at = await $.clock.now()
  await update($, nowAt, () => at)
}

async function setNow($: EngineInterface, state: NowState): Promise<void> {
  await update($, now, () => state)
  const at = await $.clock.now()
  await update($, nowAt, () => at)
}

// A main-loop model request is starting: Claude is working. Keeps the clock
// of a request that follows another.
export async function nowModel($: EngineInterface): Promise<void> {
  const prior = await read($, now)
  if (prior?.kind === 'claude') return
  await setNow($, { kind: 'claude', what: 'writing', since: await $.clock.now() })
}

// The request ended asking for tools: the session now waits on them.
export async function nowTools($: EngineInterface, uses: ReadonlyArray<{ name: string; input: unknown }>): Promise<void> {
  const state = fromToolUses(uses, await $.clock.now())
  if (state) await setNow($, state)
}

export async function nowClear($: EngineInterface): Promise<void> {
  await update($, now, () => null)
}

export function registerNowBand(on: On, isShown: boolean): void {
  // An ask a person can answer puts the session on them, until the next
  // request. A subagent's ask counts too. Only a call's own check counts: a
  // plugin's $.tool.check query carries no tool_use_id, and an idle session
  // (no turn running) waits on nobody.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision !== 'ask' || e.approver !== 'person' || e.tool_use_id === undefined) return r
    if ((await read($, now)) === null) return r
    await setNow($, { kind: 'you', what: `approve ${toolSummary(e.tool, e.input)}`, since: await $.clock.now() })
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, now)
    if (!isShown || !e.props.isWorking || e.props.hasSurvey || state === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const parts = nowParts(state, await read($, nowAt))

    return (
      <Box>
        <Text weight="semibold" color={state.kind === 'you' ? 'warning' : undefined}>
          {parts.label}
        </Text>
        <Text> {parts.what} </Text>
        <Text dimColor>· {parts.clock}</Text>
      </Box>
    )
  })
}
