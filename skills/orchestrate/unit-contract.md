# orchestrate: unit return contract

Paste the `produced:` schema below into every unit's dispatch prompt at Q3; Q4 reads it back.

## Unit return contract

Every dispatched unit returns in a **known shape** so the parent reassembles structured
pieces instead of re-parsing prose. There are two *separately keyed* blocks:

- **`produced:`** — what the unit *did* (this section). Used by Q4 convergence.
- **`harvest:`** — what the unit *learned* (decisions / lessons /
  open_questions). Orthogonal; routed to `/capture` + `/recap` on Mode-A confirmation. A
  unit may emit one, both, or neither.

The `produced:` block is **tool-neutral and human-writable** — plain YAML with no Agent-tool
return-semantics assumption. A human at a worktree, or a Codex / Cursor worker, could fill it
in by hand. This matters for the cross-tool portability era: orchestration must not assume the
Claude Agent tool is the only worker.

```yaml
produced:
  status: done            # done | blocked | partial — the forced-loud signal from Q3.5; never a confident fake
  scope_declared:         # echo of the POSITIVE scope handed at dispatch (Q3) — Q4's boundary-audit comparand
    - docs/findings/<topic>.md   # paths the unit was told it may write
  files_changed:          # the unit's CLAIM of what it wrote — cross-checked at Q4, never trusted
    - docs/findings/<topic>.md
  summary: >              # one paragraph: the integrative input to Q4 Stage-2 synthesis
    Verified the platform-capability half of the findings: no mid-flight subagent
    observability, SubagentStop/maxTurns exist, background agents are pollable peers.
  self_check: "claims verified against code.claude.com docs"   # UNTRUSTED — Q4's separate verifier overrides it
  # present only when status is blocked or partial:
  # blocked_reason: "…"
  # needs: ["…"]          # what the parent must supply / re-scope to unblock
  # budget_used: "7/10 steps"
```

The `harvest:` block rides alongside, separately keyed.
