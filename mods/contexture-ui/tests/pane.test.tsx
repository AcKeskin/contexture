import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, ToolUseSummary } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import { hunks } from '../hooks/diff'
import { CODEMAP, CODEMAP_JSON } from './fixtures'

const ROOT = '/repo'
const FILES: Record<string, string> = {
  '/repo/.claude/specs/INDEX.md': '| Slug | Current | Status |\n|---|---|---|\n| auth | v2 | active |\n| old | v1 | active |',
  '/repo/.claude/specs/auth/v2.md': '---\ndone_criteria:\n  - login works\n---\n',
  '/repo/.claude/specs/old/v1.md': '---\ndone_criteria:\n  - x\n---\n',
  '/repo/.claude/plans/INDEX.md': '| Slug | Current | Status | Spec |\n|---|---|---|---|\n| auth | v1 | active | v2 |',
  '/repo/.claude/plans/auth/v1.md':
    '---\nspec: ../../specs/auth/v2.md\n---\n## Step 1: Add token store\n## Step 2: Wire login route\n',
  '/repo/.claude/codemap.md': CODEMAP,
  '/home/me/.claude/session-state.json': JSON.stringify({ rulePrime: { s1: { scopes: ['universal', 'typescript'] } } }),
}
const DIRS: Record<string, string[]> = {
  '/repo/.claude/archive': ['2026-11-01-old'],
  '/repo/.claude/specs/auth': ['v2.md'],
  '/repo/.claude/plans/auth': ['v1.md'],
}

const PANE = {
  plugin: 'contexture-ui',
  component: 'Pane',
  requestId: 'contexture-work',
  props: {
    title: 'Work',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type On = Parameters<TestBody>[1]

// Stands in for the engine: a fake project tree, home and session.
function engine(
  on: On,
  opened: string[],
  status: Array<string | undefined>,
  answer = '',
  files = FILES,
  stored: Record<string, unknown> = {},
  toolUses: ToolUseSummary[] = [],
) {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.list', (_, e) => {
    const names = DIRS[e.path]
    if (!names) throw new Error(`ENOENT ${e.path}`)
    return { value: names.map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.stat', (_, e) => {
    if (files[e.path] === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }
  })
  on('session.root', () => ({ value: ROOT }))
  on('settings.read', () => ({ value: {} }))
  on('session.id', () => ({ value: 's1' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: answer, toolUses }] }))
  on('command.register', () => ({ value: { command: 'chain' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  mock.store(on, stored)
  on('ui.status', (_, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const out = e.argv[1] === 'rev-parse' ? '\n' : (files['git status'] ?? '')
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

test('the pane shows each stage and skips archived slugs, on every surface', async ($, on) => {
  const opened: string[] = []
  const status: Array<string | undefined> = []
  engine(on, opened, status)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  expect(opened).toEqual(['contexture-work'])
  expect(status.at(-1)).toBe('auth next /execute · rules universal, typescript')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /plan v1 ✓/ }))?.text).toMatch(/^\[?plan v1 ✓\]?$/)
    expect((await ui.find({ key: 'run-auth' }))?.props).toMatchObject({ label: 'Run plan' })
    expect(await ui.find({ type: 'Text', text: /^old$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /Rules primed/ }))?.text).toBe('Rules primed: universal, typescript')
    await ui.unmount()
  }
})

test('a terminal session does not open the pane unasked', async ($, on) => {
  const opened: string[] = []
  engine(on, opened, [])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])
})

// The kit does not raise ui.close, so this seeds what the close hook stores.
test('a pane the person closed stays closed at session start until /chain', async ($, on) => {
  const opened: string[] = []
  engine(on, opened, [], '', FILES, { isWorkPaneClosed: true })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(opened).toEqual([])

  await $.command.run({ ...RUN, command: 'chain' })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(opened).toEqual(['contexture-work', 'contexture-work'])
})

test('a turn with a step line moves the status line and execute row', async ($, on) => {
  const status: Array<string | undefined> = []
  engine(on, [], status, '✓ Step 1 complete: Add token store. Verified by tests.')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(status.at(-1)).toBe('auth step 1/2 · rules universal, typescript')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^execute/ }))?.text).toBe('execute 1/2')
  await ui.unmount()
})

test('a minimized desktop widget shows one line: slug, steps and next', async ($, on) => {
  engine(on, [], [], '✓ Step 1 complete: Add token store. Verified by tests.')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'widget' } })
  expect(await ui.find({ type: 'Text', text: 'auth · 1/2 steps · next /execute' })).toBeDefined()
  expect(await ui.find({ key: 'tab-plan' })).toBeUndefined()
  await ui.unmount()
})

test('the status line counts the cache down and warns once when it goes cold', async ($, on) => {
  const status: Array<string | undefined> = []
  const toasts: string[] = []
  const clock = engine(on, [], status)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: 'm',
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 119000,
        cache_creation_input_tokens: 990,
        ephemeral_5m_input_tokens: 0,
        ephemeral_1h_input_tokens: 990,
      },
    }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 2 })
  for await (const _ of step) {
    // drain the stream
  }

  expect(status.at(-1)).toBe('auth next /execute · rules universal, typescript · cache 60m')
  await clock.advance(30 * 60 * 1000)
  expect(status.at(-1)).toContain('cache 30m')
  await clock.advance(31 * 60 * 1000)
  expect(status.at(-1)).toContain('cache cold')
  await clock.advance(5 * 60 * 1000)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('about 120k tokens')
})

test('a session resumed after the TTL shows cold and warns at the next tick', async ($, on) => {
  const status: Array<string | undefined> = []
  const toasts: string[] = []
  const clock = engine(on, [], status)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('classic.SessionStart', () => ({}))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 7200, context_tokens: 50000 })

  expect(status.at(-1)).toContain('cache cold')
  await clock.advance(60 * 1000)
  expect(toasts).toEqual([expect.stringContaining('about 50k tokens')])
})

const RUN = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('the Files tab opens folders on press and marks edited files', async ($, on) => {
  engine(on, [], [])
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/hooks/load.ts', old_string: 'a', new_string: 'b' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-files' })
    expect(await ui.find({ type: 'Text', text: 'ALL FILES · 5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^codemap 2026-11-18/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Reads files/ })).toBeUndefined()
    await ui.press({ key: 'hooks' })
    expect(await ui.find({ type: 'Text', text: /Reads files/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /●/ })).toBeDefined()
    await ui.press({ key: 'hooks' })
    await ui.press({ key: 'tab-plan' })
    await ui.unmount()
  }
})

test('the Files tab lists touched files in a card and filters paths', async ($, on) => {
  const fills: string[] = []
  engine(on, [], [])
  on('tool.call', () => ({ result: {} }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true, text: '', cursor: 0 }
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/hooks/load.ts', old_string: 'a', new_string: 'b' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: 'CLAUDE TOUCHED · 2 FILES' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Edited' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Read' })).toBeDefined()
  // No hunks in Changes for it (the stand-in Edit wrote nothing): it asks about it instead.
  await ui.press({ key: 'touched-hooks/load.ts' })
  expect(fills).toEqual(['About hooks/load.ts: '])
  await ui.input({ key: 'file-filter', text: 'CHAIN.ts', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'hooks/' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Reads files/ })).toBeUndefined()
  await ui.input({ key: 'file-filter', text: '', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /^ALL FILES/ })).toBeDefined()
  await ui.unmount()
})

test('/codemap opens the Work pane on Files, /chain on Plan', async ($, on) => {
  const opened: string[] = []
  engine(on, opened, [])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await $.command.run({ ...RUN, command: 'codemap' })).text).toBe('Work pane opened on Files.')
    let ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^ALL FILES/ })).toBeDefined()
    await ui.unmount()
    expect((await $.command.run({ ...RUN, command: 'chain' })).text).toBe('Work pane opened on Plan.')
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'run-auth' }))?.props).toMatchObject({ label: 'Run plan' })
    await ui.unmount()
  }
  expect((await $.command.run({ ...RUN, command: 'work' })).text).toBe('Work pane opened.')
  expect(opened).toEqual(Array(5).fill('contexture-work'))
})

test('/work keeps the tab the pane was on', async ($, on) => {
  engine(on, [], [])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, command: 'codemap' })
  await $.command.run({ ...RUN, command: 'work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^ALL FILES/ })).toBeDefined()
  await ui.unmount()
})

// The kit does not raise ui.close, so these seed what the close hook stores.
for (const command of ['codemap', 'work']) {
  test(`/${command} also clears the closed flag`, async ($, on) => {
    const opened: string[] = []
    engine(on, opened, [], '', FILES, { isWorkPaneClosed: true })
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
    expect(opened).toEqual([])
    await $.command.run({ ...RUN, command })
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
    expect(opened).toEqual(['contexture-work', 'contexture-work'])
  })
}

test('the Files tab picks up a background refresh after the turn', async ($, on) => {
  const { '/repo/.claude/codemap.md': _codemap, ...noCodemap } = FILES
  const files: Record<string, string> = { ...noCodemap }
  const clock = engine(on, [], [], '', files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  files['/repo/.claude/codemap.md'] = CODEMAP
  await clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: 'ALL FILES · 5' })).toBeDefined()
  await ui.unmount()
})

test('the Files tab reads codemap.json when there is one', async ($, on) => {
  engine(on, [], [], '', { ...FILES, '/repo/.claude/codemap.json': CODEMAP_JSON })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ type: 'Text', text: 'ALL FILES · 2' })).toBeDefined()
  await ui.unmount()
})

test('without a codemap the Files tab says how to make one', async ($, on) => {
  const { '/repo/.claude/codemap.md': _codemap, ...noCodemap } = FILES
  engine(on, [], [], '', noCodemap)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-files' })
  expect((await ui.find({ type: 'Text', text: /codemap/ }))?.text).toBe('No .claude/codemap.md yet. Run /update-codemap.')
  await ui.unmount()
})

test('a resume the engine calls likely expired shows cold even under a 1h TTL', async ($, on) => {
  const status: Array<string | undefined> = []
  engine(on, [], status)
  on('classic.SessionStart', () => ({}))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 1200, prompt_cache_likely_expired: true })
  expect(status.at(-1)).toContain('cache cold')
})

test('/clear drops the run, the cache clock and keeps the chain', async ($, on) => {
  const status: Array<string | undefined> = []
  engine(on, [], status, '✓ Step 1 complete: Add token store. Verified by tests.')
  on('classic.SessionStart', () => ({}))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(status.at(-1)).toContain('auth step 1/2')
  await $.classic.SessionStart({ source: 'clear' })
  expect(status.at(-1)).toBe('auth next /execute · rules universal, typescript')
})

const BAND = {
  plugin: 'contexture-ui',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} },
} as const

const BASH_STEP = {
  answer: '',
  toolUses: [{ name: 'Bash', input: { command: 'bun test server/' } }],
  stopReason: 'tool_use' as const,
  usage: null,
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // drain the stream
  }
}

test('the now line shows the tool a step asked for, its clock, and clears at turn end', async ($, on) => {
  const clock = engine(on, [], [])
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, ...BASH_STEP }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 2 }))
  await clock.advance(42_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: 'On a tool' }))?.text).toBe('On a tool')
    expect((await ui.find({ type: 'Text', text: /bun test/ }))?.text).toBe(' Bash bun test server/ ')
    expect((await ui.find({ type: 'Text', text: /·/ }))?.text).toBe('· 0:42')
    await ui.unmount()
  }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'On a tool' })).toBeUndefined()
  await ui.unmount()
})

test('an ask a person answers puts the now line on you', async ($, on) => {
  engine(on, [], [])
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, ...BASH_STEP }
  })
  on('tool.check', () => ({ decision: 'ask' as const }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 2 }))
  // A plugin's query (no tool_use_id) leaves the band alone.
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person' })
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'On you' })).toBeUndefined()
  await ui.unmount()

  const call = { tool: 'Bash', input: { command: 'bun test server/' }, approver: 'person', tool_use_id: 'tu1' } as const
  await $.tool.check(call)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: 'On you' }))?.text).toBe('On you')
  expect((await ui.find({ type: 'Text', text: /approve/ }))?.text).toBe(' approve Bash bun test server/ ')
  await ui.unmount()
})

test('with the now line off the band stays empty', { options: { nowLine: false } }, async ($, on) => {
  engine(on, [], [])
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, ...BASH_STEP }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 2 }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'On a tool' })).toBeUndefined()
  await ui.unmount()
})

test('Focus colors set a look when on, and nothing when off', async ($, on) => {
  const calls: string[] = []
  engine(on, [], [])
  on('theme.set', () => {
    calls.push('set')
    return { value: { isDrawn: true, requestId: 'r1' } }
  })
  on('theme.clear', () => {
    calls.push('clear')
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(calls).toEqual([])
})

test('Focus colors on set the look at session start', { options: { focusColors: true } }, async ($, on) => {
  const calls: string[] = []
  engine(on, [], [])
  on('theme.set', () => {
    calls.push('set')
    return { value: { isDrawn: true, requestId: 'r1' } }
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  expect(calls).toEqual(['set'])
})

test('the Files tab marks git changes and filters to changed files', async ($, on) => {
  engine(on, [], [], '', { ...FILES, 'git status': ' M hooks/load.ts\0?? hooks/new.ts\0' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-files' })
    await ui.press({ key: 'changed-only' })
    expect(await ui.find({ type: 'Text', text: /Reads files/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Scope-chain state/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /not in codemap/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'M' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /README/ })).toBeUndefined()
    await ui.press({ key: 'changed-only' })
    expect(await ui.find({ type: 'Text', text: /README/ })).toBeDefined()
    await ui.unmount()
  }
})

test('Plan buttons put /execute in the reply box, never send it', async ($, on) => {
  const fills: string[] = []
  const toasts: string[] = []
  const sent: string[] = []
  let draft = ''
  engine(on, [], [], '✓ Step 1 complete: Add token store. Verified by tests.')
  on('prompt.read', () => ({ value: { text: draft, cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    draft = e.text
    return { isFilled: true, text: e.text, cursor: 0 }
  })
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^✓ 1/ })).toBeUndefined()
    await ui.press({ key: 'done-auth' })
    expect((await ui.find({ type: 'Text', text: /^✓ 1/ }))?.text).toBe('✓ 1 Add token store')
    await ui.press({ key: 'done-auth' })
    expect((await ui.find({ key: 'run-auth' }))?.props).toMatchObject({ label: 'Run from step 2' })
    await ui.press({ key: 'run-auth' })
    await ui.select({ key: 'strategy', value: 'subtask' })
    await ui.press({ key: 'from-auth-2' })
    await ui.select({ key: 'strategy', value: 'auto' })
    await ui.unmount()
  }
  expect(fills).toEqual(Array(2).fill(['/execute auth --from 2', '/execute auth --from 2 --strategy subtask']).flat())

  // A command the person typed is theirs: kept, with a toast.
  draft = '/review --pr 77'
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'run-auth' })
  await ui.unmount()
  expect(fills).toHaveLength(4)
  expect(toasts).toEqual(['The reply box has your text. Clear it, then press again.'])
  expect(sent).toEqual([])
})

test('a redrafted plan drops the steps seen against the old version', async ($, on) => {
  const files = { ...FILES }
  engine(on, [], [], '✓ Step 1 complete: Add token store. Verified by tests.', files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  files['/repo/.claude/plans/INDEX.md'] = '| Slug | Current | Status | Spec |\n|---|---|---|---|\n| auth | v2 | active | v2 |'
  files['/repo/.claude/plans/auth/v2.md'] = files['/repo/.claude/plans/auth/v1.md'] ?? ''
  await $.command.run({ ...RUN, command: 'chain' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'done-auth' })).toBeUndefined()
  expect((await ui.find({ key: 'run-auth' }))?.props).toMatchObject({ label: 'Run plan' })
  await ui.unmount()
})

test('a spec with questions that block the plan keeps the next: advice, not Run', async ($, on) => {
  const files = {
    ...FILES,
    '/repo/.claude/specs/auth/v2.md': '---\ndone_criteria:\n  - login works\n---\n- Which store? blocks: plan\n',
  }
  engine(on, [], [], '', files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'spec v2 open questions' })).toBeDefined()
  expect(await ui.find({ key: 'run-auth' })).toBeUndefined()
  expect((await ui.find({ key: 'next-auth' }))?.props.label).toMatch(/^next: (?!\/execute)/)
  await ui.unmount()
})

test('the Plan tab holds one plan in a card; the others are one row each', async ($, on) => {
  const files = {
    ...FILES,
    '/repo/.claude/specs/INDEX.md': '| Slug | Current | Status |\n|---|---|---|\n| auth | v2 | active |\n| billing | v1 | active |',
    '/repo/.claude/specs/billing/v1.md': '---\ndone_criteria:\n  - invoices\n---\n',
    '/repo/.claude/plans/INDEX.md':
      '| Slug | Current | Status | Spec |\n|---|---|---|---|\n| auth | v1 | active | v2 |\n| billing | v1 | active | v1 |',
    '/repo/.claude/plans/billing/v1.md': '---\nspec: ../../specs/billing/v1.md\n---\n## Step 1: Add invoice table\n',
  }
  engine(on, [], [], '', files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'slug-auth' })).toBeUndefined()
  expect((await ui.find({ key: 'slug-billing' }))?.props).toMatchObject({ label: '▸ billing' })
  expect(await ui.find({ type: 'Text', text: 'not started' })).toBeDefined()
  expect(await ui.find({ key: 'run-billing' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^0 of \d+ steps$/ })).toBeDefined()

  await ui.press({ key: 'slug-billing' })
  expect(await ui.find({ key: 'run-billing' })).toBeDefined()
  expect(await ui.find({ key: 'run-auth' })).toBeUndefined()
  expect((await ui.find({ key: 'slug-auth' }))?.props).toMatchObject({ label: '▸ auth' })
  await ui.unmount()
})

test('Changes shows one file open at a time; Keep all clears the tab', async ($, on) => {
  const files: Record<string, string> = { ...FILES, '/repo/src/a.ts': 'one\n', '/repo/src/c.ts': 'three\n' }
  engine(on, [], [], '', files)
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  on('tool.call', (_, e) => {
    const input = e as unknown as Record<string, string>
    const path = input.file_path ?? ''
    files[path] = (files[path] ?? '').replace(input.old_string ?? '', input.new_string ?? '')
    return { result: {} }
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'one', new_string: 'ONE' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/c.ts', old_string: 'three', new_string: '3' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ key: 'show-src/a.ts' })).toBeUndefined()
  expect(await ui.find({ key: 'show-src/c.ts' })).toBeDefined()
  await ui.press({ key: 'show-src/c.ts' })
  expect(await ui.find({ key: 'show-src/a.ts' })).toBeDefined()
  expect(await ui.find({ key: 'show-src/c.ts' })).toBeUndefined()
  // Once the shown file has no hunks left, the first with hunks shows.
  await ui.press({ key: `keep-src/c.ts-${hunkId('three\n', '3\n')}` })
  expect(await ui.find({ key: 'show-src/a.ts' })).toBeUndefined()
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.press({ key: 'keep-all' })
  expect(await ui.find({ type: 'Text', text: 'No edits by Claude this session.' })).toBeDefined()
  expect(files['/repo/src/c.ts']).toBe('3\n')
  await ui.unmount()
})

function hunkId(before: string, after: string, n = 0): string {
  return hunks(before, after)[n]?.id ?? ''
}

test('the Changes tab shows hunks Claude made, with Keep, Undo and Comment', async ($, on) => {
  const files: Record<string, string> = { ...FILES, '/repo/src/a.ts': 'one\ntwo\nthree\n' }
  const fills: string[] = []
  engine(on, [], [], '', files)
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true, text: '', cursor: 0 }
  })
  // Stands in for the tools: Edit swaps text, Write sets the file.
  on('tool.call', (_, e) => {
    const input = e as unknown as Record<string, string>
    const path = input.file_path ?? ''
    files[path] = input.tool === 'Edit' ? (files[path] ?? '').replace(input.old_string ?? '', input.new_string ?? '') : (input.content ?? '')
    return { result: {} }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'two', new_string: 'TWO' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'new\n' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: '2 files' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+2 −1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'src/b.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'new file' })).toBeDefined()
  const code = await ui.find({ type: 'Code' })
  expect(code?.props).toMatchObject({ format: 'diff' })
  const id = hunkId('one\ntwo\nthree\n', 'one\nTWO\nthree\n')

  await ui.press({ key: `comment-src/a.ts-${id}` })
  expect(fills).toEqual(['About src/a.ts:2: '])

  await ui.press({ key: `undo-src/a.ts-${id}` })
  expect(files['/repo/src/a.ts']).toBe('one\ntwo\nthree\n')
  expect(await ui.find({ type: 'Code' })).toBeUndefined()

  await ui.press({ key: 'keep-src/b.ts' })
  expect((await ui.find({ type: 'Text', text: /No edits/ }))?.text).toBe('No edits by Claude this session.')
  await ui.unmount()

  // Keep takes the change into the copy: the tab clears, the file stays edited.
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'three', new_string: '3' })
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await again.press({ key: `keep-src/a.ts-${hunkId('one\ntwo\nthree\n', 'one\ntwo\n3\n')}` })
  expect(await again.find({ type: 'Code' })).toBeUndefined()
  expect(files['/repo/src/a.ts']).toBe('one\ntwo\n3\n')
  await again.unmount()
})

test('two quick Keeps both land; a hunk changed since the draw is left alone', async ($, on) => {
  const was = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n'
  const files: Record<string, string> = { ...FILES, '/repo/src/a.ts': was }
  const toasts: string[] = []
  engine(on, [], [], '', files)
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', (_, e) => {
    files['/repo/src/a.ts'] = String((e as unknown as Record<string, string>).content)
    return { result: {} }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const edited = 'A\nb\nc\nd\ne\nf\ng\nh\ni\nJ\n'
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.ts', content: edited })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-changes' })
  await Promise.all([0, 1].map(n => ui.press({ key: `keep-src/a.ts-${hunkId(was, edited, n)}` })))
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(toasts).toEqual([])

  await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.ts', content: edited.replace('b', 'B') })
  const drawn = hunkId(edited, edited.replace('b', 'B'))
  files['/repo/src/a.ts'] = edited.replace('b', 'Q')
  await ui.press({ key: `undo-src/a.ts-${drawn}` })
  expect(files['/repo/src/a.ts']).toBe(edited.replace('b', 'Q'))
  expect(toasts).toEqual(['That change moved since the tab drew it. Look again.'])
  await ui.unmount()
})

test('Problems lists failures from runs Claude did; Fix and Dispatch fill the reply box', async ($, on) => {
  const fills: string[] = []
  const bash = (command: string, text: string): ToolUseSummary => ({ tool_use_id: command, tool: 'Bash', input: { command }, text, isError: true })
  engine(on, [], [], '', FILES, {}, [
    bash('bun test', 'tests/live.test.ts:\nerror: expected 2 calls, got 1\n(fail) reconnects after drop [5ms]\n(fail) stops after close'),
    bash('npx tsc --noEmit', "server/retry.ts(7,3): error TS2322: Type 'number' is not assignable."),
    { tool_use_id: 'r', tool: 'Read', input: { file_path: '/repo/a.ts' }, text: 'x' },
  ])
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true, text: '', cursor: 0 }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-problems' })
  expect(await ui.find({ type: 'Text', text: ' 2 failing ' })).toMatchObject({ props: { backgroundColor: 'error' } })
  expect(await ui.find({ type: 'Text', text: '1 type error' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'server/retry.ts' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^from / }))?.text).toBe('from bun test and npx tsc --noEmit')
  await ui.press({ key: 'fix-type|server/retry.ts:7|line 7 · TS2322' })
  await ui.press({ key: 'pick-test|tests/live.test.ts:|reconnects after drop' })
  await ui.press({ key: 'pick-test|tests/live.test.ts:|stops after close' })
  await ui.press({ key: 'dispatch' })
  await ui.press({ key: 'run-checks' })
  await ui.unmount()
  expect(fills).toEqual([
    "Fix server/retry.ts:7: line 7 · TS2322: Type 'number' is not assignable.",
    '/dispatch fix these:\n- tests/live.test.ts: reconnects after drop: error: expected 2 calls, got 1\n- tests/live.test.ts: stops after close',
    "Run checks: first the tests this session's changes reach (update-codemap's affected-tests.mjs lists them), then lint. Report what fails; don't fix yet.",
  ])
})

test('Agents lists subagents with what they last did; Open views one, Converge fills', async ($, on) => {
  const fills: string[] = []
  const views: unknown[] = []
  const agent = (id: string, description: string, status: AgentInfo['status']): AgentInfo => ({
    id,
    type: 'Explore',
    description,
    status,
    kind: 'local_agent',
    taskStatus: status === 'completed' ? 'completed' : 'running',
    label: description,
    startTime: 1_799_999_990_000,
    cwd: '/repo/.worktrees/a',
    tokenCount: 0,
    tokenSamples: [],
    hasRow: true,
  })
  const list = [agent('a1', 'find SSE handlers', 'running')]
  engine(on, [], [])
  on('agent.list', () => ({ value: list }))
  const toasts: string[] = []
  let deny: string | undefined
  on('classic.SessionStart', () => ({}))
  on('ui.view', (_, e) => {
    views.push(e)
    return { value: deny === undefined ? {} : { deny } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true, text: '', cursor: 0 }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, ...BASH_STEP }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 2, agentId: 'a1' }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ type: 'Text', text: '1 running' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Bash bun/ }))?.text).toBe('Bash bun test server/ · .worktrees/a')
  expect(await ui.find({ key: 'converge' })).toBeUndefined()
  await ui.press({ key: 'view-a1' })
  expect(views).toEqual([{ agentId: 'a1' }])

  list.splice(0, 1, agent('a1', 'find SSE handlers', 'completed'), agent('a2', 'docs', 'completed'))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: '2 done' })).toBeDefined()
  await ui.press({ key: 'converge' })
  expect(fills).toEqual(["Converge the subagents' results: merge their work, run the full tests, then check it against the goal."])
  expect(await ui.find({ key: 'converge' })).toBeUndefined()

  // A denied Open says why; a row the engine dropped has no Open.
  deny = 'no agent holds the id'
  await ui.press({ key: 'view-a2' })
  expect(toasts).toEqual(["Can't open that agent: no agent holds the id"])
  list.splice(1, 1, { ...agent('a2', 'docs', 'completed'), hasRow: false })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(await ui.find({ key: 'view-a2' })).toBeUndefined()

  // After /clear the older agents stay out, even after the next turn.
  await $.classic.SessionStart({ source: 'clear' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: 'No subagents this session.' })).toBeDefined()
  await ui.unmount()
})

test('the run bar opens a form that fills the reply box and closes', async ($, on) => {
  const fills: string[] = []
  const toasts: string[] = []
  const files: Record<string, string> = { ...FILES, '/repo/.claude/autonomy/active.md': 'effort: thorough\n' }
  engine(on, [], [], '', files)
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  let draft = ''
  on('prompt.read', () => ({ value: { text: draft, cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true, text: '', cursor: 0 }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'form-execute' })
  await ui.select({ key: 'execute-strategy', value: 'multi-agent' })
  await ui.press({ key: 'fill-execute' })
  expect(await ui.find({ key: 'fill-execute' })).toBeUndefined()

  await ui.select({ key: 'run', value: 'capture' })
  await ui.press({ key: 'fill-capture' })
  await ui.input({ key: 'capture-text', text: 'retries need jitter', kind: 'change' })
  await ui.press({ key: 'fill-capture' })

  await ui.select({ key: 'run', value: 'autonomy' })
  expect(await ui.find({ type: 'Text', text: 'Task contract: effort thorough' })).toBeDefined()
  await ui.select({ key: 'autonomy-ask', value: 'until-blocked' })
  await ui.press({ key: 'fill-autonomy' })

  // A draft of the person's own keeps the form open with what was typed.
  draft = 'my own words'
  await ui.select({ key: 'run', value: 'capture' })
  await ui.input({ key: 'capture-text', text: 'keep this', kind: 'change' })
  await ui.press({ key: 'fill-capture' })
  expect((await ui.find({ key: 'capture-text' }))?.props).toMatchObject({ value: 'keep this' })
  await ui.unmount()

  expect(toasts).toEqual(['Fill in the form first.', 'The reply box has your text. Clear it, then press again.'])
  expect(fills).toEqual([
    '/execute auth --strategy multi-agent',
    '/capture retries need jitter',
    '/autonomize ask=until-blocked',
  ])
})

test('a file that is not plain UTF-8 gets no copy; Comment leaves later fills free', async ($, on) => {
  const files: Record<string, string> = { ...FILES, '/repo/src/a.ts': 'one\n', '/repo/src/u16.ps1': '\uFFFD\uFFFDh\u0000i' }
  const fills: string[] = []
  const toasts: string[] = []
  let draft = ''
  engine(on, [], [], '', files)
  on('fs.exists', (_, e) => ({ value: files[e.path] !== undefined }))
  on('prompt.read', () => ({ value: { text: draft, cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    draft = e.text
    return { isFilled: true, text: e.text, cursor: 0 }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', (_, e) => {
    const input = e as unknown as Record<string, string>
    files[input.file_path ?? ''] = input.content ?? ''
    return { result: {} }
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/u16.ps1', content: 'hi' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.ts', content: 'ONE\n' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /u16/ })).toBeUndefined()
  await ui.press({ key: `comment-src/a.ts-${hunkId('one\n', 'ONE\n')}` })
  await ui.press({ key: 'review' })
  await ui.unmount()
  expect(fills).toEqual(['About src/a.ts:1: ', '/review'])
  expect(toasts).toEqual([])
})
