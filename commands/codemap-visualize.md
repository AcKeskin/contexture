---
description: Render Mermaid diagrams (L1 module map, L2 file graphs, L3 export index) from .claude/codemap.md to .claude/codemap.diagrams.md and the Obsidian vault
---

Run the `codemap-visualize` skill on the current project. Reads `.claude/codemap.md` (must exist — run `/update-codemap` first if not), emits a three-tier Mermaid view, writes one copy in-repo and one to the Obsidian vault under `Projects/<ProjectFolder>/Codemap/`.

Does not rescan the filesystem. Manual trigger only.

See `~/.claude/skills/codemap-visualize/SKILL.md` for the full procedure, tier layout, and vault path inference.
