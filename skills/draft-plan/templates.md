# draft-plan: plan file template

Read at step 10, before writing the plan.

   Frontmatter:

   ```yaml
   ---
   slug: <slug>
   version: <N>
   status: active
   spec: ../../specs/<slug>/v<M>.md   # pin to the spec version this plan is built against
   supersedes: v<N-1>.md              # omit on v1
   executor: main                     # or `cheap` — see step 8b; omit on main for brevity
   created: YYYY-MM-DD
   description: <one-line — what this plan accomplishes>
   ---
   ```

   **`--task` plans (no spec):** write `spec: none — task description in Context` and put the task description in the plan's Context section. A plan whose `spec:` is `none` is exempt from the stale-pin check and the done-criteria echo — there is no pinned version to go stale and no criteria list to read.

   Body:

   ```markdown
   # Plan — <slug> (v<N>)
   Spec: <relative path to pinned spec version, or "no spec — task description below">
   Generated: YYYY-MM-DD

   ## Context
   <1–3 paragraphs from the spec or task text.>

   ## Done-criteria (from spec)
   <Echo the spec's done_criteria list verbatim, numbered. Each criterion gets a stable index that step "Serves criteria" lines reference. Skip this section entirely in legacy mode.>

   1. <criterion 1 verbatim>
   2. <criterion 2 verbatim>

   ## Step 1: <goal>
   - Files: <concrete paths>
   - Outcome: <what is true after this step>
   - Verification: <command or specific check>
   - Builds on: <path:line | stdlib/platform: <what> | dependency: <name> | new code: <why>>
   - Smaller option: <one line>   ← only when one exists
   - Serves criteria: [<list of criterion indices, e.g. 1, 3>]   ← skipped in legacy mode
   - Tags: [research] [delegate] [mechanical|judgment]   ← optional on main; [mechanical]/[judgment] mandatory in strict mode
   - Current state: <before-excerpt, file:line>   ← [delegate] steps; every step in strict mode ("new file" for new-file steps)
   - Exemplar: <path to follow as convention anchor>   ← [delegate] steps; every step in strict mode

   ## Step 2: <goal>
   ...

   ## Notes
   - Architectural rules loaded: <names only>
   - Open risks: <list, or "none">
   ```
