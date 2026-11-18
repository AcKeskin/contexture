// The Work pane's Plan tab: the plan in focus in a card (chain chips, a
// progress bar, its steps as /execute ticks them, Run), every other slug as
// one row that moves the card to it. Buttons put the command in the reply box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { ChainView, SlugState, Stage } from '../types'
import { commandOf, executeCommand, stepMarks } from './chain'
import type { StepMark, Strategy } from './chain'
import { card, chip, isRich, label } from './look'
import type { Tone } from './look'
import { fillReply } from './reply'

// Same atom as register.tsx's: keep the two declarations alike.
const chain = atom({ plugin: 'contexture-ui', key: 'chain' } as const, { slugs: [], scopes: [] } as ChainView, {
  shape: 'chain-2',
})
const strategy = atom({ plugin: 'contexture-ui', key: 'strategy' } as const, 'auto' as Strategy, {
  shape: 'strategy-1',
})
// The slug in the card: null (or one no longer listed) takes the default.
const planSlug = atom({ plugin: 'contexture-ui', key: 'planSlug' } as const, null as string | null, {
  shape: 'plan-slug-1',
})
// Done steps are folded into one line until shown.
const isDoneShown = atom({ plugin: 'contexture-ui', key: 'isDoneShown' } as const, false, { shape: 'done-shown-1' })

// 'auto' leaves --strategy out, and /execute runs sequential.
const STRATEGIES: ReadonlyArray<{ value: Strategy; label: string }> = [
  { value: 'auto', label: 'sequential' },
  { value: 'subtask', label: 'subtask' },
  { value: 'multi-agent', label: 'multi-agent' },
]
const MARK: Record<StepMark, string> = { done: '✓', next: '▸', todo: '○' }
// The chain chips: spec v1 ✓ · plan v2 ✓ · blueprint · execute 3/5.
// Vision is project-wide, so it is left out of a slug's chips.
const CHAIN: ReadonlyArray<Stage['name']> = ['spec', 'plan', 'blueprint', 'execute']

function stageChip(st: Stage): { text: string; tone: Tone } {
  const short = st.detail.match(/v\d+|\d+\/\d+/)?.[0]
  const named = short === undefined ? st.name : `${st.name} ${short}`
  if (st.status === 'missing' || st.status === 'unknown') return { text: st.name, tone: 'idle' }
  // A stale plan's detail names spec versions, not its own: no number then.
  if (st.status === 'stale') return { text: `${st.name} stale`, tone: 'warn' }
  if (st.status === 'blocked') return { text: `${st.name} blocked`, tone: 'bad' }
  if (st.name === 'execute' && st.status === 'present') return { text: named, tone: 'run' }
  if (st.name === 'spec' && st.detail.includes('draft')) return { text: `${named} draft`, tone: 'idle' }
  if (st.name === 'spec' && st.detail.includes('question')) return { text: `${named} open questions`, tone: 'warn' }
  return { text: `${named} ✓`, tone: 'ok' }
}

// A slug's one-word state on its row.
function rowChip(s: SlugState, view: ChainView): { text: string; tone: Tone } {
  const steps = stepMarks(s, view.progress)
  const done = steps.filter(st => st.mark === 'done').length
  if (s.stages.some(st => st.status === 'blocked')) return { text: 'blocked', tone: 'bad' }
  if (s.stages.find(st => st.name === 'plan')?.status === 'stale') return { text: 'plan stale', tone: 'warn' }
  if (steps.length === 0) return { text: 'no plan', tone: 'idle' }
  if (done === steps.length) return { text: 'done', tone: 'ok' }
  if (view.progress?.slug === s.slug) return { text: 'running', tone: 'run' }
  return { text: done === 0 ? 'not started' : 'paused', tone: 'idle' }
}

function isStrategy(value: string): value is Strategy {
  return STRATEGIES.some(s => s.value === value)
}

// For the tab label: steps done of the plan in focus.
export async function planCount($: EngineInterface): Promise<string> {
  const view = await read($, chain)
  const slug = focusSlug(view, await read($, planSlug))
  const s = view.slugs.find(x => x.slug === slug)
  if (s === undefined || s.steps.length === 0) return ''
  const steps = stepMarks(s, view.progress)
  return `${steps.filter(st => st.mark === 'done').length}/${steps.length}`
}

export async function planTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Button, Progress, Select, Text } = els
  const rich = isRich(e)
  const view = await read($, chain)
  if (view.slugs.length === 0) {
    return <Text dimColor>No specs, plans or visions under .claude/. Start with /spec &lt;slug&gt;.</Text>
  }
  const how = await read($, strategy)
  const isShown = await read($, isDoneShown)
  const chosen = await read($, planSlug)
  const focus = view.slugs.find(s => s.slug === focusSlug(view, chosen))
  // Done plans sort last.
  const others = view.slugs
    .filter(s => s !== focus)
    .sort((a, b) => Number(rowChip(a, view).text === 'done') - Number(rowChip(b, view).text === 'done'))

  return (
    <Box flexDirection="column">
      {focus === undefined ? null : focusCard(focus)}
      {others.length === 0 ? null : <Box marginTop={1}>{label(els, 'Other plans')}</Box>}
      {others.map(s => {
        const c = rowChip(s, view)
        const steps = stepMarks(s, view.progress)
        return (
          <Box justifyContent="space-between" gap={1}>
            <Button key={`slug-${s.slug}`} plain label={`▸ ${s.slug}`} onPress={() => update($, planSlug, () => s.slug)} />
            <Box gap={1}>
              {chip(els, rich, c.text, c.tone)}
              <Text dimColor tabular>
                {steps.length > 0 ? `${steps.filter(st => st.mark === 'done').length}/${steps.length}` : commandOf(s.next)}
              </Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )

  function focusCard(s: SlugState): RenderElement {
    const steps = stepMarks(s, view.progress)
    const done = steps.filter(st => st.mark === 'done')
    const nextStep = steps.find(st => st.mark === 'next')
    // Only a current plan gets run buttons: a stale or blocked one needs /draft-plan first.
    const isRunnable = s.stages.find(st => st.name === 'plan')?.status === 'present'
    const isExecuteNext = commandOf(s.next) === `/execute ${s.slug}`
    const next = isExecuteNext ? executeCommand(s.slug, nextStep?.n, how) : commandOf(s.next)
    const shown = steps.filter(st => st.mark !== 'done' || isShown)

    return (
      <Box flexDirection="column" gap={rich ? 1 : 0} {...card(rich)}>
        <Box justifyContent="space-between" gap={1}>
          <Text size="heading" weight="semibold">
            {s.slug}
          </Text>
          {steps.length > 0 ? (
            <Text dimColor tabular>
              {done.length} of {steps.length} steps
            </Text>
          ) : null}
        </Box>
        {steps.length > 0 ? (
          <Progress
            label={`${s.slug} plan`}
            value={done.length}
            max={steps.length}
            valueText={`${done.length} of ${steps.length} steps`}
            color={done.length === steps.length ? 'success' : 'suggestion'}
          />
        ) : null}
        <Box gap={1} flexWrap="wrap">
          {CHAIN.flatMap(name => {
            const st = s.stages.find(x => x.name === name)
            if (st === undefined) return []
            const c = stageChip(st)
            return [chip(els, rich, c.text, c.tone)]
          })}
        </Box>
        {steps.length === 0 ? null : (
          <Box flexDirection="column">
            {done.length === 0 ? null : (
              <Button
                key={`done-${s.slug}`}
                plain
                dimColor
                label={`✓ ${done.length} done · ${isShown ? 'hide' : 'show'}`}
                onPress={() => update($, isDoneShown, v => !v)}
              />
            )}
            {shown.map(st => stepRow(s, st, isRunnable))}
          </Box>
        )}
        <Box gap={1} flexWrap="wrap" alignItems="center">
          {isRunnable && nextStep !== undefined && isExecuteNext ? (
            <Button
              key={`run-${s.slug}`}
              label={nextStep.n === steps[0]?.n ? 'Run plan' : `Run from step ${nextStep.n}`}
              variant="primary"
              onPress={() => fillReply($, executeCommand(s.slug, nextStep.n, how))}
            />
          ) : (
            <Button key={`next-${s.slug}`} label={`next: ${next}`} onPress={() => fillReply($, next)} />
          )}
          {isRunnable && nextStep !== undefined ? (
            <Select
              key="strategy"
              label="Strategy"
              options={STRATEGIES}
              value={how}
              onSelect={value => {
                if (isStrategy(value)) void update($, strategy, () => value)
              }}
            />
          ) : null}
        </Box>
      </Box>
    )
  }

  // A done step is text; a step still to run fills /execute --from N. The
  // next step is framed in the running color.
  function stepRow(s: SlugState, st: ReturnType<typeof stepMarks>[number], isRunnable: boolean): RenderElement {
    const text = `${MARK[st.mark]} ${st.n} ${st.goal}`
    if (st.mark === 'done' || !isRunnable) {
      return (
        <Text color={st.mark === 'done' ? 'success' : undefined} dimColor={st.mark !== 'done'} wrap="wrap">
          {text}
        </Text>
      )
    }
    const row = (
      <Button key={`from-${s.slug}-${st.n}`} plain dimColor={st.mark === 'todo'} label={text} onPress={() => fillReply($, executeCommand(s.slug, st.n, how))}>
        {st.mark === 'next' ? (
          <Text color="suggestion" weight="semibold">
            {text}
          </Text>
        ) : (
          text
        )}
      </Button>
    )
    if (st.mark !== 'next' || !rich) return row
    return (
      <Box borderStyle="round" borderColor="suggestion" paddingX={1}>
        {row}
      </Box>
    )
  }
}

// The slug you pressed while it is still listed, else the default.
function focusSlug(view: ChainView, chosen: string | null): string {
  return chosen !== null && view.slugs.some(s => s.slug === chosen) ? chosen : defaultOpen(view)
}

// In the card by default: the slug the running plan belongs to, else the
// first one with steps left, else the first.
function defaultOpen(view: ChainView): string {
  const running = view.slugs.find(s => s.slug === view.progress?.slug && view.progress?.isComplete !== true)
  if (running) return running.slug
  const left = view.slugs.find(s => stepMarks(s, view.progress).some(st => st.mark !== 'done'))
  return left?.slug ?? view.slugs[0]?.slug ?? ''
}
