# Page recipe

The reference for `design-proposal`. The page is a discussion surface for people who already know the domain, so every element on it either states the plan or shows another way and its limit.

## Structure

| Element | What it is |
| --- | --- |
| Header band | Product or design name, one short subtitle, the page tabs. |
| Overview tab | One-line lede, a diagram of the whole, a parts table (name, side or owner, attaches to, does). Family-wide choices as topic blocks. |
| Area tab | Eyebrow (area name), title, one-line lede, a mechanism diagram, the interfaces, then topic blocks. |
| Interfaces | Real signatures, schemas or config, in the notation the team will implement. Comments in them state a contract in a few words. |
| Topic block | `h3` naming the choice as a noun phrase. **Plan** box. Optional "The catch:" line. **Other ways** table. |
| Plan box | The chosen option in one or two sentences. Add the reason only when a reader would ask why. |
| Other ways table | Two columns, no header row: the alternative, then its limitation. One alternative per row. |
| Diagram | A `figure` with an SVG and a one-sentence caption stating what the picture shows. |

Write for the room: no notes addressed to the presenter, no pacing cues, no "ask the team" markers. An open point stays in the topic as an Other way or a "The catch:" line.

## Copy rules

Apply these when the `humanize` skill is not available, and keep them in mind when it is.

- Short sentences. One idea per sentence.
- Plain verbs, active voice. "The client half writes into the app's image", not "the image is populated by".
- Name the real thing: the call, the type, the field. A reader who uses the API daily reads a paraphrase as vague.
- Use one term per concept across all tabs. A synonym reads as a second concept.
- No stock phrases, no filler adverbs, no rule-of-three stacking.
- Use "we" for the team's plan. State limitations as facts.

## Tripwires

Before publishing, search the page text for these. Remove or rewrite each hit.

| Pattern | Why it is on the list |
| --- | --- |
| `Lean`, `Decided`, `Proposal`, `Open`, `TBD`, `TODO` as labels | Status flags. The page has one status: this is the plan. |
| `today`, `currently`, `at the moment`, `existing`, `legacy`, `old`, `POC` | History. The page describes the outcome, not the starting point. |
| Ticket ids, branch names, commit hashes, `file:line` | Implementation trail. Keep them in chat for the user. |
| `phase`, `milestone`, `done when`, `sprint` | Delivery planning. A separate document. |
| Explanations of basics the domain's readers know | Readers know the domain. |
| A vote, poll or comment widget | The platform's comment threads cover discussion. |

A hit can stay only when it is part of the design itself, for example an API state literally named `CLOSED` or a "legacy mode" the design keeps on purpose.

## When a choice flips

1. Rewrite the Plan box with the new choice.
2. Move the old plan into Other ways, with the limitation that made the team drop it.
3. Search every tab for the old choice: signatures, diagram labels, captions, the parts table. Update each.
4. Remove an alternative that no longer applies instead of leaving it as history.
