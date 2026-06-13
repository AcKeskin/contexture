---
name: humanize
description: Detect, score, and rewrite AI-generated texture in USER-FACING prose — technical/dev docs, professional email & messaging, and project/internal docs (PR/proposal/issue). Auto-detects register, flags AI-texture by aggregate density (never single instances), scores on four evidence-based dimensions, and produces a voice-calibrated rewrite that preserves every argument. Reports advisory likelihood, never a binary AI/human verdict. Use when the user types /humanize, pastes a draft and asks to "humanize / de-AI / make this sound human / does this read like AI", or wants a doc/email/PR voice-checked. Refuses the terse model corpus (memory, codemap, specs). Mode A only — never auto-fires.
---

# Humanize

## Overview

Make user-facing prose read like a person wrote it, without changing what it says. Grounded in deep-research wf_1a39f292 (21 verified claims; Wikipedia AI-Cleanup + peer-reviewed detection literature). The catalogue is the source of truth; this skill applies it.

**Core principles (all load-bearing):**
- **Signs, not proof. Scorer, not oracle.** Every marker also appears in genuine human prose (LLMs trained on it). Report advisory **density/likelihood** — never a binary "this is AI". No text-only detector escapes a false-positive floor.
- **Density, not instance.** One "delve", one em-dash, one rule-of-three is noise. Flag clusters and frequency, never a lone occurrence.
- **User-facing track only.** This governs READMEs, public docs, email, PR/proposal/issue bodies. It must NOT touch the terse model corpus.
- **Collaborator.** Findings are proposed; the rewrite is a draft. The catalogue grows via `/capture`, never by self-editing this file.

## When to use

- User types `/humanize` (on a pasted draft, a selection, or a file path).
- User asks to "humanize / de-AI / make this human / does this sound like AI / voice-check this".

**Refuse (scope-guard):** if the target is the terse model corpus — memory bodies (`~/.claude/projects/*/memory/`), `codemap.md`, spec/plan artefacts, Claude-facing docs — stop and say:

> That's model-facing corpus (compression-disciplined by design). Humanizing it is a regression — it's meant to be terse. /humanize is for user-facing prose only.

**Don't use for:** commit messages (own hygiene rule), or non-prose copy-editing.

## Pipeline

### 0. Detect register
Classify as **tech-doc**, **email**, or **project-internal**. State the detection; allow override. Load the matching module from `references/`. If genuinely ambiguous, ask.

### 1. Length gate
If under ~120 words (classifiers) / ~200 (GPT-4-class), say so and **score conservatively or aggregate** (e.g. across a sender's recent messages / a PR author's recent descriptions). **Never** a confident per-message verdict below the floor — it's a plateau, not a cliff, but short text is unreliable.

### 2. Detect (density)
Scan against `ai-vocabulary.v1.md` (lexicon + structural patterns) and the active register module. Flag **clusters**, with exact quotes + the reason. Apply `false-positives.md` as a hard filter: do **not** flag em-dashes, single catchphrases, low-perplexity/diversity, or register-native structure (headers/bold/lists in doc registers). A lone marker is not a finding.

### 3. Score (four dimensions)
Each presented as advisory density with the "signs, not proof" caveat — not a verdict.

1. **Marker density** — count + frequency of lexicon + structural patterns per N words. Strongest aggregate signal.
2. **Cross-segment uniformity** — divergence of vocabulary richness across intro/body/conclusion, **body-weighted** (the body discriminates most; intros/conclusions look human).
3. **Length-sufficiency** — gate from step 1; below floor → suppress/discount, flag it.
4. **Proficiency-confound flag** — down-weight proficiency-proxy signals (low perplexity/diversity) so non-native writers are not penalized. Surface the flag explicitly.

### 4. Report
```
## Humanize — <register>  (detected; override if wrong)
Length: <N words> — <above floor | below floor: conservative/aggregate>

AI-texture (by density, advisory — signs, not proof):
  • "<exact quote>"  — <which marker / why a cluster>
  • ...

Scores (advisory likelihood, not a verdict):
  marker-density: <low/med/high> — <one line>
  cross-segment uniformity: <low/med/high> — <one line>
  length-sufficiency: <ok / below floor>
  proficiency-confound: <flagged? down-weighted what>

Clean-but-flagged: <conventions present that are NOT tells, named so the user isn't surprised>
```

### 5. Rewrite (voice-calibrated)
Ask for (or accept an in-context) **writing sample** — this run calibrates to it; no stored profile. Then rewrite:
- **Preserve every argument.** No added ideas, no removed substance. Only delivery changes.
- Reduce marker density; reintroduce cross-segment variation; match the register's tone and preserve-set (keep lists/headers/sign-offs/structure that the module marks native).
- **Match the author's punctuation cadence.** Diversify connectives — periods, commas, colons, parentheses — toward the author-sample's frequency, and specifically counter the LLM-default *spaced em-dash* habit (catalogue §B6). Do not eliminate em-dashes (they're legitimate); reduce *overuse* to a human cadence.
- **Re-score your own rewrite (close the loop).** A forward "sound human" instruction isn't enough: the rewriter drifts back to its own cadence (spaced em-dashes, rule-of-three, uniform connectives) even when told not to. Re-run steps 2–3 on the draft; if it still hits the author's-cadence target or carries the spaced-em-dash signature, iterate once before presenting. Counter the *rewriter's* fingerprint, not just the input's generic AI-vocabulary.
- Present the rewrite after the report. Tell the user: your edits on top are usually the best version.

### 6. Route misses
If the run surfaces a tell the catalogue lacks, propose `/capture` to add it to a **new catalogue version** (`ai-vocabulary.v2.md`). **Never** self-edit the catalogue or this file — the catalogue grows through propose-confirm capture only.

## References (imported, not inlined)
- `references/ai-vocabulary.v1.md` — lexicon + structural patterns (versioned source of truth)
- `references/false-positives.md` — the refuted / convention carve-out
- `references/{tech-doc,email,project-internal}.md` — per-register tells + preserve-sets
- `fixtures/` — labelled acceptance corpus (density LOW/HIGH pair, per-register samples, model-corpus negative)
- Rule: `architectural-rules/universal/prose-authenticity.md` — the ambient discipline authoring organs inherit
