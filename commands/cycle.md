---
description: Unattended dev-cycle loop. Set it up once; it then runs cycle after cycle (audit with online prior art, plan, implement, review/fix, draft PR) while you are away. Watch or jump in any time.
---

Run the `cycle` skill.

- `/cycle` — set up the loop in this repo (tools, limits, never-touch list, GitHub choice, notifications), then start it. In a set-up repo: show the digest.
- `/cycle <run>` — jump into a run: answer its cards, swap its slice, edit its plan. The loop picks it up at the next stage.
- `/cycle status` — heartbeat, current stage, open cards, cost.
- `/cycle watch` — follow the current stage live.
- `/cycle stop` — stop after the current stage.
- `/cycle projects-template` — project instructions that carry the cycle, for a Claude Code Project.

While it runs: a status page at `http://127.0.0.1:7777`, and notifications on the channels you chose. It never pushes to the base branch, never force-pushes and never merges.
