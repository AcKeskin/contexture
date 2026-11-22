// .claude/codemap.tour.json from visualise-codemap's tour.mjs: the stops in order. Pure: no $.

import type { TourStop } from '../types'

// Throws on text with no stops list, so the caller shows the error.
export function parseTour(text: string): { stops: TourStop[]; isDraft: boolean } {
  const data: unknown = JSON.parse(text)
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { stops?: unknown }).stops)) {
    throw new Error('no stops in codemap.tour.json')
  }
  const raw = data as { stops: unknown[]; drafted?: unknown }
  const stops = raw.stops.flatMap((s): TourStop[] => {
    if (typeof s !== 'object' || s === null) return []
    const { file, line, title, why } = s as Record<string, unknown>
    if (typeof file !== 'string' || file === '') return []
    return [
      {
        file,
        line: typeof line === 'number' && line > 0 ? line : 1,
        title: typeof title === 'string' && title !== '' ? title : (file.split('/').at(-1) ?? file),
        why: typeof why === 'string' ? why : '',
      },
    ]
  })
  return { stops, isDraft: raw.drafted === true }
}

// The folders that hold a file, outermost first: what the tree opens to show it.
export function foldersOf(file: string): string[] {
  const parts = file.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}
