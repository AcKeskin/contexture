---
name: visual
description: "Visual organ for UI projects: one design contract (tokens, references, screen states), captures by named state through the project's own command, deterministic checks, and a fresh critic that decides within the contract while the user reviews after. Use on /visual setup, /visual audit, /visual verify, /visual rollback, or when /cycle runs a UI project."
disable-model-invocation: true
---

# visual

The **visual organ**. Text-reading organs cannot see a UI, compare a screen with its siblings, or keep a theme steady, and a model asked for a coherent look re-derives its taste every run. This organ fixes the taste in a **contract** the user writes once, then checks every change against it: fresh captures of named states, deterministic checks, and a **fresh critic** that decides within the contract. The user reviews the critic's decisions afterwards on the cycle status page and can roll any baseline back.

Its rules come from a hand-run on a real UI project, where an uninstructed critic got 2 of 5 findings wrong: a stale screenshot, and a deliberate choice recorded in a code comment. So every claim cites a contract line, is checked against the code, and uses captures of the current head.

`visual.mjs` next to this file does all the deterministic work; this file says when to run it and what the critic must do. `<skill-dir>` means the folder holding this file.

## When to run

- `/visual setup` — write the contract, once per project, with the user present.
- `/visual audit [run]` — find visual gaps for an audit; never fixes.
- `/visual verify <run>` — inside a cycle's stage 4: capture what the change touched and hand it to the loop's critic.
- `/visual critic <run>` — **only** as the loop's headless critic session.
- `/visual rollback <state>` — restore an earlier baseline.
- User-invoked, or run by `/cycle` when `.claude/visual/contract.json` exists. Never on its own.

## Setup

1. **Canonical tokens.** Find the file that holds the design tokens (JSON, CSS custom properties, a theme file). Ask which one is canonical when there are several, and list the others as `copies`. Design tokens in several places drift; the organ reads only the canonical file and reports drift in the copies. A plugin styled through its host's theme variables carries its values only as fallbacks (`var(--interactive-accent, #6965db)`); those fallbacks are read as tokens too.
2. **References.** Ask for 3 to 5 images (the project's own best screens, other products, mood images), each with one line on what to take from it. Copy them under `.claude/visual/references/`.
3. **States.** List the states that matter, not only the screens: for example a card you can afford, one you can't, and a maxed one. Each state names what it shows, the command that writes its image (no env prefix; variables go in `env`), and the output path. Reuse the project's own screenshot tooling. States that share one command and env run it once. When the capture starts a dev server on a fixed port, set `capture_port` (or a state's `port`): a capture refuses to run while something else already listens there, because a reused server may be serving another tree.
4. **Style dump (optional).** A command that writes computed styles as JSON (`state`, `selector`, `color`, `background`, `fontSize`, `scrollWidth`, `clientWidth`). With it the checks cover off-contract values, contrast and overflow; without it only pixel diff runs.
5. **Tells and critic settings.** Show the default tell list (`contract-defaults.json`) and ask which, if any, this project allows. `critic.scope` is `touched+1` by default (the touched states plus one unchanged sibling) or `all`; `critic.image_cap` defaults to 12. `diff.noise` (default 0.01, or a state's own `noise`) is the share of pixels two captures of the same code may differ by (font hinting, thumbnail timing) before a change is reported.
6. Write `.claude/visual/contract.json` after the user confirms it, then run `node <skill-dir>/visual.mjs contract <repo>` and `drift <repo>`. Make sure `.claude/visual/` is gitignored (propose the line; never add it silently).

```json
{
  "tokens": { "source": "docs/design/tokens.json", "copies": ["src/theme.css"] },
  "references": [{ "file": ".claude/visual/references/hud.png", "take": "dense but calm HUD" }],
  "states": [
    { "id": "shop-affordable", "shows": "merchant, enough gold", "command": "npx playwright test tests/e2e/shots.spec.ts -g shop-affordable", "env": { "SHOTS": "1" }, "output": "docs/screens/shop.png" }
  ],
  "style_dump": { "command": "npx playwright test tests/e2e/styles.spec.ts", "output": "out/styles.json" },
  "tells_off": [],
  "critic": { "scope": "touched+1", "image_cap": 12 },
  "notes": "Cyan glow is only for the time loop, Convergence UI and sci-fi heroes."
}
```

## Audit (`/visual audit`)

1. `node <skill-dir>/visual.mjs capture <repo> --out <run>/visual/audit --tree <worktree of origin/base>` for every state.
2. Diff each capture against its baseline, and run `styles` when a dump exists.
3. Look at the captures against the contract, the references and the tell list, and list gaps under the audit's *Polish* heading: state, region, the contract line, the evidence. **Check every claim against the code first**: a code comment can record that a "defect" is deliberate. A gap the contract does not settle is a taste-call row, not a defect.

## Verify (`/visual verify <run>`, inside stage 4)

Inside a `/cycle` run, **the loop** takes the captures, not the stage: after stage 4 records `done` it cuts a worktree of `origin/<base>`, runs setup's `install` there, captures every state into `<run>/visual/before`, captures every state from the run branch's worktree into `<run>/visual/after`, and runs `visual.mjs touched`, which diffs each pair above that state's `noise` and writes `touched.json`. A failed capture parks the slice with the capture's error. No change above the noise in any state means no critic.

What stage 4 still does:
1. Leave the run branch's worktree in place and built.
2. Run `styles` when a dump exists, and write findings to `<run>/visual/findings.json`. Optionally write `<run>/visual/touched.json` with `regions` (`{ "<state>": "x,y,w,h" }`) for the parts you changed; the loop keeps them.
3. Stop there. **Do not judge your own work.** The loop starts the critic as its own session once stage 4 records its outcome. On a rerun of stage 4 after the critic asked for a revision, read `<run>/visual/verdicts.json` and fix each `needs-revision` first.

## The critic (`/visual critic <run>`, headless only)

You are the critic: a fresh session that has not seen how the change was made. Judge only what the files show.

1. Read `<run>/visual/critic-input.json`. It lists the states to judge, their before / after / baseline images, the references with what to take from each, the contract summary, the active tells, and the deterministic findings.
2. Look at every image it lists, and nothing else of the run's history.
3. For each state, decide one verdict:
   - `consistent`: it matches the contract and its sibling. Cite the `contract_line` you checked it against.
   - `needs-revision`: name the `region`, the `contract_line` it breaks, and the `evidence`. Only for a real contract line; no line means it is not a revision.
   - `taste`: a real choice the contract does not settle. **Choose** an option yourself, and record `taste.chose`, `taste.alternatives` and `taste.why`. The user reviews it later; a disagreement there becomes a new contract line.
4. **Check each claim against the code** before you write it (grep the selector, the token, the comment near it), and set `checked_against_code: true`. A claim you could not check is not a verdict; leave it out and say so in `evidence` of the nearest one.
5. Write the list to `<run>/visual/verdicts.json` and stop. The loop validates it, rejects stale captures, records each decision and moves baselines on approval.

## Rollback

`node <skill-dir>/visual.mjs rollback <repo> <state> [history-file]` restores the newest earlier baseline (or the one named). The current baseline goes to history first, so a rollback can be undone. The status page's Visual view has the same button.

## What visual does NOT do

- **Not a design generator.** It checks and compares; the implementer makes the UI.
- **Not a capture framework.** The project declares its capture commands.
- **Not on by default.** Only repos with a contract.
- **Not the implementer's judge of itself.** The critic is always a separate session with a brief built from files.

## Relationship to other organs

- **cycle** — runs `audit` at stage 1, `verify` at stage 4, and the critic as its own session after stage 4; its status page carries the Visual view.
- **review** — reads code; this reads screens. Stage 4 runs both.
- **artifact-design** — guides building Artifacts; the default tells overlap with its list on purpose.
