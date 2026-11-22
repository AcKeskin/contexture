# Diagram check

Run this on every diagram before the copy pass. A hand-drawn SVG looks right in the source and wrong on screen, and readers in the room see the screen.

## Before drawing

- Draw the mechanism the tab argues, not an inventory of the parts. A part the claim does not need stays out.
- Budget per diagram: at most 9 boxes, 12 arrows and 2 plan-colored marks (`.o`). Past that, split into an overview and a detail diagram.
- Arrows run horizontal and vertical, with rounded elbows where they turn. Mapping band lines may slant: put them in a `<g class="map">`. Draw arrows before boxes, and each box's text after its box. Labels sit 6-10px off their line. Arrows on one box edge each get their own spot, 12px or more apart.

## Remove test

Ask each of these once the diagram is drawn. Every yes is a cut.

- Can a box go, and the reader still follows the claim?
- Do two boxes always travel together? Merge them.
- Does the layout already show a relationship? Drop the arrow.
- Does color or shape already say what a label says? Drop the label.

## Run the script

```sh
node <skill-dir>/diagram-check.mjs <page.html> --shots <scratch-dir>
```

`<skill-dir>` is the folder holding this skill's `SKILL.md`. Put the shots in a scratch folder, never beside the page. The script opens the page at real size, unhides every tab and checks each `figure svg`:

- budget: boxes (`.box`), arrows (`.edge`) and plan-colored marks (`.o`) over the limits above. A figure with `data-delta` skips the box and arrow count (see `delta-diagram.md`)
- a11y: `role="img"` with an `aria-label`, and a `figcaption`
- viewBox: content cut at an edge
- lines (`.edge` or any line or path with an arrow marker): a diagonal segment (except inside a `.map` group, for mapping bands), an arrow behind a box it does not attach to, two arrows drawn on top of each other, two arrows starting or ending at one point
- labels: text running out of its box, covered by a box drawn after it, or sitting on a line

It prints one finding per line and exits 1 when there are any. Exit 2 means the diagrams were not checked (Playwright or Chromium missing, or the page failed to load): never treat it as findings to fix; write "diagrams not checked" and the printed reason in your message.

## Look at the shots

Open each PNG. Name at least one defect from this list, or say for each item why it does not apply:

- text clipped, overlapping, or too small to read at 100%
- a label sitting away from its own arrow
- an arrow ending in empty space
- uneven gaps between peers; a dense cluster beside an empty band

Fix by changing the layout before nudging coordinates: change the flow direction, regroup, shorten labels, merge parallel arrows. Re-run the script and look again, at most twice. A finding you keep on purpose is named in your message with the reason.
