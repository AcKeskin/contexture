// Scope-chain state from file text, the same checks as skills/work-state.
// Pure: no $, no I/O. load.ts reads the files.

import type { PlanStep, Progress, SlugState, Stage, UseCase } from '../types'

export type Versioned = { version: number; text: string }
export type SlugFiles = {
  hasVision: boolean
  spec?: Versioned
  plan?: Versioned
  hasBlueprint: boolean
}

// `| slug | v2 | active | ...` rows of a specs or plans INDEX.md.
export function parseIndex(md: string): Map<string, { version: number; status: string }> {
  const rows = new Map<string, { version: number; status: string }>()
  for (const line of md.split(/\r?\n/)) {
    const cells = line.split('|').map(c => c.trim())
    const version = /^v(\d+)$/.exec(cells[2] ?? '')
    const slug = cells[1]
    if (!slug || !version) continue
    rows.set(slug, { version: Number(version[1]), status: (cells[3] ?? '').toLowerCase() })
  }
  return rows
}

// Top-level `key: value` lines of the leading --- block. A key with a list
// under it maps to ''.
export function frontmatter(md: string): Map<string, string> {
  const keys = new Map<string, string>()
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m || m[1] === undefined) return keys
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv && kv[1] !== undefined) keys.set(kv[1], (kv[2] ?? '').trim())
  }
  return keys
}

// The text after `from` up to the next `## ` heading.
function sectionAfter(md: string, from: number): string {
  const rest = md.slice(from)
  const end = /^## /m.exec(rest)
  return end ? rest.slice(0, end.index) : rest
}

// `· use cases: [UC2, UC3]` on the Serves line, or `- Use cases: [UC2]` alone.
function useCaseIds(body: string): string[] {
  const line = /use cases:\**\s*\[?([^\]\n]*)/i.exec(body)
  return line?.[1]?.match(/UC\d+/g) ?? []
}

export function planSteps(md: string): PlanStep[] {
  return [...md.matchAll(/^## Step (\d+):\s*(.+)$/gm)].map(m => {
    const ids = useCaseIds(sectionAfter(md, m.index + m[0].length))
    return { n: Number(m[1]), goal: (m[2] ?? '').trim(), ...(ids.length > 0 ? { useCases: ids } : {}) }
  })
}

// `### UC1: goal` headings under `## Use cases` (skills/spec/use-cases.md).
// 'none' for `none — internal change`; undefined when there is no section.
export function useCases(md: string): UseCase[] | 'none' | undefined {
  const head = /^## Use cases[ \t]*$/im.exec(md)
  if (!head) return undefined
  const body = sectionAfter(md, head.index + head[0].length)
  const found = [...body.matchAll(/^### (UC\d+):\s*(.+)$/gm)].map(m => ({ id: m[1] ?? '', goal: (m[2] ?? '').trim() }))
  if (found.length > 0) return found
  return /^\s*none\b/i.test(body) ? 'none' : undefined
}

export type UseCaseRow = UseCase & { steps: number[] }

// Each use case with the plan steps that list it. isTracked: some step lists
// a use case. A plan from before use cases lists none, so nothing in it reads
// as uncovered.
export function useCaseCoverage(s: SlugState): { rows: UseCaseRow[]; isTracked: boolean } {
  if (s.useCases === undefined || s.useCases === 'none') return { rows: [], isTracked: false }
  const rows = s.useCases.map(uc => ({ ...uc, steps: s.steps.filter(st => st.useCases?.includes(uc.id)).map(st => st.n) }))
  return { rows, isTracked: s.steps.some(st => (st.useCases?.length ?? 0) > 0) }
}

// A plan's `spec:` pin: a version, 'none' for a --task plan, undefined if absent.
export function specPin(md: string): number | 'none' | undefined {
  const pin = frontmatter(md).get('spec')
  if (pin === undefined || pin === '') return undefined
  // draft-plan writes `spec: none — task description in Context`.
  if (/^none\b/i.test(pin)) return 'none'
  const v = /v(\d+)(?:\.md)?["']?$/.exec(pin)
  return v ? Number(v[1]) : undefined
}

// isReady: draft-plan would plan from it. A legacy spec with no done
// criteria is ready (draft-plan warns and goes on); a draft or one with
// questions that block the plan is not.
function specStage(spec: Versioned | undefined): { stage: Stage; isReady: boolean } {
  if (!spec) return { stage: { name: 'spec', status: 'missing', detail: '' }, isReady: false }
  const fm = frontmatter(spec.text)
  const v = `v${spec.version}`
  if (fm.get('done_criteria_provisional') === 'true' || fm.get('status') === 'draft') {
    return { stage: { name: 'spec', status: 'present', detail: `${v} draft` }, isReady: false }
  }
  const blocking = spec.text.match(/blocks:\s*plan/g)?.length ?? 0
  if (blocking > 0) {
    const detail = `${v}, ${blocking} open question(s) block the plan`
    return { stage: { name: 'spec', status: 'present', detail }, isReady: false }
  }
  if (fm.has('done_criteria')) return { stage: { name: 'spec', status: 'done', detail: `${v} active` }, isReady: true }
  return { stage: { name: 'spec', status: 'present', detail: `${v}, no done criteria` }, isReady: true }
}

function planStage(files: SlugFiles, spec: Stage): Stage {
  const plan = files.plan
  const pin = plan ? specPin(plan.text) : undefined
  if (plan && pin === 'none') return { name: 'plan', status: 'present', detail: `v${plan.version}, task plan` }
  if (spec.status === 'missing') return { name: 'plan', status: 'blocked', detail: 'no spec' }
  if (!plan) return { name: 'plan', status: 'missing', detail: '' }
  if (typeof pin === 'number' && files.spec && pin < files.spec.version) {
    return { name: 'plan', status: 'stale', detail: `pins spec v${pin}, active spec is v${files.spec.version}` }
  }
  return { name: 'plan', status: 'present', detail: `v${plan.version}` }
}

function executeStage(slug: string, total: number, progress: Progress | undefined): Stage {
  if (progress?.slug === slug) {
    return progress.isComplete
      ? { name: 'execute', status: 'done', detail: `${total} steps done` }
      : { name: 'execute', status: 'present', detail: `step ${progress.step}/${total}` }
  }
  return { name: 'execute', status: 'unknown', detail: 'no run seen this session' }
}

function nextAction(slug: string, isTaskPlan: boolean, spec: ReturnType<typeof specStage>, plan: Stage, execute: Stage): string {
  if (isTaskPlan) return execute.status === 'done' ? `/close-out ${slug}` : `/execute ${slug}`
  if (spec.stage.status === 'missing') return `/spec ${slug}`
  if (!spec.isReady) return `/spec ${slug} (${spec.stage.detail})`
  if (plan.status === 'missing') return `/draft-plan ${slug}`
  if (plan.status === 'stale') return `/draft-plan ${slug} (stale)`
  if (execute.status === 'done') return `/close-out ${slug}`
  return `/execute ${slug}`
}

export function resolveSlug(slug: string, files: SlugFiles, progress?: Progress): SlugState {
  const steps = files.plan ? planSteps(files.plan.text) : []
  const spec = specStage(files.spec)
  const plan = planStage(files, spec.stage)
  const execute = executeStage(slug, steps.length, progress)
  const isTaskPlan = files.plan !== undefined && specPin(files.plan.text) === 'none'
  const stages: Stage[] = [
    { name: 'vision', status: files.hasVision ? 'present' : 'missing', detail: '' },
    spec.stage,
    plan,
    { name: 'blueprint', status: files.hasBlueprint ? 'present' : 'missing', detail: 'optional' },
    execute,
  ]
  const cases = (files.plan && useCases(files.plan.text)) ?? (files.spec && useCases(files.spec.text))
  return { slug, stages, next: nextAction(slug, isTaskPlan, spec, plan, execute), steps, ...(cases ? { useCases: cases } : {}) }
}

const STEP_DONE = /✓ Step (\d+) complete: ([^\n]*?)(?:\. Verified|\n|$)/g
const PLAN_DONE = /Plan complete\. \d+ steps? done/g

// Reads /execute's result lines (skills/execute/SKILL.md 3e), oldest first.
// The slug is the one whose plan has that step goal, else the only one with a
// plan, when it has a step N (execute may reword a goal). "Plan complete" counts only after the last step line. Keeps `prior`
// when the text says nothing new.
export function matchProgress(
  text: string,
  slugs: ReadonlyArray<{ slug: string; steps: PlanStep[] }>,
  prior?: Progress,
): Progress | undefined {
  let found = prior
  let lastAt = -1
  const planned = slugs.filter(s => s.steps.length > 0)
  for (const m of text.matchAll(STEP_DONE)) {
    const n = Number(m[1])
    const goal = (m[2] ?? '').trim().toLowerCase()
    const owner =
      planned.find(s => s.steps.some(st => st.n === n && st.goal.toLowerCase() === goal)) ??
      (planned.length === 1 && planned[0]?.steps.some(st => st.n === n) ? planned[0] : undefined)
    if (!owner) continue
    found = { slug: owner.slug, step: n, total: owner.steps.length, isComplete: false }
    lastAt = m.index
  }
  const isComplete = [...text.matchAll(PLAN_DONE)].some(m => m.index > lastAt)
  return found && isComplete ? { ...found, isComplete: true } : found
}

export function statusText(view: { slugs: SlugState[]; progress?: Progress; scopes: string[] }): string | undefined {
  const parts: string[] = []
  const p = view.progress
  if (p) parts.push(p.isComplete ? `${p.slug} done` : `${p.slug} step ${p.step}/${p.total}`)
  else if (view.slugs.length === 1 && view.slugs[0]) parts.push(`${view.slugs[0].slug} next ${view.slugs[0].next.split(' ')[0]}`)
  else if (view.slugs.length > 1) parts.push(`${view.slugs.length} slugs`)
  if (view.scopes.length > 0) parts.push(`rules ${view.scopes.join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

export type StepMark = 'done' | 'next' | 'todo'
// 'auto' leaves --strategy out (execute's default, sequential).
export type Strategy = 'auto' | 'subtask' | 'multi-agent'

// Each plan step as done (seen in /execute's step lines), next, or to do.
export function stepMarks(s: SlugState, progress?: Progress): Array<PlanStep & { mark: StepMark }> {
  const isMine = progress?.slug === s.slug
  const doneTo = isMine ? (progress.isComplete ? Infinity : progress.step) : 0
  let hasNext = false
  return s.steps.map(st => {
    if (st.n <= doneTo) return { ...st, mark: 'done' }
    if (hasNext) return { ...st, mark: 'todo' }
    hasNext = true
    return { ...st, mark: 'next' }
  })
}

// `/execute` with the step to start from and the strategy, when not the default.
export function executeCommand(slug: string, from?: number, strategy: Strategy = 'auto'): string {
  const parts = [`/execute ${slug}`]
  if (from !== undefined && from > 1) parts.push(`--from ${from}`)
  if (strategy !== 'auto') parts.push(`--strategy ${strategy}`)
  return parts.join(' ')
}

// The command part of a next action, without its note ("(stale)").
export function commandOf(next: string): string {
  return next.replace(/\s+\(.*\)$/, '')
}

