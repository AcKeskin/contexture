// The Work pane's Plan tab: each in-flight slug's stages, its plan steps
// as /execute ticks them, and buttons that put the command in the reply box.
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { ChainView, StageStatus } from '../types'
import { commandOf, executeCommand, stepMarks } from './chain'
import type { StepMark, Strategy } from './chain'
import { fillReply } from './reply'

// Same atom as register.tsx's: keep the two declarations alike.
const chain = atom({ plugin: 'contexture-ui', key: 'chain' } as const, { slugs: [], scopes: [] } as ChainView, {
  shape: 'chain-2',
})
const strategy = atom({ plugin: 'contexture-ui', key: 'strategy' } as const, 'auto' as Strategy, {
  shape: 'strategy-1',
})

// 'auto' leaves --strategy out, and /execute runs sequential.
const STRATEGIES: ReadonlyArray<{ value: Strategy; label: string }> = [
  { value: 'auto', label: 'sequential (default)' },
  { value: 'subtask', label: 'subtask' },
  { value: 'multi-agent', label: 'multi-agent' },
]
const MARK: Record<StepMark, string> = { done: '✓', next: '▸', todo: '○' }

const COLOR: Record<StageStatus, Color | undefined> = {
  done: 'success',
  present: undefined,
  stale: 'warning',
  blocked: 'error',
  missing: undefined,
  unknown: undefined,
}

function isStrategy(value: string): value is Strategy {
  return STRATEGIES.some(s => s.value === value)
}

export async function planTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Select, Text } = $.ui.resolve(e)
  const view = await read($, chain)
  const how = await read($, strategy)
  const hasSteps = view.slugs.some(s => s.steps.length > 0)

  return (
    <Box flexDirection="column">
      {view.slugs.length === 0 && (
        <Text dimColor>No specs, plans or visions under .claude/. Start with /spec &lt;slug&gt;.</Text>
      )}
      {hasSteps && (
        <Box>
          <Text dimColor>strategy: {STRATEGIES.find(s => s.value === how)?.label ?? how} </Text>
          <Select
            key="strategy"
            options={STRATEGIES}
            value={how}
            onSelect={value => {
              if (isStrategy(value)) void update($, strategy, () => value)
            }}
          />
        </Box>
      )}
      {view.slugs.map(s => {
        const steps = stepMarks(s, view.progress)
        const nextStep = steps.find(st => st.mark === 'next')
        // Only a current plan gets run buttons: a stale or blocked one needs /draft-plan first.
        const isRunnable = s.stages.find(st => st.name === 'plan')?.status === 'present'
        const next = commandOf(s.next) === `/execute ${s.slug}` ? executeCommand(s.slug, nextStep?.n, how) : commandOf(s.next)
        return (
          <Box flexDirection="column" marginBottom={1}>
            <Text weight="semibold">{s.slug}</Text>
            {s.stages.map(st => (
              <Text color={COLOR[st.status]} dimColor={st.status === 'missing' || st.status === 'unknown'}>
                {st.name.padEnd(10)}
                {st.status.padEnd(8)}
                {st.detail}
              </Text>
            ))}
            {steps.map(st =>
              st.mark === 'done' || !isRunnable ? (
                <Text color={st.mark === 'done' ? 'success' : undefined} dimColor={st.mark !== 'done'}>
                  {MARK[st.mark]} {st.n} {st.goal}
                </Text>
              ) : (
                <Button
                  key={`from-${s.slug}-${st.n}`}
                  plain
                  dimColor={st.mark === 'todo'}
                  label={`${MARK[st.mark]} ${st.n} ${st.goal}`}
                  onPress={() => fillReply($, executeCommand(s.slug, st.n, how))}
                />
              ),
            )}
            <Box>
              {nextStep && isRunnable && (
                <Button
                  key={`run-${s.slug}`}
                  label={nextStep.n > 1 ? `Run from step ${nextStep.n}` : 'Run plan'}
                  onPress={() => fillReply($, executeCommand(s.slug, nextStep.n, how))}
                />
              )}
              <Button key={`next-${s.slug}`} plain label={`next: ${next}`} onPress={() => fillReply($, next)} />
            </Box>
          </Box>
        )
      })}
      <Text dimColor>rules primed: {view.scopes.length > 0 ? view.scopes.join(', ') : 'none yet'}</Text>
    </Box>
  )
}
