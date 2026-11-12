---
name: UI direction before code
description: Settle the look before writing UI. Read what the project already decided; when nothing is decided, help the user decide instead of falling back on model defaults.
type: user
kind: architectural-rule
scope: [ui-craft]
relevance: when-domain-ui-craft
---

- <!-- id: ui-direction-read-first --> Before the first UI edit, read what the project already decided: DESIGN.md, `.claude/visual/contract.json`, token or theme files, the existing screens. Follow them. The brief wins over any rule in this tier.
- <!-- id: ui-direction-feeling --> Start from the feeling. Write one line: who uses it, in what moment, and 2-3 words for how it should feel (e.g. "calm, exact, quietly warm"). Every choice after that (type, color, density, shape, motion, copy) must point at those words; one that does not is removed or changed, not kept because it looks nice. Record the line with the direction.
- <!-- id: ui-direction-mode --> Name the surface's mode, from the screen, not the product: **Operate** (task tools, dashboards, settings), **Read** (docs, articles), **Persuade** (landing, pricing), **Experience** (portfolio, showcase). Operate and Read show craft as precision and restraint; Persuade and Experience earn a bold, committed look. A settings page is never "made bolder".
- <!-- id: ui-direction-ask --> When new UI has no decided look, do not pick silently. Ask 2-3 questions in one round: who uses it, where and for how long; how it should feel; 1-3 products they like and why. Then offer 3 contrasting directions (name, mood line, type pair, neutrals plus one accent, density, one reference from the user's list, awesome-design-md, Dribbble, Behance, Awwwards or Screenlane), let them pick, mix or reject, and record the pick (DESIGN.md or the `/visual` contract) with rejected options as don'ts.
- <!-- id: ui-direction-references --> A reference (an image, a named style, a product) beats adjectives. Digital styles (flat, pixel, sleek app UI) come out well from words alone; organic ones (hand-drawn, paper, collage) need a reference image or real photos and illustration (Unsplash, the user's own). Use references for direction, never to copy one designer's work.
- <!-- id: ui-direction-you-pick --> "You pick" is an answer: pick, give the reason in one line, record it as a choice they can change.
- <!-- id: ui-direction-no-invented-values --> Never invent colors or fonts from memory. Derive a palette from one seed with a tool (Material color utilities, Leonardo, Radix Colors scales) or take it from the project; take fonts from the project or Google Fonts, icons from one set (the project's, else Lucide). With no tool at hand, a fix that needs a new value (a contrast repair) derives it from an existing token by shifting its OKLCH lightness, and says so.
- <!-- id: ui-direction-small-change --> A small fix to existing UI skips the questions: match the incumbent look.

**Why:** generic UI is the model's default when nothing pins the look ("distributional convergence"). Ban lists only move the default; a decided direction removes it. Sources: Anthropic, "Improving frontend design through Skills"; pbakaus/impeccable (modes, shape); Maya Brennan, "How to de-slopify your designs" (uxdesign.cc: references, digital-to-organic spectrum).
