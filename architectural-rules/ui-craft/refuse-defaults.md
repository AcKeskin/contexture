---
name: Refuse generic UI defaults
description: The patterns that mark UI as model-generated. Do not reach for them unless the brief asks; when one appears, rewrite the element rather than soften it.
type: user
kind: architectural-rule
scope: [ui-craft]
relevance: when-domain-ui-craft
---

A brief or the project's own look can earn any of these back. Reaching for one when nothing asked for it means the choice was not made.

- <!-- id: ui-refuse-layout --> Layout: a row of same-size cards (icon tile, heading, text) as the page structure; cards inside cards; the hero-metric block (big number, small label, accent); everything centered.
- <!-- id: ui-refuse-labels --> Labels: a tiny uppercase letter-spaced eyebrow above headings, repeated on every section or card; 01 / 02 / 03 section numbers that carry no order.
- <!-- id: ui-refuse-color --> Color: purple-to-blue or cyan-on-dark gradients; gradient text; colored glow or radial spotlight behind content; a warm cream page as the default "tasteful" surface; more than one accent on a screen.
- <!-- id: ui-refuse-surfaces --> Surfaces: a thick colored stripe on one side of a card; hairline border plus wide soft shadow on every card; heavy dark shadows; the same radius and shadow on every block; everything rounded to a pill; every list row in its own card; decorative grid or stripe backgrounds; glass blur as decoration; glowing borders on dark.
- <!-- id: ui-refuse-actions --> Actions and data: every button primary or in its own color; gradient or glowing buttons; a destructive button as loud as the safe one; charts left in the library's default colors.
- <!-- id: ui-refuse-type --> Type: one overused face (Inter, Roboto, Geist, Space Grotesk) by reflex; an oversized italic serif hero; monospace as a "technical" costume. A platform UI face is right for a native-feeling tool.
- <!-- id: ui-refuse-motion --> Motion and ornament: bounce or elastic easing; elements that float or bob; pulsing dots not tied to a live process; fake typing cursors; marquees; emoji or Unicode glyphs as icons; clip-art scenes built from SVG primitives.
- <!-- id: ui-refuse-copy --> Copy: streamline, empower, supercharge, seamless, world-class; "X. No Y." punchlines; em-dash heavy body text; helper text that explains the obvious.

**Why:** each is the most common answer on the web, so it is what a model reaches for first; together they read as "generated". Ban lists go stale (fonts recommended as distinctive in 2025 are on the 2026 lists), which is why `direction` comes first and this list is the backstop. Asking a model to "de-slop" its own output works poorly; name the pattern. Sources: pbakaus/impeccable antipatterns (62 rules), Anthropic frontend-design skill, ibelick/ui-skills, "How to de-slopify your designs" (uxdesign.cc, anatomy-of-slop sheet).
