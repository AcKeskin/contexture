---
name: design-proposal
description: Use when the user asks for a page, artifact or set of pages that presents a design, proposal, architecture or research outcome to a team for discussion, or asks for a presentation or playground copy of such a page.
---

# design-proposal

Builds a page a team discusses together. The page shows what is planned and, where they exist, the other ways it could go with their limitations. Domain-agnostic: an API family, a service split, a data model, a UI flow or a process change all get the same treatment.

## The page, in one paragraph

The readers already know the domain and why the work exists. Each page covers one area of the design. It opens with a one-line lede and a diagram of the mechanism, then the interfaces in the design's own notation, then one topic block per open choice. A topic block is **Plan** (the choice, one or two plain sentences, with the reason only when it is not obvious), followed by **Other ways**: a two-column table of each alternative and its limitation. A known cost of the plan itself goes in one "The catch:" line under the plan. That is the whole vocabulary of the page. Full recipe and tripwires: `references/page-recipe.md`.

## Procedure

### 1. Gather the source

- Read what the user points at: a prior artifact, a doc, a ticket, a conversation. When the source is an artifact or page, read all of it.
- Extract only forward-looking content: the plan, the choices, the alternatives. Leave behind how the work got here.
- Ask nothing that the source, the code or the repo already answers.

### 2. Research before writing

- Look for work already in flight on the topic and shape the plan around it: recent branches, open PRs, design docs, tickets. Delegate this sweep to a search agent when it spans many places. A plan that ignores the team's current modules gets rejected in the room.
- Check every named identifier (function, type, extension, endpoint, flag, table) against its source of truth: headers, schemas, specs, the codebase. Report in chat any name you cannot confirm; do not print it on the page as fact.

### 3. Pick the look

- Search the project for its own brand: theme or color token files, a design-system package, a logo SVG's fills, an app style sheet. Use those colors and the brand font, provided it is on Google Fonts.
- When the project has none, ask the user once which brand to follow, or use a neutral palette. Never carry a brand over from another project.
- Start from `assets/page-shell.html`: tabbed pages, topic blocks, signature highlighting and diagram classes, all driven by color tokens. Fill its token slots and follow the `artifact-design` skill's page contract (load it before writing).

### 4. Write the pages

- One tab per area. The first tab is an overview: one diagram of the whole, and a table of the parts (name, side or owner, where it attaches, what it does).
- Every area tab gets at least one diagram of its mechanism: a sequence for a protocol, a flow for data, a mapping band for translations, a timeline for lifetimes, side by side for a comparison. Use the `artifact-diagramming` skill.
- Write interfaces as real signatures or schemas, in the notation the team will implement.

### 5. Copy pass

- Run the `humanize` skill on the prose when it is installed. Otherwise apply the copy rules in `references/page-recipe.md`.
- Then run the tripwires in `references/page-recipe.md` against the file. Every hit is removed or rewritten before publishing.

### 6. Publish and iterate

- Publish as an artifact and give the link. Tell the user it is private until they share it.
- When a comment asks for a change: re-read the part, change it, then update every other page that mentions the same choice. A choice that flips moves the old plan into Other ways with its limitation. Reply in the thread and resolve it.
- When the user asks a question about the design without asking for an edit, answer in chat and leave the page alone.

### 7. Playground copy (on request)

When the user wants to present or discuss on the page itself, build a second artifact from the same file with the annotation layer: inline `assets/annotation-layer.css` into the page style and `assets/annotation-layer.js` before `</body>`, append " playground" to the title, and publish it under a new file name so the original stays clean. The layer gives pen, marker, text, sticky notes, eraser, laser, undo, hide, full screen and arrow keys between tabs. Drawings stay in the viewer's browser; offer shared storage only if the team needs to draw together.

## Relationship to other skills

- `artifact-design`, `artifact-diagramming`: the page contract and diagram mechanics this skill builds on.
- `humanize`: the copy pass.
- `human-view`: projects an LLM planning artefact for one approver. This skill builds a team-facing discussion page.
