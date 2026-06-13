---
name: improve-prompt
description: Improve any prompt — for LLMs/chat/agents or for generative image/video/audio models — so it produces more reliable, on-target output. Model-agnostic; uses techniques that hold across vendors. Interviews to fill real gaps, then returns a rewritten prompt plus a short rationale. Use when the user types /improve-prompt, pastes a prompt and asks to "make this better / sharpen / fix this prompt", or wants help phrasing a request to any AI model. Mode A only — never auto-fires.
---

# Improve Prompt

## Overview

Turn a vague or under-specified prompt into one that reliably produces the output the user actually wants — for **any** target model, not just Claude. The skill is model-agnostic: it uses techniques that hold across vendors (OpenAI, Google, Meta, Mistral, Midjourney, Stable Diffusion, Sora, Veo, ElevenLabs, etc.) and only mentions a vendor when a technique is genuinely vendor-specific, flagged as optional.

**Core principle:** A good prompt removes the model's need to guess. Most weak prompts fail because they leave the task, the context, the output shape, or the success criteria implicit. The job is to make those explicit without bloating the prompt.

**This is a collaborator, not an auto-rewriter.** Never auto-fire. Never silently rewrite. When the prompt is underspecified, ask before guessing — see [The Iron Rule](#the-iron-rule).

## When to Use

- User types `/improve-prompt`.
- User pastes a prompt (or describes one) and asks to improve / sharpen / fix / "make it better" / "why isn't this working".
- User wants help phrasing a request to any AI model — text, image, video, or audio.

**Don't use for:** writing a prompt from a blank slate where the user hasn't said what they want at all (interview them first about the goal), or for non-prompt copy-editing.

## The Iron Rule

```
DO NOT GUESS AT MISSING INTENT. ASK, THEN REWRITE.
```

If the prompt is missing something that materially changes the output — the audience, the format, the constraints, the target model's medium — you ask before rewriting. Inventing those details produces a confident rewrite that solves the wrong problem. The exception: if the gap has an obvious, low-risk default, fill it and **state the assumption** in the rationale so the user can correct it.

## Workflow

```
1. Classify  → text/LLM prompt or generative (image/video/audio)?
2. Diagnose  → score against the relevant dimensions; list what's missing
3. Decide    → gaps that change the output → interview; trivial gaps → assume + flag
4. Rewrite   → produce the improved prompt
5. Explain   → short rationale: what changed, why, and any assumptions made
```

### 1. Classify

The two families have different best practices. Detect which one applies (ask if ambiguous):

- **Text / LLM / agent** — chat, instructions, system prompts, coding, extraction, reasoning, roleplay.
- **Generative media** — image, video, audio/music/voice. These are *descriptive*, not *instructional*: you describe the artifact you want, not commands to follow.

### 2. Diagnose

Score the prompt against the dimensions for its family ([Dimensions](#dimensions-text--llm) below). Identify concretely what is missing or weak — cite the phrase, don't hand-wave.

### 3. Decide: interview vs. assume

For each gap, ask: *does filling this differently produce a materially different output?*

- **Yes** → ask the user. Use `AskUserQuestion` for 1–3 crisp choices (audience, format, length, tone, target model/medium, must-include / must-avoid). Don't interrogate — ask only what changes the answer.
- **No / obvious default** → fill it and note the assumption in the rationale.

Skip the interview entirely when the prompt is already well-specified and only needs tightening.

### 4. Rewrite

Apply the [techniques](#techniques-that-generalize). Keep it model-agnostic. Preserve the user's voice and intent — improve clarity and completeness, don't impose a different goal. Don't pad: a longer prompt is not automatically better.

### 5. Explain

Always close with a brief rationale:

- **What changed** — the 3–6 substantive edits, each tied to a dimension ("added an explicit output format because the original left it implicit").
- **Assumptions made** — anything filled by default, so the user can correct it.
- **Optional per-model notes** — only if a vendor-specific tweak would help (e.g. "if you're sending this to Claude, wrapping the reference text in `<doc>` tags improves grounding"; "for Midjourney, append `--ar 16:9 --style raw`"). Mark these as optional.

## Dimensions (Text / LLM)

A strong text prompt usually nails these. Use as the diagnostic checklist:

| Dimension | Question it answers | Common failure |
|---|---|---|
| **Task / verb** | What exactly should the model *do*? | Vague verb ("help with", "look at") |
| **Context** | What does the model need to know that it can't infer? | Missing background, data, or constraints |
| **Role / persona** | From whose expertise should it answer? | Omitted when it would sharpen the answer |
| **Audience** | Who reads the output? | Unspecified → wrong register/depth |
| **Output format** | Shape, structure, length, schema | "Tell me about X" with no shape |
| **Examples** | What does good look like? | Zero-shot where one example would fix it |
| **Constraints** | Must-include, must-avoid, length, tone, do-not | No boundaries → drift |
| **Success criteria** | How is a good answer judged? | Implicit → unmeasurable |
| **Reasoning cue** | Should it think step-by-step / show work? | Asking for a hard answer with no room to reason |

## Dimensions (Generative media)

Image/video/audio prompts are descriptive and order-sensitive. Diagnostic checklist:

| Dimension | Applies to | Notes |
|---|---|---|
| **Subject** | all | The main thing — concrete, specific nouns |
| **Action / motion** | video, image | What's happening; for video, the camera move too |
| **Setting / context** | all | Environment, time, location |
| **Style / medium** | image, video | Photoreal, illustration, 3D render, film stock, art movement |
| **Composition** | image, video | Framing, shot type, angle, focal length, lens |
| **Lighting** | image, video | Direction, quality, time of day, mood |
| **Color / mood** | image, video, audio | Palette; for audio, genre/emotion/energy |
| **Detail density** | all | Specific over generic ("weathered oak" > "wood") |
| **Technical params** | all | Aspect ratio, duration, resolution, BPM/key, voice/accent |
| **Negatives** | image, video | What to exclude (where the model supports it) |

**Front-load the most important terms** — most media models weight earlier tokens more heavily.

## Techniques That Generalize

These hold across vendors and both families:

1. **Be specific and concrete.** Replace abstractions with the exact thing. "Summarize in 3 bullets for a non-technical exec" beats "summarize nicely."
2. **State the output contract.** Format, length, structure, and what *not* to include. For LLMs, ask for the exact schema. For media, state aspect ratio / duration / resolution.
3. **Show, don't just tell.** One or two examples (few-shot) anchor the model far more reliably than adjectives. For media, reference styles/artists/film stocks concretely.
4. **Give the model room to reason** (text). For anything analytical, allow step-by-step or a scratchpad before the final answer; ask for the answer *last*.
5. **Set boundaries.** Explicit must-include / must-avoid lists prevent drift more reliably than hoping.
6. **Provide context the model can't infer.** Paste the data, the prior decision, the audience — don't make it guess.
7. **One prompt, one job.** Split multi-goal prompts; chained simple prompts beat one tangled mega-prompt.
8. **Front-load importance** (media especially). Lead with subject and the non-negotiable attributes.
9. **Prefer positive instruction.** "Write in plain active voice" works better than "don't be verbose" on most models; use negatives only for true exclusions.
10. **Keep it as short as it can be while staying complete.** Every clause should earn its place; padding dilutes the signal.

## Output Template

```
## Improved prompt

<the rewritten prompt, in a fenced block so it's copy-paste ready>

## What changed
- <edit> — <which dimension / why>
- ...

## Assumptions
- <anything filled by default; omit section if none>

## Optional per-model notes
- <vendor-specific tweak, marked optional; omit section if none>
```

When the change is small, collapse to the improved prompt + a one-line rationale. When you interviewed first, the rationale can reference the answers ("set the format to a comparison table per your choice").

## Examples

### Text — before/after

**Before:** `write about our new feature`

**After interview** (audience: existing customers; channel: changelog; tone: concise):
```
Write a changelog entry announcing <FEATURE> to existing customers.

Audience: current users, moderately technical.
Length: 80–120 words.
Structure: one-sentence what-it-is, then 2–3 bullets of concrete benefits, then a one-line how-to-enable.
Tone: direct, no marketing superlatives.
Do not invent capabilities — only describe: <paste the feature's actual behavior here>.
```

### Image — before/after

**Before:** `a nice picture of a city`

**After:**
```
A rain-soaked Tokyo side street at night, neon signage reflecting in puddles,
a lone figure under a translucent umbrella, shallow depth of field, 35mm,
cinematic teal-and-magenta palette, wet asphalt detail, volumetric haze,
photoreal. --ar 16:9
```
Rationale: led with subject + setting, added composition (35mm, shallow DoF), lighting/mood, concrete detail density, and an aspect ratio; `--ar` is Midjourney-specific (optional — drop it for other models).

## Red Flags — STOP

- About to rewrite a prompt whose **goal you're guessing at** → ask first (Iron Rule).
- About to **pad** a prompt with boilerplate that doesn't change the output → cut it.
- Adding **vendor-specific syntax** to the main rewrite instead of the optional notes → keep the core agnostic.
- **Skipping the rationale** → the user can't learn or correct without it.
