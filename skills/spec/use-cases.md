# Use cases

What a user (or calling system) does with the thing and what they get. The planning chain carries them so every later step can say which goal it serves. Read by `/envision`, `/spec`, `/draft-plan`, `/blueprint`, `/human-view` and the cold reader.

## Format

Spec and plan (full form):

```markdown
### UC1: <goal as a verb phrase>
- **Actor:** <a person's role, or a calling system>
- **Goal:** <what they want, and why>
- **Main flow:** 1. <actor does> 2. <system does> … (3–7 steps, no UI or code detail)
- **Edge cases:** <what happens when …>; <…>
- **Success:** <observable end state>
```

Vision (short form, one line each):

```markdown
- **UC1** <actor> <goal>. Modules: <module-slug>, <module-slug>
```

## Rules

- No fixed count: one per distinct actor goal. If they serve unrelated goals, suggest splitting the scope.
- IDs are per artefact: a spec numbers its own from UC1, a plan copies its spec's IDs. IDs are stable. Never renumber; a dropped use case is deleted with a `Changes from` line and its ID is not reused.
- A use case is something an actor wants. "Refactor the store" is not one; it goes in Technical approach.
- Each use case's Success is covered by at least one done criterion. Start that criterion with the ID: `"UC2: running X shows Y"`. A criterion that covers two lists both: `"UC1, UC3: …"`. Criteria with no use case (build, perf) have no prefix.
- No actor at all (a pure refactor with no behaviour change): propose `none — internal change` and use it only when the user confirms; then skip the use-case checks downstream. Internal tooling has actors (developers, CI): write its use cases.

## Interview

Nearly always run it: a drafted use case is a guess until the user has walked through it. Steps:

1. **Draft first.** From what you already have (the ask, an idea note, the vision's short-form use cases for this module, the sketch, the code), draft every use case you can.
2. **Walk each one with the user.** Per use case: who does it, how they get from start to Success, and what happens when it goes wrong. Then ask who else uses the thing, to find missing use cases. Batch questions (up to 4 per round).
3. **Dig deeper where usage is unclear.** No named actor, a new surface or a thing nobody has used yet, a goal with more than one reading, a flow with a jump in it, no failure path, no observable Success. Keep asking there until you could walk the flow yourself.
4. **Show and confirm.** Present the use cases in compact form (`UC1 <actor>: <goal> → <success>`; vision: the short form) and ask: *accept / edit / add / drop*. Loop until accept.

Vision short form: walk actor and goal only, and dig only where usage is unclear.

Skip the walk only when the user says so, or the use cases come from a spec the user already accepted (then step 4 alone, plus step 3 for any that still read unclear). A field still guessed at the end goes in with `(assumed)` after it.
