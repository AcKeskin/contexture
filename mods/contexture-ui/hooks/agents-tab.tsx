// The Work pane's Agents tab: this session's subagents as $.agent.list()
// gives them, with what each last did. Refreshed at each subagent step and
// each turn end, so a row's clock moves when its agent does.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { AgentNote, AgentRow, AgentView } from '../types'
import { CONVERGE, detailLine, headLine, isLive, isReadyToConverge, nextNote, sortRows, titleLine } from './agents'
import { card, chip, isRich } from './look'
import { toolSummary } from './now'
import { fillReply } from './reply'

// `at` is when the rows were last drawn from: a row's clock counts to it.
const agents = atom(
  { plugin: 'contexture-ui', key: 'agents' } as const,
  { rows: [], at: 0, clearedAt: 0, convergedAt: 0 } as AgentView,
  { shape: 'agents-2' },
)
const notes = atom({ plugin: 'contexture-ui', key: 'agentNotes' } as const, {} as Record<string, AgentNote>, {
  shape: 'agent-notes-1',
})
const MAX_ROWS = 20

async function readRows($: EngineInterface): Promise<void> {
  const { clearedAt } = await read($, agents)
  const list = await $.agent.list()
  const rows: AgentRow[] = sortRows(
    list
      .filter(a => a.startTime > clearedAt)
      .map(a => ({
        id: a.id,
        type: a.type,
        description: a.description,
        status: a.status,
        startTime: a.startTime,
        cwd: a.cwd,
        parentId: a.parentId,
        isTeammate: a.kind === 'in_process_teammate',
        hasRow: a.hasRow,
      })),
  ).slice(0, MAX_ROWS)
  const at = await $.clock.now()
  const ids = new Set(rows.map(r => r.id))
  await update($, agents, v => (JSON.stringify(v.rows) === JSON.stringify(rows) ? v : { ...v, rows, at }))
  await update($, notes, n =>
    Object.keys(n).every(id => ids.has(id)) ? n : Object.fromEntries(Object.entries(n).filter(([id]) => ids.has(id))),
  )
}

// One read at a time: a call while one runs asks for one more after it and
// waits for that, so many agents stepping at once cost one list per round.
let reading: Promise<void> | undefined
let isAgain = false
export function loadAgents($: EngineInterface): Promise<void> {
  if (reading) {
    isAgain = true
    return reading
  }
  const run = async () => {
    try {
      do {
        isAgain = false
        await readRows($)
      } while (isAgain)
    } finally {
      reading = undefined
    }
  }
  reading = run()
  return reading
}

// The minute tick moves the clocks of rows still running.
export async function tickAgents($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, agents, v => (v.rows.some(r => r.status === 'running') ? { ...v, at } : v))
}

// /clear: agents started before it leave the tab.
export async function clearAgents($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, notes, () => ({}))
  await update($, agents, () => ({ rows: [], at: now, clearedAt: now, convergedAt: now }))
}

async function openAgent($: EngineInterface, id: string): Promise<void> {
  const r = await $.ui.view({ agentId: id })
  if (r.deny !== undefined) $.ui.toast(`Can't open that agent: ${r.deny}`)
}

async function converge($: EngineInterface): Promise<void> {
  await fillReply($, CONVERGE)
  const now = await $.clock.now()
  await update($, agents, v => ({ ...v, convergedAt: now }))
}

// A subagent's step: note what it did, then refresh the rows. register.tsx
// calls this from its turn.step hook (one per plugin) and loadAgents at each
// turn end. A failure here is logged, never passed to the loop.
export async function agentStep(
  $: EngineInterface,
  id: string,
  uses: ReadonlyArray<{ name: string; input: unknown }>,
): Promise<void> {
  try {
    await update($, notes, n => ({ ...n, [id]: nextNote(n[id], uses, toolSummary) }))
  } catch (err) {
    $.ui.log(`contexture-ui: Agents tab: ${String(err)}`)
  }
  // Not awaited: the agent's next request needn't wait for the list.
  loadAgents($).catch(err => $.ui.log(`contexture-ui: Agents tab: ${String(err)}`))
}

// For the tab label: live agents, as the heading counts them.
export async function agentsCount($: EngineInterface): Promise<number> {
  return (await read($, agents)).rows.filter(isLive).length
}

// A live agent gets a card with a running bar; a finished one is one line.
export async function agentsTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Button, Progress, Text } = els
  const rich = isRich(e)
  const { rows, at, convergedAt } = await read($, agents)
  const byId = await read($, notes)
  const root = await $.session.root()

  return (
    <Box flexDirection="column" gap={rich ? 1 : 0}>
      <Text weight="semibold">{headLine(rows)}</Text>
      {rows.map(row => {
        const t = titleLine(row, at)
        const detail = detailLine(row, byId[row.id], root)
        const open = row.hasRow ? <Button key={`view-${row.id}`} label="Open" onPress={() => openAgent($, row.id)} /> : null
        if (!isLive(row)) {
          const isOk = row.status === 'completed'
          return (
            <Box justifyContent="space-between" gap={1} alignItems="center">
              <Box gap={1} flexShrink={1}>
                <Text color={isOk ? 'success' : 'error'}>{t.mark}</Text>
                <Text wrap="truncate-end">{row.description}</Text>
              </Box>
              <Box gap={1} flexShrink={0} alignItems="center">
                <Text dimColor>{detail === '' ? t.clock : `${t.clock} · ${detail}`}</Text>
                {open}
              </Box>
            </Box>
          )
        }
        return (
          <Box flexDirection="column" {...card(rich)}>
            <Box justifyContent="space-between" gap={1}>
              <Box gap={1} flexShrink={1} alignItems="center">
                {chip(els, rich, row.type, row.status === 'running' ? 'run' : 'idle')}
                <Text wrap="truncate-end">{row.description}</Text>
              </Box>
              <Text color={row.status === 'running' ? 'suggestion' : undefined} dimColor={row.status !== 'running'} tabular>
                {t.clock}
              </Text>
            </Box>
            {row.status === 'running' ? <Progress label={`${row.type} ${row.description}`} color="suggestion" /> : null}
            <Box justifyContent="space-between" gap={1} alignItems="center">
              <Text dimColor mono wrap="truncate-end">
                {detail === '' ? 'starting' : detail}
              </Text>
              {open}
            </Box>
          </Box>
        )
      })}
      {isReadyToConverge(rows, convergedAt) ? (
        <Box>
          <Button key="converge" label="Converge" onPress={() => converge($)} />
        </Box>
      ) : null}
    </Box>
  )
}
