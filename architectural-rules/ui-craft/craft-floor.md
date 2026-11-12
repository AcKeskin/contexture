---
name: UI craft floor
description: Checks every built UI must pass on the rendered result - contrast, spacing rhythm, type, states, state meaning, browser surfaces, copy.
type: user
kind: architectural-rule
scope: [ui-craft]
relevance: when-domain-ui-craft
---

Check these on the rendered result, in one look, not as intentions.

- <!-- id: ui-floor-coherence --> Read the feeling words from the direction, then point at each visible element and ask whether it serves them. List what does not, and fix or remove it before the checks below. Remove extras first (badges, icons, helper lines, dividers nobody needs); less on screen fixes more than restyling.
- <!-- id: ui-floor-contrast --> Text contrast at least 4.5:1, large text and UI parts 3:1, checked in every theme the UI ships (light and dark). Secondary text on a colored surface is a tint of that surface, never plain gray.
- <!-- id: ui-floor-hierarchy --> One element per view is the most important, and it looks it (size, weight or position). Equal boxes of equal weight hide the number the user came for.
- <!-- id: ui-floor-spacing --> Tight inside a group, wider between groups, more space above a heading than below it. One spacing scale, not one value everywhere.
- <!-- id: ui-floor-alignment --> Everything sits on one grid: left edges of text, inputs and cards line up, and items that belong together sit closer than items that do not.
- <!-- id: ui-floor-type --> Body measure 65-75ch, line height 1.4-1.6 for body, clear size steps (at least 1.25x between heading levels; secondary text at the same level may differ by color alone), no tracking tighter than -0.03em, no wide tracking on body text.
- <!-- id: ui-floor-states --> Every view handles: empty, loading, error, long or missing values, and the narrowest width it supports (a desktop app: its minimum window size). Empty states say what is missing and give one next action.
- <!-- id: ui-floor-state-meaning --> Color states by meaning: red only for errors and danger, amber for needs-attention, neutral for normal off or idle. A stopped service the user stopped is not an error. Never color as the only signal: pair it with a word or icon.
- <!-- id: ui-floor-copy --> Labels and status text are true for the current state and use the product's words. Two status lines on one screen never disagree ("idle" next to "streaming"), and no text repeats the word beside it. Buttons name their action; errors name the problem and the fix.
- <!-- id: ui-floor-browser-surfaces --> Focus rings, text selection, scrollbars and form controls are styled from the palette, not left at browser defaults. Number columns use tabular figures.
- <!-- id: ui-floor-motion --> Motion only where it explains a change. Ease-out, 150-250ms for feedback, `transform` and `opacity` only, `prefers-reduced-motion` respected. No identical entrance on every section.

**Why:** these are the failures that make UI read as unfinished, and none of them is a taste call. Sources: pbakaus/impeccable (craft floor, detector rules), vercel-labs/web-interface-guidelines, ibelick/ui-skills (baseline-ui), Figma "UI design principles" (proximity, alignment), WCAG 2.2.
