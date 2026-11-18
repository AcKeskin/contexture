// Opening the Work pane and the tab it shows. Kept apart from work-pane.tsx so
// the tab modules can open it without importing the pane.
import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { WorkTab } from '../types'

// Prefixed: another plugin holding the same pane id would make the open reject.
export const PANE = 'contexture-work'
const TITLE = 'Work'
// Set when the person closes the pane, cleared by any command that opens it.
// In $.store so reloads and new sessions keep it closed.
export const CLOSED_KEY = 'isWorkPaneClosed'

// work-pane.tsx declares this same atom: the engine reads atoms per file.
const tab = atom({ plugin: 'contexture-ui', key: 'tab' } as const, 'plan' as WorkTab, { shape: 'tab-1' })

// Opened by a command: on the given tab, and no longer held closed.
export async function openWork($: EngineInterface, at?: WorkTab): Promise<boolean> {
  await $.store.delete(CLOSED_KEY)
  if (at) await update($, tab, () => at)
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  return opened.isPlaced
}

// Opened at session start, unless the person closed it.
export async function openWorkUnasked($: EngineInterface): Promise<void> {
  if ((await $.store.get(CLOSED_KEY)) === true) return
  void $.ui.open({ id: PANE, title: TITLE })
}

// Moves the open pane to a tab.
export async function showTab($: EngineInterface, at: WorkTab): Promise<void> {
  await update($, tab, () => at)
}
