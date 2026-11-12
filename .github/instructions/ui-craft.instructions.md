---
applyTo: "**/*.{html,css,scss,less,vue,svelte,jsx,tsx,uss,uxml}"
---

# ui-craft rules

> Auto-loaded by Copilot when editing files matching `**/*.{html,css,scss,less,vue,svelte,jsx,tsx,uss,uxml}`. Generated from `architectural-rules/ui-craft/` — do not hand-edit.

## UI craft floor

Check these on the rendered result, in one look, not as intentions.

- Read the feeling words from the direction, then point at each visible element and ask whether it serves them. List what does not, and fix or remove it before the checks below. Remove extras first (badges, icons, helper lines, dividers nobody needs); less on screen fixes more than restyling.
- Text contrast at least 4.5:1, large text and UI parts 3:1, checked in every theme the UI ships (light and dark). Secondary text on a colored surface is a tint of that surface, never plain gray.
- One element per view is the most important, and it looks it (size, weight or position). Equal boxes of equal weight hide the number the user came for.
- Tight inside a group, wider between groups, more space above a heading than below it. One spacing scale, not one value everywhere.
- Everything sits on one grid: left edges of text, inputs and cards line up, and items that belong together sit closer than items that do not.
- Body measure 65-75ch, line height 1.4-1.6 for body, clear size steps (at least 1.25x between heading levels; secondary text at the same level may differ by color alone), no tracking tighter than -0.03em, no wide tracking on body text.
- Every view handles: empty, loading, error, long or missing values, and the narrowest width it supports (a desktop app: its minimum window size). Empty states say what is missing and give one next action.
- Color states by meaning: red only for errors and danger, amber for needs-attention, neutral for normal off or idle. A stopped service the user stopped is not an error. Never color as the only signal: pair it with a word or icon.
- Labels and status text are true for the current state and use the product's words. Two status lines on one screen never disagree ("idle" next to "streaming"), and no text repeats the word beside it. Buttons name their action; errors name the problem and the fix.
- Focus rings, text selection, scrollbars and form controls are styled from the palette, not left at browser defaults. Number columns use tabular figures.
- Motion only where it explains a change. Ease-out, 150-250ms for feedback, `transform` and `opacity` only, `prefers-reduced-motion` respected. No identical entrance on every section.

**Why:** these are the failures that make UI read as unfinished, and none of them is a taste call. Sources: pbakaus/impeccable (craft floor, detector rules), vercel-labs/web-interface-guidelines, ibelick/ui-skills (baseline-ui), Figma "UI design principles" (proximity, alignment), WCAG 2.2.

## UI direction before code

- Before the first UI edit, read what the project already decided: DESIGN.md, `.claude/visual/contract.json`, token or theme files, the existing screens. Follow them. The brief wins over any rule in this tier.
- Start from the feeling. Write one line: who uses it, in what moment, and 2-3 words for how it should feel (e.g. "calm, exact, quietly warm"). Every choice after that (type, color, density, shape, motion, copy) must point at those words; one that does not is removed or changed, not kept because it looks nice. Record the line with the direction.
- Name the surface's mode, from the screen, not the product: **Operate** (task tools, dashboards, settings), **Read** (docs, articles), **Persuade** (landing, pricing), **Experience** (portfolio, showcase). Operate and Read show craft as precision and restraint; Persuade and Experience earn a bold, committed look. A settings page is never "made bolder".
- When new UI has no decided look, do not pick silently. Ask 2-3 questions in one round: who uses it, where and for how long; how it should feel; 1-3 products they like and why. Then offer 3 contrasting directions (name, mood line, type pair, neutrals plus one accent, density, one reference from the user's list, awesome-design-md, Dribbble, Behance, Awwwards or Screenlane), let them pick, mix or reject, and record the pick (DESIGN.md or the `/visual` contract) with rejected options as don'ts.
- A reference (an image, a named style, a product) beats adjectives. Digital styles (flat, pixel, sleek app UI) come out well from words alone; organic ones (hand-drawn, paper, collage) need a reference image or real photos and illustration (Unsplash, the user's own). Use references for direction, never to copy one designer's work.
- "You pick" is an answer: pick, give the reason in one line, record it as a choice they can change.
- Never invent colors or fonts from memory. Derive a palette from one seed with a tool (Material color utilities, Leonardo, Radix Colors scales) or take it from the project; take fonts from the project or Google Fonts, icons from one set (the project's, else Lucide). With no tool at hand, a fix that needs a new value (a contrast repair) derives it from an existing token by shifting its OKLCH lightness, and says so.
- A small fix to existing UI skips the questions: match the incumbent look.

**Why:** generic UI is the model's default when nothing pins the look ("distributional convergence"). Ban lists only move the default; a decided direction removes it. Sources: Anthropic, "Improving frontend design through Skills"; pbakaus/impeccable (modes, shape); Maya Brennan, "How to de-slopify your designs" (uxdesign.cc: references, digital-to-organic spectrum).

## UI interaction basics

- Buttons for actions, links for navigation; never a clickable `div`. Icon-only buttons get an accessible name.
- Every interactive element has a visible `:focus-visible` style; never remove an outline without a replacement.
- Use the project's components first, then an accessible primitive library (Radix, Base UI, React Aria; UI Toolkit in Unity). Do not hand-build keyboard or focus behavior.
- Inputs have labels, the right `type` and `autocomplete`; paste is never blocked; errors show next to the field and focus moves to the first one.
- Every action shows its result where the user is looking: pressed, working, done or failed. Silence after a click reads as broken.
- The same action looks the same and sits in the same place on every screen; the same color always means the same thing.
- Destructive or irreversible actions ask for confirmation or offer undo, and sit apart from the controls used often (no Delete next to Save).
- Long forms and setup flows ask only what this step needs and show where the user is (step 2 of 4).
- In tools used daily, frequent actions get a keyboard shortcut, shown in the tooltip or menu; long lists get search.
- Text you do not control can be long, empty or unbreakable: truncate, clamp or wrap on purpose (`min-width: 0` on flex children).
- Tabs, filters and selected items that a user would share or reload live in the URL.
- No `transition: all`; animate named properties.

**Why:** these break real use (keyboard, screen reader, a long name, a reload) and no visual review catches them. Sources: vercel-labs/web-interface-guidelines (MIT), ibelick/ui-skills (MIT), Blush "A Quick Guide to UI Design Fundamentals" (visibility, consistency, feedback, predictability), Figma "UI design principles" (progressive disclosure, proximity, shortcuts).

## Refuse generic UI defaults

A brief or the project's own look can earn any of these back. Reaching for one when nothing asked for it means the choice was not made.

- Layout: a row of same-size cards (icon tile, heading, text) as the page structure; cards inside cards; the hero-metric block (big number, small label, accent); everything centered.
- Labels: a tiny uppercase letter-spaced eyebrow above headings, repeated on every section or card; 01 / 02 / 03 section numbers that carry no order.
- Color: purple-to-blue or cyan-on-dark gradients; gradient text; colored glow or radial spotlight behind content; a warm cream page as the default "tasteful" surface; more than one accent on a screen.
- Surfaces: a thick colored stripe on one side of a card; hairline border plus wide soft shadow on every card; heavy dark shadows; the same radius and shadow on every block; everything rounded to a pill; every list row in its own card; decorative grid or stripe backgrounds; glass blur as decoration; glowing borders on dark.
- Actions and data: every button primary or in its own color; gradient or glowing buttons; a destructive button as loud as the safe one; charts left in the library's default colors.
- Type: one overused face (Inter, Roboto, Geist, Space Grotesk) by reflex; an oversized italic serif hero; monospace as a "technical" costume. A platform UI face is right for a native-feeling tool.
- Motion and ornament: bounce or elastic easing; elements that float or bob; pulsing dots not tied to a live process; fake typing cursors; marquees; emoji or Unicode glyphs as icons; clip-art scenes built from SVG primitives.
- Copy: streamline, empower, supercharge, seamless, world-class; "X. No Y." punchlines; em-dash heavy body text; helper text that explains the obvious.

**Why:** each is the most common answer on the web, so it is what a model reaches for first; together they read as "generated". Ban lists go stale (fonts recommended as distinctive in 2025 are on the 2026 lists), which is why `direction` comes first and this list is the backstop. Asking a model to "de-slop" its own output works poorly; name the pattern. Sources: pbakaus/impeccable antipatterns (62 rules), Anthropic frontend-design skill, ibelick/ui-skills, "How to de-slopify your designs" (uxdesign.cc, anatomy-of-slop sheet).
