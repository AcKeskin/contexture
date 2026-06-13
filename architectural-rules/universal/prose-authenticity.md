---
name: Prose authenticity
description: Remove AI-texture from USER-FACING prose (docs, email, PR/proposal) by aggregate density — never single instances; report likelihood, never a verdict. Hard scope-guard excludes the terse model corpus.
type: user
kind: architectural-rule
scope: [prose, documentation, writing, user-facing-docs]
relevance: when-authoring-user-docs, during-review, when-publishing
---

User-facing prose should read like a person wrote it. AI-texture (significance puffery, AI-vocabulary clusters, negative parallelism, sycophancy) undercuts published work. Catch it — but by the evidence, not by folklore.

## Scope-guard (load-bearing — read first)

Applies to the **user-facing doc track ONLY**: READMEs, public docs, guides, emails, PR/proposal/issue bodies.

**NEVER apply to the terse model corpus** — memory bodies, codemap, Claude-facing docs, spec/plan artefacts. Those are compression-disciplined *by design* (rule + why + scope, drop ceremony); "humanizing" them into flowing prose is a regression. Two doc tracks: this rule governs one of them.

Commit messages are out of scope — they have their own hygiene rule.

## How to judge (the discipline)

1. **Density, not instance.** One "delve", one em-dash, one rule-of-three means nothing — every marker also appears in genuine human writing (LLMs trained on it). Flag clusters / frequency-per-N-words, never a lone occurrence.
2. **Signs, not proof. Scorer, not oracle.** Report advisory likelihood/density; never a binary "this is AI". No text-only detector escapes a false-positive floor.
3. **Do not flag the folklore.** Em-dashes, single catchphrases, low perplexity/low diversity (a proficiency proxy that false-flags non-native writers), headers/bold/lists in doc registers — all research-refuted. See the carve-out.
4. **Below ~120 words, suppress or aggregate.** Short text (Slack, commit, terse PR) is below the reliable-detection floor — no confident per-message verdict.

## Catalogue (source of truth — imported, not inlined)

- Tells + lexicon: `skills/humanize/references/ai-vocabulary.v1.md`
- The refuted/false-positive carve-out: `skills/humanize/references/false-positives.md`
- Active organ: `/humanize` (detect → score → rewrite, voice-calibrated per run). When this rule catches a miss the catalogue lacks, route it through `/capture` — never self-edit.
