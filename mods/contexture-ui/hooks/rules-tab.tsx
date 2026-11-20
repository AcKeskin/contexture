// The Work pane's Rules tab: contexture's hook switches (its /config rows)
// and the architectural rules across tiers, each with On/Off. Rules are
// listed and toggled by hooks/lib/rules-cli.js, the same manifests /rules
// writes; Edit, Why and locked rules go through /rules in the reply box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, ResolveInput } from 'claude-code'

import type { HookRow, RuleRow, RulesView } from '../types'
import { loadRulesCli } from './load'
import { card, chip, isRich, label } from './look'
import { byScope, filterRules, hookRows, isOff, listArgs, parseRules, ruleDetail, rulesCommand, toggleArgs } from './rules'
import { fillReply } from './reply'

const rules = atom({ plugin: 'contexture-ui', key: 'rules' } as const, { rules: [] } as RulesView, { shape: 'rules-1' })
const hooks = atom({ plugin: 'contexture-ui', key: 'hooks' } as const, [] as HookRow[], { shape: 'hooks-1' })
const ruleFilter = atom({ plugin: 'contexture-ui', key: 'ruleFilter' } as const, '', { shape: 'rule-filter-1' })
const openScopes = atom({ plugin: 'contexture-ui', key: 'openScopes' } as const, [] as string[], { shape: 'open-scopes-1' })
const isRuleProjectOnly = atom({ plugin: 'contexture-ui', key: 'isRuleProjectOnly' } as const, false, {
  shape: 'rule-project-only-1',
})

const CLI_MS = 15_000

async function loadHooks($: EngineInterface): Promise<void> {
  const rows = hookRows(await $.config.list())
  await update($, hooks, () => rows)
}

async function loadRuleList($: EngineInterface): Promise<void> {
  const cli = await loadRulesCli($)
  if (cli === undefined) {
    await update($, rules, () => ({ rules: [] }))
    return
  }
  const root = await $.session.root()
  const run = await $.process.run(listArgs(cli, root), { timeoutMs: CLI_MS })
  const list = run.exitCode === 0 ? parseRules(run.stdout) : undefined
  await update($, rules, () =>
    list === undefined
      ? { rules: [], cli, error: `Could not list rules: ${run.stderr.trim() || `exit ${run.exitCode}`}` }
      : { rules: list, cli },
  )
}

// Reads the hook switches and the rules again.
export async function loadRules($: EngineInterface): Promise<void> {
  await loadHooks($)
  await loadRuleList($).catch(err => update($, rules, v => ({ ...v, rules: [], error: `Could not list rules: ${String(err)}` })))
}

async function toggleHook($: EngineInterface, row: HookRow): Promise<void> {
  const set = await $.config.set({ key: row.key, value: !row.isOn })
  if (set.deny !== undefined) $.ui.toast(`${row.label}: ${set.deny}`)
  await loadHooks($)
}

async function toggleRule($: EngineInterface, cli: string, r: RuleRow): Promise<void> {
  const root = await $.session.root()
  const run = await $.process.run(toggleArgs(cli, root, r, await read($, isRuleProjectOnly)), { timeoutMs: CLI_MS })
  if (run.exitCode !== 0) $.ui.toast(run.stderr.trim().replace(/^rules-cli: /, '') || `Could not change ${r.key}`)
  await loadRuleList($)
}

export async function rulesTab($: EngineInterface, e: ResolveInput<'Pane'>): Promise<RenderElement> {
  const els = $.ui.resolve(e)
  const { Box, Button, Input, Text } = els
  const rich = isRich(e)
  const switches = await read($, hooks)
  const view = await read($, rules)
  const query = await read($, ruleFilter)
  const opened = await read($, openScopes)
  const isProjectOnly = await read($, isRuleProjectOnly)
  const shown = filterRules(view.rules, query)
  const isFiltering = query.trim() !== ''
  const offCount = view.rules.filter(isOff).length
  const toggleScope = (scope: string) =>
    update($, openScopes, list => (list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]))
  const cli = view.cli

  const ruleLine = (r: RuleRow) => (
    <Box gap={1} justifyContent="space-between">
      <Box flexDirection="column" flexShrink={1}>
        <Text weight="semibold" dimColor={isOff(r)} wrap="truncate-end">
          {r.name}
        </Text>
        <Text size="caption" dimColor wrap="truncate-end">
          {r.key} · {ruleDetail(r)}
        </Text>
      </Box>
      <Box gap={1} flexShrink={0}>
        <Button key={`why-${r.key}`} label="Why" onPress={() => fillReply($, rulesCommand('where', r.key))} />
        <Button key={`edit-${r.key}`} label="Edit" onPress={() => fillReply($, rulesCommand('edit', r.key))} />
        {r.isLocked && !isOff(r) ? (
          <Button key={`rule-${r.key}`} label="Off…" onPress={() => fillReply($, rulesCommand('disable', r.key))} />
        ) : (
          <Button
            key={`rule-${r.key}`}
            label={isOff(r) ? 'Off' : 'On'}
            variant={isOff(r) ? 'secondary' : 'primary'}
            onPress={() => (cli === undefined ? undefined : toggleRule($, cli, r))}
          />
        )}
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={rich ? 1 : 0}>
      <Box justifyContent="space-between" alignItems="center">
        {label(els, `HOOKS · ${switches.filter(s => s.isOn).length} on`)}
        <Button key="rules-reload" label="Reload" onPress={() => loadRules($)} />
      </Box>
      <Box flexDirection="column" {...card(rich)}>
        {switches.length === 0 ? (
          <Text dimColor wrap="wrap">
            No contexture hook switches in /config. A bootstrap install sets them in ~/.claude/hook-config.json
            (enabled.hookBundles), then re-runs bootstrap.
          </Text>
        ) : (
          switches.map(s => (
            <Box gap={1} justifyContent="space-between">
              <Box flexDirection="column" flexShrink={1}>
                <Text weight="semibold" dimColor={!s.isOn}>
                  {s.label}
                </Text>
                {s.description === '' ? null : (
                  <Text size="caption" dimColor wrap="wrap">
                    {s.description}
                  </Text>
                )}
              </Box>
              {s.isLocked ? (
                chip(els, rich, 'set by policy', 'idle')
              ) : (
                <Button
                  key={`hook-${s.key}`}
                  label={s.isOn ? 'On' : 'Off'}
                  variant={s.isOn ? 'primary' : 'secondary'}
                  onPress={() => toggleHook($, s)}
                />
              )}
            </Box>
          ))
        )}
      </Box>

      <Box justifyContent="space-between" alignItems="center" marginTop={1}>
        {label(els, `RULES · ${view.rules.length}${offCount > 0 ? ` · ${offCount} off` : ''}`)}
        <Box gap={1} alignItems="center">
          <Text size="caption" dimColor>
            Off for
          </Text>
          <Button
            key="rule-scope-user"
            label="Everywhere"
            variant={isProjectOnly ? 'secondary' : 'primary'}
            onPress={() => update($, isRuleProjectOnly, () => false)}
          />
          <Button
            key="rule-scope-project"
            label="This project"
            variant={isProjectOnly ? 'primary' : 'secondary'}
            onPress={() => update($, isRuleProjectOnly, () => true)}
          />
        </Box>
      </Box>
      {view.error !== undefined ? (
        <Text color="error" wrap="wrap">
          {view.error}
        </Text>
      ) : cli === undefined ? (
        <Text dimColor wrap="wrap">
          No rule list yet. Press Reload. If it stays empty, turn on Rule priming above and start a new session: it tells this tab where the rules live.
        </Text>
      ) : (
        <Box flexDirection="column">
          <Input
            key="rule-filter"
            placeholder="Filter rules"
            value={query}
            onInput={value => update($, ruleFilter, () => value)}
            onSubmit={value => update($, ruleFilter, () => value)}
          />
          {isFiltering ? (
            shown.length === 0 ? (
              <Text dimColor>No rule holds "{query.trim()}".</Text>
            ) : (
              <Box flexDirection="column" gap={rich ? 1 : 0} marginTop={1}>
                {shown.map(ruleLine)}
              </Box>
            )
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {byScope(shown).map(([scope, list]) => {
                const isOpen = opened.includes(scope)
                const off = list.filter(isOff).length
                return (
                  <Box flexDirection="column">
                    <Button
                      key={`scope-${scope}`}
                      plain
                      label={`${isOpen ? '▾' : '▸'} ${scope} · ${list.length}${off > 0 ? ` · ${off} off` : ''}`}
                      onPress={() => toggleScope(scope)}
                    />
                    {isOpen ? (
                      <Box flexDirection="column" gap={rich ? 1 : 0} marginLeft={2}>
                        {list.map(ruleLine)}
                      </Box>
                    ) : null}
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
