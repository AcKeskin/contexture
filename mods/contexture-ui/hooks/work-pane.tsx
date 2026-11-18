// The Work pane: one pane beside the chat with a tab per view, the same
// tabs as ClauDeck's Focus panel.
import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { ChainView, WorkTab } from '../types'
import { agentsCount, agentsTab } from './agents-tab'
import { commandOf, stepMarks } from './chain'
import { changesCount, changesTab } from './changes-tab'
import { filesTab } from './files-tab'
import { nowStrip } from './now-band'
import { planCount, planTab } from './plan-tab'
import { problemsCount, problemsTab } from './problems-tab'
import { runBar } from './run-bar'
import { CLOSED_KEY, PANE } from './work-open'

// Same atom as work-open.ts's: keep the two declarations alike.
const tab = atom({ plugin: 'contexture-ui', key: 'tab' } as const, 'plan' as WorkTab, { shape: 'tab-1' })
// Same atom as register.tsx's: keep the two declarations alike.
const chain = atom({ plugin: 'contexture-ui', key: 'chain' } as const, { slugs: [], scopes: [] } as ChainView, {
  shape: 'chain-2',
})

const TABS: ReadonlyArray<{ id: WorkTab; label: string }> = [
  { id: 'files', label: 'Files' },
  { id: 'changes', label: 'Changes' },
  { id: 'problems', label: 'Problems' },
  { id: 'plan', label: 'Plan' },
  { id: 'agents', label: 'Agents' },
]

// /work is answered in register.tsx, which owns the refresh it runs first.
export function registerWorkPane(on: On): void {
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') await $.store.set(CLOSED_KEY, true)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const view = await read($, chain)
    // A minimized pane on the desktop: one line that reads at a glance.
    if (e.props.placement === 'widget') return <Text>{glance(view)}</Text>

    const at = await read($, tab)
    const body =
      at === 'files'
        ? await filesTab($, e)
        : at === 'changes'
          ? await changesTab($, e)
          : at === 'problems'
            ? await problemsTab($, e)
            : at === 'agents'
              ? await agentsTab($, e)
              : await planTab($, e)

    const bar = await runBar($, e)
    const strip = await nowStrip($, e)
    // Each tab says what waits in it, so you see it without opening the tab.
    const count: Partial<Record<WorkTab, string>> = {
      changes: String((await changesCount($)) || ''),
      problems: String((await problemsCount($)) || ''),
      plan: await planCount($),
      agents: String((await agentsCount($)) || ''),
    }

    // The whole pane: tabs and run bar on top, the tab's body takes the free
    // rows, so the footer sits on the pane's bottom edge. Inline above the
    // prompt the frame fits the tree, so there it takes only what it needs.
    return (
      <Box
        flexDirection="column"
        width={e.props.bodyColumns}
        minHeight={e.props.placement === 'inline' ? undefined : e.props.scroll.bodyRows}
      >
        {strip === null ? null : <Box marginBottom={1}>{strip}</Box>}
        <Box gap={1} flexWrap="wrap">
          {TABS.map(t => (
            <Button
              key={`tab-${t.id}`}
              label={count[t.id] ? `${t.label} ${count[t.id]}` : t.label}
              variant={t.id === at ? 'primary' : 'secondary'}
              onPress={() => update($, tab, () => t.id)}
            />
          ))}
        </Box>
        <Box marginTop={1}>{bar}</Box>
        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {body}
        </Box>
        <Box marginTop={1}>
          <Text dimColor wrap="wrap">
            Rules primed: {view.scopes.length > 0 ? view.scopes.join(', ') : 'none yet'}
          </Text>
        </Box>
      </Box>
    )
  })
}

// The slug with a plan in progress, else the first one: its step and next command.
function glance(view: ChainView): string {
  const withSteps = view.slugs.filter(s => s.steps.length > 0)
  const s = withSteps.find(x => stepMarks(x, view.progress).some(st => st.mark === 'done')) ?? withSteps[0] ?? view.slugs[0]
  if (s === undefined) return 'Work: no specs or plans yet'
  const marks = stepMarks(s, view.progress)
  const done = marks.filter(st => st.mark === 'done').length
  const next = commandOf(s.next)
  return marks.length > 0 ? `${s.slug} · ${done}/${marks.length} steps · next ${next}` : `${s.slug} · next ${next}`
}
