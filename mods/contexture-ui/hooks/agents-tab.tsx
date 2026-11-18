// The Work pane's Agents tab: this session's subagents as $.agent.list()
// gives them, with what each last did. Refreshed at each subagent step and
// each turn end, so a row's clock moves when its agent does.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { AgentNote, AgentRow, AgentView } from '../types'
import { CONVERGE, detailLine, headLine, isReadyToConverge, nextNote, sortRows, titleLine } from './agents'
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

async function open($: EngineInterface, id: string): Promise<void> {
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

export async function agentsTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  const { rows, at, convergedAt } = await read($, agents)
  const byId = await read($, notes)
  const root = await $.session.root()

  return (
    <Box flexDirection="column">
      <Text weight="semibold">{headLine(rows)}</Text>
      {rows.map(row => {
        const t = titleLine(row, at)
        const detail = detailLine(row, byId[row.id], root)
        return (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text>
                {t.mark} {t.title}
              </Text>
              <Text dimColor> {t.clock}</Text>
            </Box>
            {detail === '' ? null : <Text dimColor>{detail}</Text>}
            {row.hasRow ? <Button key={`view-${row.id}`} label="Open" onPress={() => open($, row.id)} /> : null}
          </Box>
        )
      })}
      {isReadyToConverge(rows, convergedAt) ? (
        <Box marginTop={1}>
          <Button key="converge" label="Converge" onPress={() => converge($)} />
        </Box>
      ) : null}
    </Box>
  )
}
