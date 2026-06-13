---
name: Share-readiness — no owner identity or machine assumptions in the harness
description: When authoring contexture artefacts (skills, agents, rules, hooks, settings templates), never bake in the owner's identity, machine paths, or installed-tool assumptions — they break the moment someone else clones the config. Read environment from config with a "configure me" fallback.
type: user
kind: architectural-rule
scope: [config-authoring]
relevance: when-touching-skills, when-touching-agents, when-touching-rules, when-touching-hooks, during-review
relations:
  - type: related_to
    target: architectural-rules/universal/no-hardcoded-machine-paths.md
    note: no-hardcoded-machine-paths is the path-specific instance (it also governs a user's shipped scripts, so it stays in universal). Share-readiness is the config-authoring superset — paths PLUS identity PLUS tool assumptions.
  - type: supports
    target: architectural-rules/universal/config-is-truth.md
    note: same principle — environment belongs in config, not baked into the artefact — applied to the full set of owner-coupling leaks.
---

This rule governs **authoring the harness itself** (contexture's skills / agents / rules / hooks / settings templates), not a user's project code. A user's own application code *should* contain their paths and identity; flagging that would be wrong. The line: rules under `config-authoring/` fire only when building the config, never on the code the config is used to write.

<!-- id: share-readiness-principle --> contexture is a **shareable artefact**: a peer clones it, runs bootstrap, and customizes via config without editing shipped files. For that to hold, no shipped artefact may assume the owner's identity or machine. Three leak categories, all forbidden as literals in a shipped artefact:
<!-- id: share-readiness-paths --> **Paths** — a home directory, drive letter, vault root, username-bearing path, or absolute project location (`C:\Users\<name>\...`, `/Users/<name>/...`, `D:\Personal\...`). Read from config at runtime. (This is the [[no-hardcoded-machine-paths]] rule; share-readiness restates it as one of three categories.)
<!-- id: share-readiness-identity --> **Identity** — the owner's name, username, or email baked into a skill body, frontmatter template, or default value (a `reviewer:` field, an `author:` literal). Resolve from `git config`, from harness config, or leave a clearly-marked placeholder the skill fills at runtime.
<!-- id: share-readiness-tools --> **Tool assumptions** — hardcoding that a specific tool is installed at a specific path (a `bun` runtime, a personal CLI at `D:/Personal/...`, a named MCP) without a documented prerequisite and a graceful-degrade path. A friend who lacks the tool must get a clear message, never a crash or a silent wrong result.
<!-- id: share-readiness-fallback --> When a config value is absent, **surface a "configure this" message** naming the exact key to set — never silently guess, never write to a fabricated location, never substitute the owner's value as a default. (Mirrors the allowlist-surfacing and [[config-is-truth]] patterns.)

**Why:** the config was a single-user artefact; sharing it (peer fork + customize) makes owner-coupling a portability defect, not a cosmetic one. A leak is correct on exactly one machine for exactly one person — every other clone gets a crash, a misattribution, or a write to the wrong place. The discipline was reactive (a vault-path leak shipped, broke a second machine, was fixed once); engraving it makes prep surface it while authoring and review audit it after, so the next leak is caught before a friend hits it.

**Smell:** grepping `skills/`, `agents/`, `architectural-rules/`, `commands/`, or settings templates for a username, a drive letter, an email, or a personal tool path returns hits. Each un-annotated hit is a share-readiness defect. The `bootstrap --verify` leak check automates this grep.
