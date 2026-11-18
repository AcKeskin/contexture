// Puts a command in the reply box for the person to send. Never sends, the
// same rule as ClauDeck's next-step chips.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

// The last text this mod put in the box: only that, or an empty box, may
// be replaced. Anything else is the person's own.
const lastFilled = atom({ plugin: 'contexture-ui', key: 'lastFilled' } as const, '', { shape: 'lastFilled-1' })

// True when the text went in; false when it was refused, with a toast.
export async function fillReply($: EngineInterface, text: string): Promise<boolean> {
  const draft = (await $.prompt.read()).text.trim()
  if (draft !== '' && draft !== (await read($, lastFilled)).trim()) {
    $.ui.toast('The reply box has your text. Clear it, then press again.')
    return false
  }
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast(`Could not fill the reply box. Type: ${text}`)
    return false
  }
  await update($, lastFilled, () => text)
  return true
}
