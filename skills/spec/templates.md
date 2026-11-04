# spec: templates

## Version file (step 7)

   Frontmatter (mandatory):

   ```yaml
   ---
   slug: <slug>
   version: <N>
   status: active
   supersedes: v<N-1>.md   # null on v1 — omit the line entirely
   created: YYYY-MM-DD
   description: <one-line — what this spec is about, used by INDEX>
   done_criteria:
     - "<falsifiable, observable condition 1>"
     - "<falsifiable, observable condition 2>"
   done_criteria_provisional: false   # set true (with status: draft) only if step 5 yielded no firm criteria
   ---
   ```

   Body shape:

   ```markdown
   # Spec — <slug> (v<N>)

   ## Problem
   <what forces this work. 1–2 paragraphs.>

   ## Goals
   - <bullet>

   ## Non-goals
   - <bullet>

   ## User-facing behavior
   <from interview.>

   ## Base implementation      ← only when the prior-art pass confirmed a base
   **Base:** <path(s) to the confirmed canonical implementation>
   **Behaviour inventory:** <the base's observable behaviours, numbered — the list parity criteria reference>
   **Divergences:** <where this target deliberately differs, and why>
   **Shared core:** <port-copy or extract-shared, and the reason>

   ## Technical approach
   <from interview.>

   ## Constraints
   <deadlines, perf targets, dependencies.>

   ## Grounded context
   <loaded rules / decisions / lessons. Cite by name.>

   ## Open questions
   - <precise question> · answers: <user | research | person or role> · blocks: <plan | build | none>

   ## Not yet specified
   - <in scope, coming, not yet sharp enough to ask>

   ## Verification criteria
   <how shipped work will be judged. Specific.>

   ## Changes from v<N-1>      ← evolve flow only
   - <bullet per section that changed, with one-line summary>
   ```

   Sections with no content → write *"not addressed during interview"*. Do not invent.

## Questionnaire (step 7.5)

   ```markdown
   # <topic>: questions for <recipient>

   **Why:** <the decision riding on the answers>. **From:** <user> **To:** <recipient>

   ## Context
   <one paragraph for someone who hasn't seen the spec>

   ## How to answer
   Write under each question. "I don't know" and partial answers help; flag what you're unsure of.

   ## <theme>
   ### <one question, most important first>
   _Why it matters: <only where it could be misread>_
   >

   ## Anything else we should know?
   >
   ```
