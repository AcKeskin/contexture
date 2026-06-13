---
name: No hardcoded machine-specific paths in skills or code
description: Machine-, user-, or install-specific paths (vault roots, home dirs, drive letters, usernames) never live as literals in a skill body, prompt, or source file. They are read from config at runtime, with a graceful "configure me" fallback when absent.
type: feedback
kind: architectural-rule
scope: [universal, configuration, skills, portability]
relevance: when-touching-skills, when-touching-paths
relations:
  - type: supports
    target: architectural-rules/universal/config-is-truth.md
    note: Same principle applied to filesystem paths — config is the single source of truth, not a literal baked into the artefact.
  - type: related_to
    target: architectural-rules/config-authoring/share-readiness.md
    note: share-readiness is the config-authoring superset — paths PLUS owner identity PLUS tool assumptions. This rule stays in universal because it also governs a user's shipped scripts; share-readiness covers the broader owner-coupling set when authoring the harness itself.
---

<!-- id: no-hardcoded-paths-rule --> A machine-, user-, or install-specific path — an Obsidian vault root, a home directory, a drive letter, a username, an absolute project location — **never** appears as a literal in a skill body, prompt template, command file, or source file. It is read from config at runtime.
<!-- id: no-hardcoded-paths-config --> The single source of truth for such paths is the machine-local config (`~/.claude/hook-config.json` for this project's skills). A skill resolves the path from config; it does not hardcode a default that happens to be one developer's machine.
<!-- id: no-hardcoded-paths-fallback --> When the config key is absent, **surface a "configure this" message** naming the exact key to set — never silently guess a path, never write to a fabricated location. (Mirrors the allowlist-surfacing pattern: tell the user the line to add, don't edit their config for them.)

**Why:** a literal like `C:/Users/SomeName/Documents/Obsidian/...` baked into a skill is correct on exactly one machine. The same user on a second PC, and every other user, gets a path that doesn't exist — the skill either fails or writes to the wrong place. Paths are environment, not logic; environment belongs in config. This is [[config-is-truth]] applied to the filesystem.

**Smell:** grepping the skills/ or src/ tree for a username, a specific drive letter, or `Documents/` returns hits. Each hit is a portability defect waiting for the second machine.
