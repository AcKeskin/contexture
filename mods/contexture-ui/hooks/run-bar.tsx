// The run row under the Work pane's tabs: a Run dropdown for every big skill,
// with Execute and Review as buttons, each opening a short form. A form writes the command into the reply box and
// never sends it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { BoardRow, ChainView, FormId } from '../types'
import {
  ANGLES,
  CAPTURE_KINDS,
  CONTRACT,
  FORMS,
  formCommand,
  KEEP,
  OUTPUTS,
  parseBoard,
  parseContract,
  PLACEMENTS,
  SCOPES,
  STRATEGY_OPTIONS,
  TARGETS,
} from './forms'
import type { Fields } from './forms'
import { fillReply } from './reply'

const QUICK: readonly FormId[] = ['execute', 'review']

// Same atom as register.tsx's and plan-tab.tsx's: keep the declarations alike.
const chain = atom({ plugin: 'contexture-ui', key: 'chain' } as const, { slugs: [], scopes: [] } as ChainView, {
  shape: 'chain-3',
})
const form = atom({ plugin: 'contexture-ui', key: 'form' } as const, null as FormId | null, { shape: 'form-1' })
// Typed values by `<form>.<field>`, kept until the form fills the reply box.
const fields = atom({ plugin: 'contexture-ui', key: 'formFields' } as const, {} as Record<string, string>, {
  shape: 'form-fields-1',
})
// What the Autonomy and Sessions forms show, read when they open.
const contract = atom({ plugin: 'contexture-ui', key: 'contract' } as const, {} as Record<string, string>, {
  shape: 'contract-1',
})
const board = atom({ plugin: 'contexture-ui', key: 'board' } as const, [] as BoardRow[], { shape: 'board-1' })

// The file's text, or '' when it is missing or can't be read.
async function readProjectFile($: EngineInterface, rel: string): Promise<string> {
  try {
    const path = `${(await $.session.root()).replace(/[\\/]$/, '')}/${rel}`
    return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  } catch (err) {
    $.ui.log(`contexture-ui: run bar: ${rel}: ${String(err)}`)
    return ''
  }
}

async function toggle($: EngineInterface, id: FormId): Promise<void> {
  const open = await read($, form)
  if (open === id) return void (await update($, form, () => null))
  if (id === 'autonomy') {
    const text = await readProjectFile($, '.claude/autonomy/active.md')
    await update($, contract, () => parseContract(text))
  }
  if (id === 'sessions') {
    const text = await readProjectFile($, '.claude/sessions-active.md')
    await update($, board, () => parseBoard(text))
  }
  await update($, form, () => id)
}

function valuesOf(id: FormId, stored: Record<string, string>, defaults: Fields): Record<string, string> {
  const own = Object.entries(stored).flatMap(([k, v]) => (k.startsWith(`${id}.`) ? [[k.slice(id.length + 1), v] as const] : []))
  return { ...defaults, ...Object.fromEntries(own) }
}

// Reads the fields again, so a change made just before the press counts;
// the form stays open with its fields when the reply box refuses the text.
async function submit($: EngineInterface, id: FormId, defaults: Fields, typed: Fields = {}): Promise<void> {
  const values = { ...valuesOf(id, await read($, fields), defaults), ...typed }
  const text = formCommand(id, values)
  if (text === undefined) return $.ui.toast('Fill in the form first.')
  if (!(await fillReply($, text))) return
  await update($, fields, f => Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith(`${id}.`))))
  await update($, form, () => null)
}

export async function runBar($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
  const open = await read($, form)
  // One Run dropdown for every skill, plus the two used most as buttons.
  const row = (
    <Box gap={1} flexWrap="wrap" alignItems="center">
      <Select
        key="run"
        label="Run"
        options={[{ value: '', label: 'pick a skill' }, ...FORMS.map(f => ({ value: f.id, label: f.label }))]}
        value={open ?? ''}
        onSelect={value => {
          const id = FORMS.find(f => f.id === value)?.id
          if (id === undefined) void update($, form, () => null)
          else if (id !== open) void toggle($, id)
        }}
      />
      {QUICK.map(id => (
        <Button
          key={`form-${id}`}
          label={FORMS.find(f => f.id === id)?.label ?? id}
          variant={id === open ? 'primary' : 'secondary'}
          onPress={() => toggle($, id)}
        />
      ))}
    </Box>
  )
  if (open === null) return row

  const slugs = (await read($, chain)).slugs.map(s => s.slug)
  const now = await read($, contract)
  const rows = await read($, board)
  const defaults: Fields =
    open === 'execute' && slugs[0]
      ? { slug: slugs[0] }
      : open === 'autonomy'
        ? { effort: KEEP, stopping: KEEP, ask: KEEP }
        : open === 'sessions' && rows[0]
          ? { to: rows[0].session }
          : {}
  const values = valuesOf(open, await read($, fields), defaults)
  const set = (name: string) => (value: string) => {
    void update($, fields, f => ({ ...f, [`${open}.${name}`]: value }))
  }
  const send = () => submit($, open, defaults)
  const input = (name: string, label: string, placeholder: string, lines?: number) => (
    <Input
      key={`${open}-${name}`}
      label={label}
      placeholder={placeholder}
      value={values[name] ?? ''}
      rows={lines}
      onInput={set(name)}
      onSubmit={value => {
        set(name)(value)
        // Enter in a many-line field keeps the text; only Fill sends it on.
        if (lines === undefined) void submit($, open, defaults, { [name]: value })
      }}
    />
  )
  const pick = (name: string, options: ReadonlyArray<{ value: string; label: string }>, label?: string) => (
    <Select
      key={`${open}-${name}`}
      label={label}
      options={options}
      value={values[name] ?? options[0]?.value}
      onSelect={set(name)}
    />
  )

  const body: Record<FormId, RenderElement> = {
    orchestrate: (
      <Box flexDirection="column">
        {input('goal', 'Goal', 'Ship SSE retry')}
        {input('units', 'Units, one per line or split with ; (empty: Claude splits)', 'server: server/; web: web/', 3)}
        {pick('placement', PLACEMENTS, 'Units run in')}
      </Box>
    ),
    dispatch: (
      <Box flexDirection="column">
        {input('tasks', 'Independent tasks, one per line or split with ;', 'fix the flaky retry test; update docs', 4)}
        <Text dimColor>Or pick rows in Problems, then Dispatch there.</Text>
      </Box>
    ),
    execute: (
      <Box flexDirection="column">
        {slugs.length > 0 ? pick('slug', slugs.map(s => ({ value: s, label: s })), 'Slug') : input('slug', 'Slug', 'auth')}
        {input('from', 'From step (empty: the start)', '3')}
        {pick('strategy', STRATEGY_OPTIONS, 'Strategy')}
      </Box>
    ),
    review: (
      <Box flexDirection="column">
        {pick('target', TARGETS, 'Review')}
        {(values.target ?? 'local') === 'local' ? null : input('value', 'Path, ref or PR number (empty PR: this branch)', '')}
        {pick('angles', ANGLES, 'Angles')}
        {values.angles === 'custom' ? input('custom', 'Angles, comma separated', 'performance,security') : null}
        {pick('output', OUTPUTS, 'Show')}
      </Box>
    ),
    checkpoint: <Box flexDirection="column">{pick('scope', SCOPES, 'Scope')}</Box>,
    capture: (
      <Box flexDirection="column">
        {pick('kind', CAPTURE_KINDS, 'Kind')}
        {input('text', 'One line', 'retries need a jittered backoff')}
      </Box>
    ),
    autonomy: (
      <Box flexDirection="column">
        <Text dimColor>
          {Object.keys(now).length === 0
            ? 'No task contract (active.md); the project default applies.'
            : `Task contract: ${Object.entries(now).map(([k, v]) => `${k} ${v}`).join(' · ')}`}
        </Text>
        {(['effort', 'stopping', 'ask'] as const).map(k =>
          pick(k, [{ value: KEEP, label: `${k}: keep` }, ...CONTRACT[k].map(v => ({ value: v, label: `${k}: ${v}` }))]),
        )}
      </Box>
    ),
    sessions: (
      <Box flexDirection="column">
        {rows.length === 0 ? <Text dimColor>No sessions on the board (.claude/sessions-active.md).</Text> : null}
        {rows.map(r => (
          <Text>
            {r.session} · {r.owns} · {r.status}
            {r.handoffs === '' || r.handoffs === '—' ? '' : ` · ${r.handoffs}`}
          </Text>
        ))}
        {rows.length === 0
          ? null
          : pick('to', [...new Set(rows.map(r => r.session))].map(s => ({ value: s, label: `hand off to ${s}` })))}
        {rows.length === 0 ? null : input('note', 'Hand-off note', 'changed the token contract')}
      </Box>
    ),
  }

  return (
    <Box flexDirection="column">
      {row}
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text weight="semibold">{FORMS.find(f => f.id === open)?.label}</Text>
          <Text dimColor>fills the reply box</Text>
        </Box>
        {body[open]}
        <Box marginTop={1} gap={1}>
          <Button key={`fill-${open}`} label="Fill reply box" variant="primary" onPress={send} />
          <Button key="form-cancel" label="Cancel" onPress={() => update($, form, () => null)} />
        </Box>
      </Box>
    </Box>
  )
}
