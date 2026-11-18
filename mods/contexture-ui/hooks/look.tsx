// The Work panel's look ("Cards and chips"): cards for what is in focus,
// outlined chips for state. Theme colors only, so both app themes read right.
import type { Color, Elements, RenderElement, RenderSurface, ResolveInput } from 'claude-code'

export type Tone = 'ok' | 'run' | 'warn' | 'bad' | 'idle'

export const TONE: Record<Tone, Color> = {
  ok: 'success',
  run: 'suggestion',
  warn: 'warning',
  bad: 'error',
  idle: 'inactive',
}

type Els = Pick<Elements[RenderSurface], 'Box' | 'Text'>

// The terminal draws a bordered Box three rows tall, so a chip there is colored text.
export function isRich(e: ResolveInput<'Pane'>): boolean {
  return e.surface !== 'terminal'
}

export function chip(els: Els, rich: boolean, text: string, tone: Tone): RenderElement {
  const { Box, Text } = els
  const color = TONE[tone]
  if (!rich) return <Text color={color}>[{text}]</Text>
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1}>
      <Text size="caption" weight="semibold" color={color}>
        {text}
      </Text>
    </Box>
  )
}

// A card's frame: a dim rounded border on rich surfaces; the terminal keeps
// the rows and sets the card off with a blank line instead.
export function card(rich: boolean): { borderStyle?: string; borderDimColor?: boolean; paddingX?: number; marginY?: number } {
  return rich ? { borderStyle: 'round', borderDimColor: true, paddingX: 1 } : { marginY: 1 }
}

// A solid chip: kept for the one state that must jump out.
export function fill(els: Els, text: string, tone: Tone): RenderElement {
  const { Text } = els
  return (
    <Text size="caption" weight="semibold" color="inverseText" backgroundColor={TONE[tone]}>
      {` ${text} `}
    </Text>
  )
}

// A section label: small, semibold, dim.
export function label(els: Els, text: string): RenderElement {
  const { Text } = els
  return (
    <Text size="caption" weight="semibold" dimColor>
      {text}
    </Text>
  )
}
