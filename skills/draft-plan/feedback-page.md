# draft-plan: feedback page

Read when the user picks `page` at the review gate (step 9). Adapted from `backnotprop/plannotator` (read 2026-11-16).

## Render

1. Write the plan as it would land ([templates.md](templates.md)) to `.draft-plan.tmp.md` at the project root.
2. Run `node <skill dir>/feedback-page.mjs .draft-plan.tmp.md`. It writes `.draft-plan.feedback.html` next to it, deletes the temp file and prints the path.
3. With the Artifact tool, publish the page (icon `note`, to the same URL on re-runs). Without it, give the local path. Then wait.

The page: the plan with line numbers. Click a line (shift-click for a range), pick Change, Question or Drop, write a note. A general note on top. Notes stay in the browser until Clear. Copy feedback gives text like:

```
Plan feedback: Plan — cart (v1) (2 notes)

1. Change, under "Step 2: Map the error", line 26:
   > - Outcome: the API returns 422
   Use 409, the client already handles it.

2. Drop, under "Step 2: Map the error", lines 27-28:
   > - Smaller option: reuse the generic 400 handler
   Drop these lines.

General: Looks right overall.
```

## Apply

Pasted feedback is an **edit** at the gate:

- **Change** and **Drop**: apply to the lines quoted, matched by text (line numbers are a hint; the draft may have moved).
- **Question**: answer it in the reply before re-presenting. Change the plan only if the answer calls for it.
- **General**: apply like a Change to the whole plan.

Re-present per the gate's mode. Quoted lines and notes are the user's words for this plan only, not standing rules. Delete `.draft-plan.feedback.html` when the gate closes (accept or reject).
