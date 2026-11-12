---
name: UI interaction basics
description: Interaction and accessibility rules that hold in any UI stack - real controls, focus, forms, destructive actions, long content, primitives.
type: user
kind: architectural-rule
scope: [ui-craft]
relevance: when-domain-ui-craft
---

- <!-- id: ui-int-real-controls --> Buttons for actions, links for navigation; never a clickable `div`. Icon-only buttons get an accessible name.
- <!-- id: ui-int-focus --> Every interactive element has a visible `:focus-visible` style; never remove an outline without a replacement.
- <!-- id: ui-int-primitives --> Use the project's components first, then an accessible primitive library (Radix, Base UI, React Aria; UI Toolkit in Unity). Do not hand-build keyboard or focus behavior.
- <!-- id: ui-int-forms --> Inputs have labels, the right `type` and `autocomplete`; paste is never blocked; errors show next to the field and focus moves to the first one.
- <!-- id: ui-int-feedback --> Every action shows its result where the user is looking: pressed, working, done or failed. Silence after a click reads as broken.
- <!-- id: ui-int-consistency --> The same action looks the same and sits in the same place on every screen; the same color always means the same thing.
- <!-- id: ui-int-destructive --> Destructive or irreversible actions ask for confirmation or offer undo, and sit apart from the controls used often (no Delete next to Save).
- <!-- id: ui-int-steps --> Long forms and setup flows ask only what this step needs and show where the user is (step 2 of 4).
- <!-- id: ui-int-shortcuts --> In tools used daily, frequent actions get a keyboard shortcut, shown in the tooltip or menu; long lists get search.
- <!-- id: ui-int-long-content --> Text you do not control can be long, empty or unbreakable: truncate, clamp or wrap on purpose (`min-width: 0` on flex children).
- <!-- id: ui-int-state-in-url --> Tabs, filters and selected items that a user would share or reload live in the URL.
- <!-- id: ui-int-no-transition-all --> No `transition: all`; animate named properties.

**Why:** these break real use (keyboard, screen reader, a long name, a reload) and no visual review catches them. Sources: vercel-labs/web-interface-guidelines (MIT), ibelick/ui-skills (MIT), Blush "A Quick Guide to UI Design Fundamentals" (visibility, consistency, feedback, predictability), Figma "UI design principles" (progressive disclosure, proximity, shortcuts).
