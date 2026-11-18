// ClauDeck's default theme ("My theme") as an app look: light sand and
// violet, dark gray and blue, amber for needs-you, crimson for failed.
// Desktop and mobile draw it; terminal and editors keep their own colors.
import type { EngineInterface } from 'claude-code'

import { makeColors } from './make-colors.js'

// A look lasts one session, so turning the option off takes effect at the
// next one. No clear here: a clear at session start or reload would wipe
// another plugin's look.
export async function setFocusLook($: EngineInterface): Promise<void> {
  const { theme } = makeColors({
    label: 'ClauDeck Focus',
    id: 'claudeck-focus',
    roles: { accent: '#6e56cf', danger: '#e93d82', warning: '#e28936', success: '#30a46c' },
    light: {
      gray: {
        anchors: {
          'surface-0': '#f5f3fa',
          'surface-1': '#fbfaff',
          'surface-2': '#fdfcfe',
          'text-primary': '#21201c',
          'text-secondary': '#42423d',
          'text-muted': '#63635e',
        },
      },
    },
    dark: {
      roles: { accent: '#0090ff' },
      gray: {
        anchors: {
          'surface-0': '#070c12',
          'surface-1': '#0b121b',
          'surface-2': '#0d1520',
          'surface-3': '#111927',
          'text-primary': '#eeeeee',
          'text-secondary': '#b4b4b4',
          'text-muted': '#9b9b9b',
        },
      },
    },
  })
  await $.theme.set({ colors: theme })
}
