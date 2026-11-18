// The Work pane: one pane beside the chat with a tab per view, the same
// tabs as ClauDeck's Focus panel.
import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { WorkTab } from '../types'
import { agentsTab } from './agents-tab'
import { changesTab } from './changes-tab'
import { filesTab } from './files-tab'
import { planTab } from './plan-tab'
import { problemsTab } from './problems-tab'
import { runBar } from './run-bar'
import { CLOSED_KEY, PANE } from './work-open'

// Same atom as work-open.ts's: keep the two declarations alike.
const tab = atom({ plugin: 'contexture-ui', key: 'tab' } as const, 'plan' as WorkTab, { shape: 'tab-1' })

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
    const { Box, Button } = $.ui.resolve(e)
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

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>{bar}</Box>
        <Box marginBottom={1}>
          {TABS.map(t => (
            <Button
              key={`tab-${t.id}`}
              label={t.label}
              variant={t.id === at ? 'primary' : 'secondary'}
              onPress={() => update($, tab, () => t.id)}
            />
          ))}
        </Box>
        {body}
      </Box>
    )
  })
}
