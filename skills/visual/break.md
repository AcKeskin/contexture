# visual break

Render one component on a throwaway page under every worst case that can reach it, look once, and report what visibly broke. The page is half the report. Adapted from `jakubkrehel/skills` (`break`, MIT).

## Observed, not predicted

A finding is something that broke on the page: "the label leaves the card's right edge", never "spacing feels tight". A failure you expect but did not see is not a finding. "Everything survived" is a full report.

## 1. Scope one component

One component per run. "The settings page" is not one; its text input is. When the request names several, list them and ask which. Restate it in one sentence: what it takes, what it renders, where it lives.

## 2. Keep only the axes that can reach it

Read the component first (props, slots, states, the data it renders). An axis earns a slot only when production data can take that shape. Write the kept scenarios down, one line each, then one line on the axes you dropped and why.

| Axis | Scenarios | Applies when |
| --- | --- | --- |
| Length | empty, one word, typical, several sentences, one unbreakable 60-char string | it renders text it does not control |
| Shape | emoji, RTL and mixed-direction text, tall scripts and diacritics, digits in columns | text comes from users or translations |
| Quantity | zero, one, typical, ten times typical | it renders a list or grid |
| Container | 320px, squeezed by a flex sibling, very wide | it can sit in more than one layout |
| State | loading, error, disabled, and each product state it has | it has async data or interaction |
| Environment | dark theme, 200% zoom, reduced motion, touch | the app supports them |

## 3. Build the harness page

- A scratch route in the app, importing the **real** component untouched. It inherits the app's layout, fonts, tokens and providers.
- One instance per scenario, in one column, with a short label above each.
- The page adds labels, container widths and fixture props, nothing else: no own styles, no theme swaps.
- Fixtures enter as props or mocked data at the boundary. Production never imports from the harness.
- Where the framework splits server and client components, make the page client code, or fixtures can vanish at the boundary.

## 4. Look once

Capture the page with the project's own screenshot tooling (the contract's capture command style), or open it in a browser already at hand. Read every image, top to bottom. With no way to look, say so and hand over the URL and the scenario list, with no findings.

Mark each break on the page itself, one line under its label, in one edit.

## 5. Report and stop

| Scenario | Observed | Owner |
| --- | --- | --- |
| One unbreakable 60-char string | Overflows the card, no wrap or truncation | typography / layout |
| Zero items | Blank region, no message | copy (empty state) |

Do not fix anything unasked. On a request to fix, re-render the broken scenarios afterwards to confirm. Leave the page up; delete the route and fixtures only when the user says they're done, then grep for their names so nothing is left behind.

## Before you finish

| Mistake | Fix |
| --- | --- |
| Every axis run on every component | Keep only axes whose "applies when" matches; say which you dropped |
| A predicted failure in the table | Render it, or leave it out |
| A scenario missing its content | The harness is broken, not the component; fix the client boundary and reload once |
| A lookalike component in the harness | Import the real one |
| The harness restyles the component | Labels and widths only |
| Findings phrased as taste | Report what was visible, or nothing |
