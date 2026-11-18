// The Work pane's Problems tab: failing tests, type errors and lint from the
// test, type-check and lint commands Claude ran through Bash this
// conversation, by file. Fix this and Dispatch fill the reply box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput, SessionMessage } from 'claude-code'

import type { CheckRun, Problem } from '../types'
import { card, chip, fill, isRich } from './look'
import { allProblems, counts, dispatchText, fixText, latestRuns, RUN_CHECKS, summary } from './problems'
import type { BashUse } from './problems'
import { fillReply } from './reply'

const runs = atom({ plugin: 'contexture-ui', key: 'checks' } as const, [] as CheckRun[], { shape: 'checks-1' })
const picked = atom({ plugin: 'contexture-ui', key: 'picked' } as const, [] as string[], { shape: 'picked-1' })

// Bash calls with their output, oldest first, from the rows read at turn end.
function bashUses(rows: readonly SessionMessage[]): BashUse[] {
  return rows.flatMap(r =>
    r.toolUses.flatMap(u =>
      (u.tool === 'Bash' || u.tool === 'PowerShell') && typeof u.input.command === 'string' && u.text !== undefined
        ? [{ command: u.input.command, text: u.text, isError: u.isError === true, isBackground: u.input.run_in_background === true }]
        : [],
    ),
  )
}

// Reads the runs from this conversation's newest rows; picks of problems
// that no longer show are dropped.
export async function loadProblems($: EngineInterface, rows: readonly SessionMessage[]): Promise<void> {
  const found = latestRuns(bashUses(rows))
  // A kind with no run in these rows keeps its older run: the rows are only
  // the newest few hundred.
  const kept = await update($, runs, old => [...old.filter(r => !found.some(f => f.kind === r.kind)), ...found])
  const keys = new Set(allProblems(kept).map(p => p.key))
  await update($, picked, list => list.filter(k => keys.has(k)))
}

export async function clearProblems($: EngineInterface): Promise<void> {
  await update($, runs, () => [])
  await update($, picked, () => [])
}

function short(command: string): string {
  const one = command.replace(/\s+/g, ' ').trim()
  return one.length > 60 ? `${one.slice(0, 59)}…` : one
}

function byFile(list: readonly Problem[]): Array<[string, Problem[]]> {
  const groups = new Map<string, Problem[]>()
  for (const p of list) {
    const at = p.file ?? 'other'
    groups.set(at, [...(groups.get(at) ?? []), p])
  }
  return [...groups.entries()]
}

// For the tab label.
export async function problemsCount($: EngineInterface): Promise<number> {
  return allProblems(await read($, runs)).length
}

// Failing tests are the one solid red fill in the pane; type errors and
// lint are amber chips. A file's problems share a card.
export async function problemsTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Button, Text } = els
  const rich = isRich(e)
  const all = await read($, runs)
  const picks = await read($, picked)
  const list = allProblems(all)
  const chosen = list.filter(p => picks.includes(p.key))
  const heads = counts(all)
  const toggle = (key: string) => update($, picked, l => (l.includes(key) ? l.filter(k => k !== key) : [...l, key]))
  const isClean = all.length > 0 && heads.length === 0 && !all.some(r => r.isFailed)

  return (
    <Box flexDirection="column" gap={rich ? 1 : 0}>
      <Box justifyContent="space-between" gap={1} alignItems="center">
        <Box gap={1} flexWrap="wrap" alignItems="center">
          {heads.length === 0 ? (
            <Text weight="semibold" color={isClean ? 'success' : undefined}>
              {summary(all)}
            </Text>
          ) : (
            heads.map(h =>
              h.kind === 'test' ? fill(els, h.text.replace(/ tests?$/, ''), 'bad') : chip(els, rich, h.text, 'warn'),
            )
          )}
        </Box>
        <Button key="run-checks" label="Run checks" onPress={() => fillReply($, RUN_CHECKS)} />
      </Box>
      {byFile(list).map(([file, group]) => (
        <Box flexDirection="column" {...card(rich)}>
          <Text weight="semibold" mono wrap="truncate-end">
            {file}
          </Text>
          {group.map(p => (
            <Box gap={1} justifyContent="space-between" marginTop={1}>
              <Box gap={1} flexShrink={1}>
                <Text color={p.kind === 'test' ? 'error' : 'warning'}>{p.kind === 'test' ? '✕' : '!'}</Text>
                <Box flexDirection="column" flexShrink={1}>
                  <Text weight="semibold" wrap="wrap">
                    {p.title}
                  </Text>
                  {p.detail === '' ? null : (
                    <Text dimColor wrap="wrap">
                      {p.detail}
                    </Text>
                  )}
                </Box>
              </Box>
              <Box gap={1} flexShrink={0}>
                <Button key={`fix-${p.key}`} label="Fix" onPress={() => fillReply($, fixText(p))} />
                <Button
                  key={`pick-${p.key}`}
                  label={picks.includes(p.key) ? 'Picked' : 'Pick'}
                  variant={picks.includes(p.key) ? 'primary' : 'secondary'}
                  onPress={() => toggle(p.key)}
                />
              </Box>
            </Box>
          ))}
        </Box>
      ))}
      {chosen.length === 0 ? null : (
        <Box>
          <Button key="dispatch" label={`Dispatch ${chosen.length} picked`} onPress={() => fillReply($, dispatchText(chosen))} />
        </Box>
      )}
      {all.length === 0 ? null : (
        <Text size="caption" dimColor>
          from {all.map(r => short(r.command)).join(' and ')}
        </Text>
      )}
    </Box>
  )
}
