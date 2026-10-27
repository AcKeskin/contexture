# Claude Projects and cloud agents

How to use contexture where the agent runs in the cloud, not on your machine: Claude Projects, and the same idea in Copilot, Cursor, Codex and Jules.

Every one of these starts a fresh container per task. Nothing from your local `~/.claude` is there, so contexture has to be installed when the container is built. [`cloud/setup.sh`](../cloud/setup.sh) does that: it clones contexture into `~/contexture` and runs bootstrap.

## Claude Projects (Claude Code on the web)

A project holds repos, project instructions, a cloud environment, connectors and a shared memory. Each thread is a Claude Code session in its own container with the repos cloned.

### Setup

1. Open Project settings, then Cloud environment, then the gear beside the environment. Under **Setup script** add:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/AcKeskin/contexture/main/cloud/setup.sh | bash
   ```

   Extra args go to bootstrap: `... | bash -s -- --exclude=mcps`. The network policy has to allow `github.com` and `raw.githubusercontent.com`.

2. New threads get the skills with bare names (`/review`), the rules, the hooks and the status line.

3. Add short project instructions. For example:

   ```
   - Run /prep before non-trivial edits and /review before opening a PR.
   - Branch names: feat/<slug> or fix/<slug>.
   - Rules that should last go in the repo's .claude/rules/ and get committed.
   ```

### What maps where

| Project piece | Use it for |
| --- | --- |
| Repositories | The code. Each repo's committed `CLAUDE.md`, `AGENTS.md`, `.claude/rules/` and `.claude/codemap.md` load as usual. |
| Setup script | Installing contexture (above). |
| Project instructions | A few standing rules, like the example above. Keep it short, rule-prime already loads the corpus. |
| Project memory | Facts every thread needs: decisions, open work, links. This replaces the local memory store, which does not survive. |
| Connectors | GitHub is enough for `/review --pr`. |
| Account skills | Skills only, no hooks or rules. Upload a skill folder as a zip under claude.ai Settings, Capabilities. Use this if you don't want a setup script. |

### What differs from a local install

- **The container is thrown away.** `/capture`, `/recap`, `/rules` and the memory store write under `~/.claude`, which is lost when the thread ends. Put rules in the repo's `.claude/rules/` and commit them. For your own rules across projects, keep them in a repo and clone it to `~/.claude/architectural-rules-company/` in the setup script (the company tier).
- **The session root is the parent folder of the repos**, not a repo. Project rules and the codemap are per repo, so name the repo you mean, or start the thread with one repo.
- **Shared files live in `/mnt/project-files`**, outside the repo. The write blocker would stop writes there; `setup.sh` adds it to the allow list.
- **Hook paths point at the clone.** Cloud sessions can clear `~/.claude/hooks` after the setup script runs, which leaves every hook pointing at a missing file. `setup.sh` rewrites the paths in `settings.json` to `~/contexture/hooks/`.
- **The drift check is off.** Every container is new, so it only adds noise.
- **No project-memory MCP.** Bootstrap registers it only when `~/.claude.json` exists, and it doesn't at setup time. `/discover` works without it.
- **The person may be away.** Propose-confirm steps wait for an answer in the thread. Use `/autonomize` to say how far to go without asking.

The plugin route also installs from a setup script (`claude plugin marketplace add AcKeskin/contexture`, then `claude plugin install contexture@contexture`). Whether the installed plugin is still there when the session starts is untested, so the script uses bootstrap.

## Claude Projects on claude.ai (chat)

No shell, so no hooks, scripts or MCP. Two parts still help:

- **Skills.** Upload the ones that are pure instructions (`review`, `systematic-debugging`, `brainstorm`, `spec`) as account skills.
- **Rules.** Add the `architectural-rules/` files you care about as project knowledge, and paste the Stance and Boundaries sections of `AGENTS.md` into the project instructions.

## Other cloud agents

The same script works as the setup step of other tools. Rules reach them through the project's own `AGENTS.md`; generate one with `/new-agents-md` and commit it.

| Tool | Where the setup goes | What it gets | Template |
| --- | --- | --- | --- |
| Copilot cloud agent | `.github/workflows/copilot-setup-steps.yml` on the default branch | Skills (`~/.copilot/skills`). For custom agents, commit `copilot/agents/*.agent.md` to `.github/agents/`. For rules, commit the `.github/instructions/` files you want. MCP is set in the repo's Copilot settings. | [`cloud/copilot-setup-steps.yml`](../cloud/copilot-setup-steps.yml) |
| Cursor cloud agents | `.cursor/environment.json`, `install` | Skills (Cursor reads `~/.claude/skills`). For rules, commit the `cursor/rules/*.mdc` files you want to `.cursor/rules/`. Hooks aren't wired. | [`cloud/cursor-environment.json`](../cloud/cursor-environment.json) |
| Codex cloud | Environment settings, setup script | Skills, linked to `~/.codex/skills`. The agent runs offline by default, so everything is fetched during setup. | The `curl` line above |
| Jules | Environment settings, setup script | `AGENTS.md`. Skills and hooks aren't wired. | The `curl` line above |

The Claude Code path was tested in a cloud container against a scratch home: install, rerun, hook paths and the write blocker. The other tools were set up from their docs and have not been run.
