export type StageName = 'vision' | 'spec' | 'plan' | 'blueprint' | 'execute'
export type StageStatus = 'missing' | 'present' | 'stale' | 'done' | 'blocked' | 'unknown'
export type Stage = { name: StageName; status: StageStatus; detail: string }
// useCases: the IDs on the step's `use cases: [UC2]` line, when it has one.
export type PlanStep = { n: number; goal: string; useCases?: string[] }
export type UseCase = { id: string; goal: string }
// useCases: the plan's `## Use cases`, else the spec's; 'none' for `none — internal change`.
export type SlugState = { slug: string; stages: Stage[]; next: string; steps: PlanStep[]; useCases?: UseCase[] | 'none' }
// planVersion: the plan version the step lines ran against; a new version drops it.
export type Progress = { slug: string; step: number; total: number; isComplete: boolean; planVersion?: number }
export type ChainView = { slugs: SlugState[]; progress?: Progress; scopes: string[] }
export type CacheClock = { lastRequestAt: number; ttlMs: number; contextTokens: number; isColdSaid: boolean }
export type TreeNode = {
  name: string
  path: string
  isDir: boolean
  purpose: string
  exports: { name: string; line?: number }[]
  importers: number
  children: TreeNode[]
  // A changed file the codemap does not list yet.
  isUnmapped?: true
}
export type CodemapTree = { root: TreeNode; fileCount: number; updated: string }
export type Touch = 'read' | 'edit'
export type GitMark = 'M' | 'A' | 'D' | 'R' | '?'
export type GitView = { marks: Record<string, GitMark>; stale: string[] }
export type TreeRow = {
  key: string
  depth: number
  isDir: boolean
  isOpen: boolean
  label: string
  detail: string
  canOpen: boolean
  touch?: Touch
  git?: GitMark
  isStale?: true
}
export type NowState = { kind: 'you' | 'tool' | 'agent' | 'claude'; what: string; since: number }
export type WorkTab = 'files' | 'changes' | 'problems' | 'plan' | 'agents' | 'rules'
export type RuleTier = 'shipped' | 'company' | 'user' | 'project'
// One rule as hooks/lib/rules-cli.js lists it: the winning tier, every tier
// that has the key, and the manifests that turn it off.
export type RuleRow = {
  key: string
  name: string
  scope: string[]
  tier: RuleTier
  tiers: RuleTier[]
  isLocked: boolean
  disabledIn: Array<'user' | 'project'>
}
// cli: the rules-cli.js path rule-prime recorded; none when priming is off.
export type RulesView = { rules: RuleRow[]; cli?: string; error?: string }
// A contexture hook bundle as its /config row shows it.
export type HookRow = { key: string; label: string; description: string; isOn: boolean; isLocked: boolean }
export type AgentRow = {
  id: string
  type: string
  description: string
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
  startTime: number
  cwd: string
  parentId?: string
  isTeammate: boolean
  // False once the engine dropped the agent's task row: Open can't show it.
  hasRow: boolean
}
export type AgentView = { rows: AgentRow[]; at: number; clearedAt: number; convergedAt: number }
export type AgentNote = { last: string; files: string[] }
export type FormId = 'orchestrate' | 'dispatch' | 'execute' | 'review' | 'checkpoint' | 'capture' | 'autonomy' | 'sessions'
export type BoardRow = { session: string; owns: string; status: string; handoffs: string }
export type CheckKind = 'test' | 'type' | 'lint'
export type Problem = { key: string; kind: CheckKind; file?: string; line?: number; title: string; detail: string }
export type CheckRun = { command: string; kind: CheckKind; isFailed: boolean; problems: Problem[] }
export type FileChange = {
  path: string
  rel: string
  isNew: boolean
  hunks: Array<{ id: string; oldStart: number; oldLines: number; newStart: number; newLines: number; at: number; adds: number; dels: number; text: string }>
}
export type CodemapView = { tree?: CodemapTree; mtimeMs: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'contexture-ui': {
      chain: Shaped<ChainView>
      cache: Shaped<CacheClock>
      codemap: Shaped<CodemapView>
      open: Shaped<string[]>
      touched: Shaped<Record<string, Touch>>
      tab: Shaped<WorkTab>
      now: Shaped<NowState | null>
      nowAt: Shaped<number>
      git: Shaped<GitView>
      isChangedOnly: Shaped<boolean>
      lastFilled: Shaped<string>
      before: Shaped<Record<string, string | null>>
      changes: Shaped<FileChange[]>
      checks: Shaped<CheckRun[]>
      picked: Shaped<string[]>
      agents: Shaped<AgentView>
      agentNotes: Shaped<Record<string, AgentNote>>
      form: Shaped<FormId | null>
      formFields: Shaped<Record<string, string>>
      contract: Shaped<Record<string, string>>
      board: Shaped<BoardRow[]>
      strategy: Shaped<'auto' | 'subtask' | 'multi-agent'>
      planSlug: Shaped<string | null>
      isDoneShown: Shaped<boolean>
      fileFilter: Shaped<string>
      shownChange: Shaped<string | null>
      rules: Shaped<RulesView>
      hooks: Shaped<HookRow[]>
      ruleFilter: Shaped<string>
      openScopes: Shaped<string[]>
      isRuleProjectOnly: Shaped<boolean>
    }
  }
}
