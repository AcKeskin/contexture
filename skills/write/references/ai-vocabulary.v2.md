# AI-texture catalogue — v2 (2026-07)

Source-of-truth for the `/humanize` skill and the `universal/prose-authenticity` rule. **Both import this; neither inlines it.** Grounded in a verified research base (Wikipedia WikiProject AI Cleanup primary + peer-reviewed detection literature).

> **Load-bearing framing — read first.** These are *potential signs, not proof*. LLMs train on human writing, so every marker here also appears in genuine human prose. **Discriminative power is DENSITY in aggregate, never a single instance.** One "delve", one rule-of-three, one em-dash means nothing. Score frequency-per-N-words and cluster, never presence. The skill reports advisory likelihood; it never emits a binary AI/human verdict.

## Versioning

This lexicon drifts by LLM era (~quarterly decay — the primary source stratifies it). It is `v2`, dated 2026-07. Refresh via `/capture` (propose-confirm) → write `ai-vocabulary.v3.md`, never edit in place mid-life, never self-edit from the skill. The skill imports the highest active version.

**Changes from v1:** added the *Marketing / puffery adjectives* and *Long-word substitutions* bullets in section A. Both derive from ASD-STE100 Simplified Technical English word rules, which independently converged on the same lexical tells.

## A. Lexical — AI-vocabulary lexicon (density signal)

High density of these is the single strongest lexical tell. Era-stratified; weight current-era words higher.

**Core (era-stable, 2023→now):** delve, intricate, tapestry, testament, underscore, showcase, robust, pivotal, boasts, bolstered, meticulous, garner, interplay, landscape (figurative), vibrant, foster/fostering, cultivate, leverage (as verb), seamless, holistic, nuanced, multifaceted, realm, elevate, harness (as verb), navigate (figurative), unlock, empower, streamline, crucial, essential, vital.

**Marketing / puffery adjectives:** cutting-edge, world-class, next-generation, revolutionary, effortless, game-changing, state-of-the-art. Emotional tone in place of meaning. Density here is a strong tell in technical registers, where the norm is no adjective at all.

**Long-word substitutions (prefer the short common word):** utilize → use, facilitate → help, ensure → make sure, obtain → get, demonstrate → show, commence/initiate → start, prior to → before, subsequent to → after, regarding → about. Individually unremarkable; a cluster of the long forms reads as machine formality.

**Connectives / hedges (density):** additionally, moreover, furthermore, notably, importantly, "it's worth noting", "it's important to note", "in today's …", "when it comes to", "at the end of the day".

**Affirmation fillers:** "a testament to", "stands as a testament", "plays a (vital/crucial) role", "a rich tapestry of", "in the ever-evolving landscape of".

## B. Structural / rhetorical patterns (frequency signal)

Discriminate by repetition, not by one occurrence.

1. **Rule-of-three overuse** — stacked triplets (adj-adj-adj; "X, Y, and Z" parallel phrases) appearing repeatedly.
2. **Negative parallelism** — "not just X but Y", "it's not X, it's Y", "no X, no Y — just Z". LLMs reach for explicit antithesis far more than humans.
3. **Significance / legacy puffery** — undue emphasis on a subject's broader importance, enduring impact, transformative nature.
4. **"Despite these challenges…" conclusions** — formulaic pivot-to-optimism endings; dedicated "Challenges" sections.
5. **Cross-segment uniformity** — even paragraph lengths, consistent register across intro/body/conclusion. Humans modulate; LLMs stay flat. **Signal concentrates in the body/middle** — weight it; intros/conclusions look more human and yield more false negatives.
6. **Em-dash / connective overuse (current-era — SOFT, voice-relative signal)** — the *spaced em-dash* (` — `) used as the default connective at high density is a current LLM stylistic fingerprint. **NOT a hard tell**: never flag a single or occasional em-dash (see `false-positives.md`); judge *frequency* against the author's sample and the register norm. Acts mainly at rewrite time — diversify toward periods / commas / colons / parens to match the author's cadence, do not ban.

## C. Communication artifacts (any register)

Chatbot residue: "Certainly!", "Great question", "I hope this helps", knowledge-cutoff disclaimers, "As an AI…", sycophantic openers, "Let me break this down".

## Scoring inputs (see SKILL.md for the 4 dimensions)

- **Marker density** — count + frequency of A + B per N words. Strongest aggregate signal.
- **Cross-segment uniformity** — body-weighted divergence of vocabulary richness across segments.
- **Length gate** — below ~120 words (classifiers) / ~200 (GPT-4-class), suppress or aggregate; do not issue a per-message verdict.
- **Proficiency-confound flag** — see `false-positives.md`; down-weight proficiency-proxy signals so non-native writers are not penalized.
