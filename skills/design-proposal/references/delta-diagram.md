# Delta diagram

For a design whose point is a change to a structure the team already runs: a migration, a split, a rewire. Before and After side by side in one figure, and a Changes table under it. The change words, signs and budget are shared with `/blueprint`: see the `delta` template in `skills/blueprint/mermaid-templates.md`. This file is the SVG form for the page.

Not for a choice between two new options (draw those side by side as usual), and not for attribute-only changes (a table says it).

## Layout

- One `figure`, one `svg`. Before on the left, After on the right, each in its own `<g transform="translate(x 0)">` with a panel title. Both panels share one width and grid.
- Draw Before first, then copy its coordinates into After. Move a part only when the move is the change, and list it as MOVED.
- Name panels by version or date (`v1`, `v2`). These titles and the Before panel are part of the design, so the page's history tripwires do not apply to them.
- The plan color goes on the one or two changes the page argues for, not on every change.
- The delta budget in the blueprint template replaces the usual per-diagram box count. Put `data-delta` on the `figure` so the diagram check skips that count.

## Marks

Signs and meanings are in the blueprint template. In SVG, put the sign at the box's top right in `.t`, and use these shell classes:

| Change | Box | Arrow |
| --- | --- | --- |
| ADDED | `.box` | `.edge.add` |
| REMOVED | `.box.del` | `.edge.del` |
| CHANGED, MOVED | `.box` | `.edge` |
| REWIRED | | `.edge.rw` with a `rewired` label |

```html
<figure data-delta><div class="fw"><svg viewBox="0 0 760 220" role="img" aria-label="Writes move behind a queue">
  <g transform="translate(0 0)">
    <text class="t" x="0" y="14">v1</text>
    <!-- arrows, then boxes, then box text; a sign: <text class="t" x="RIGHT-14" y="TOP+16">⊖</text> -->
  </g>
  <g transform="translate(400 0)">
    <text class="t" x="0" y="14">v2</text>
  </g>
</svg></div><figcaption>CLAIM</figcaption></figure>
<div class="tw"><table>
  <thead><tr><th>Change</th><th>Part</th><th>Difference</th></tr></thead>
  <tbody><tr><td class="nm">ADDED</td><td>Write queue</td><td>buffers writes before the DB</td></tr></tbody>
</table></div>
```

One Changes row for each part and change, in the order a reader scans the After panel. A part both changed and moved takes two rows. A part with no change gets no row.
