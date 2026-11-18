# contexture-ui

A Claude Code mod (function hooks) that adds a Work pane beside the chat, the same panel as ClauDeck's Focus look.

- **Work pane.** `/work` opens it. A tab row picks what it shows: Files, Changes, Problems or Plan. It opens by itself at session start in the desktop app, VS Code and mobile when a slug is in flight, never inline in a terminal. Once you close it, it stays closed (across reloads and sessions) until a command opens it.
- **Plan tab.** One block per in-flight slug: vision, spec, plan, blueprint and execute with their status, and the next command. Same checks as `/work-state`. Slugs come from the specs and plans indexes; archived slugs are left out. Under each slug its plan steps: ✓ done (from `/execute`'s step lines), ▸ next, ○ to do. Press a step, **Run plan** or the `next:` line and the command (`/execute auth --from 3`, with the strategy picked above) goes into the reply box for you to send. A draft you typed is never replaced. Steps done count from runs seen this session, against the current plan version; a stale or blocked plan shows its steps without buttons.
- **Now line.** A band above the prompt while a turn runs: what the session waits on and for how long, as ClauDeck shows it. `On Claude · writing`, `On a tool · Bash bun test server/`, `On a subagent · Explore: find SSE handlers`, or `On you · approve Bash ...` when a permission prompt asks you. It reads the model's tool requests, never hooks the tools themselves (a `tool.call` hook would stop Bash calls moving to the background). After you approve, or auto mode allows it, it still says `On you` until the tool finishes. Turn it off with the `nowLine` option.
- **Focus colors.** Off by default. The `focusColors` option colors the desktop and mobile apps with ClauDeck's default theme (light sand and violet, dark gray and blue). Turning it off takes effect in the next session; the terminal keeps its own colors.
- **Status line.** `auth step 3/7 · rules universal, typescript · cache 42m`, or the next command when nothing runs.
- **Cache clock.** Minutes until the prompt cache expires, counted from the last main-loop request. The TTL comes from that request's cache write (1h or 5m), else `promptCacheTtl`, else 1h. When it expires the status shows `cache cold` and a toast says once how many tokens the next message rewrites. It never pings to keep the cache warm. A resumed session starts from its last response time. Idea from [karanb192/cache-tax](https://github.com/karanb192/cache-tax).
- **Files tab.** `/codemap` opens it. It shows the codemap (from `/update-codemap`: `.claude/codemap.json`, else `.claude/codemap.md`) as a tree: folders with file counts, each file's purpose line and importer count (`← 3`), and its exports with their line (`:12`) when opened. Files Claude edited (●) or read (○) this session are marked; /clear resets the marks. Git marks each changed file (`M`, `A`, `D`, `R`, `?` untracked), adds changed files the codemap doesn't list, and marks ⟳ a changed file written after the codemap. **Changed only** keeps the marked files with their folders open. At session start, at the end of each turn (and a few times in the next minute, to catch a background refresh) and on `/codemap` and `/work` it re-reads the codemap (when the file changed) and runs `git status` (each time, without taking git's index lock). Idea from [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree), fed by the codemap instead of a folder walk.
- **Changes tab.** Each file Claude edited this session (Write, Edit, NotebookEdit), as diff hunks against a copy taken just before its first edit. Per hunk: **Keep** takes it (it leaves the list, the file stays), **Undo** puts the old lines back in the file, **Comment** puts `About path:line: ` in the reply box. A new file has Keep and Comment. Below the list, `/review`, `/pre-push` and `/pr-author` go into the reply box. Edits made through Bash (sed, scripts) aren't seen. Once a file has a copy, any later change to it shows, yours too, and Undo reverts it. Files over 400 KB, past 4 MB of copies in all, or not plain UTF-8 (a BOM, NUL bytes, UTF-16) aren't copied, so they have no Undo. If the hunk changed since the tab drew it, the press does nothing and asks you to look again. Claude isn't told about an Undo. /clear starts from the files as they are.
- **Problems tab.** Failing tests, type errors and lint from the test, type-check and lint commands Claude ran through Bash or PowerShell (bun, vitest, jest, pytest, go, cargo; tsc, mypy; eslint, ruff and the like), grouped by file. It reads them at the end of each turn; the newest run of each kind replaces the older one, except a run in the background or a failed run whose output names no problem (cut by `| tail`). A command counts only when the runner starts it (`cd web && npx vitest` does, `cat jest.config.js` doesn't); quoted text and heredocs don't count. **Fix this** puts the problem in the reply box; **Pick** a few, then **Dispatch N picked** puts a `/dispatch` list there. **Run checks** asks Claude to run the affected tests, then lint. Runs by subagents aren't read. /clear empties it.
- **Agents tab.** This session's subagents and teammates from `$.agent.list()`, live ones first: type and task, a clock while it runs (it moves at each agent step and once a minute), the tool it last used, how many files it edited, and its worktree when it has one. **Open** shows that agent's transcript in the main view, while the engine still holds it. Once two or more top-level subagents started since the last Converge have all finished, **Converge** puts a converge request in the reply box. /clear empties it.
- **Run bar.** A row of buttons on top of the Work pane: Orchestrate, Dispatch, Execute, Review, Checkpoint, Capture, Autonomy, Sessions. Each opens a short form (goal and units, tasks, slug and step and strategy, target and angles and output, scope, one line, the three contract pickers with the current contract from `.claude/autonomy/active.md`, the session board from `.claude/sessions-active.md` with a hand-off note). **Fill reply box** writes the command there for you to send; it never sends. If the box holds your own text, the form stays open with what you typed. Many-line fields also split on `;`. Autonomy pickers start on `keep`, so only what you change is set.
- **`/chain`.** Opens the Work pane on Plan.

It reads `.claude/specs`, `plans`, `visions`, `docs`, `archive`, `codemap.json` (or `codemap.md`) and the rule-prime watermark in `~/.claude/session-state.json`. It runs `git rev-parse` and `git status` in the project. It writes a file only when you press Undo in the Changes tab: the file Claude edited, wherever it is. Its plugin store holds the pane-closed flag; the Changes tab's file copies and the Problems tab's last runs live in session state. It refreshes at session start, at the end of each turn and on `/chain`; the cache clock ticks once a minute. The running step comes from `/execute`'s `✓ Step N complete` lines.

Skills and hooks stay in the `contexture` plugin. Other tools (Copilot, Codex, Cursor) don't run mods.

## Options

`/config` lists them under contexture-ui: `nowLine` (on) and `focusColors` (off).

## Install

```
/plugin marketplace add AcKeskin/contexture
/plugin install contexture-ui@contexture
```

## Develop

```
claude plugin validate mods/contexture-ui
claude plugin test mods/contexture-ui
claude --plugin-dir mods/contexture-ui
```

The mod API is early access and can change between Claude Code releases. Works on 2.1.325 and later (the desktop app bundles its own Claude Code, which can lag the terminal one).
