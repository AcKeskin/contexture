# capture: reference

Read when the step you are on points here, or when something fails.

## Failure modes

- **Cannot classify `kind` confidently** — propose best guess, flag the uncertainty in the proposal message, let the user override. Do not silently commit a fuzzy classification.
- **Ambiguous target folder** (e.g. "is this a universal rule or a C++-specific rule?") — ask one clarifying question. Do not write to both locations.
- **Project memory root missing (first creation)** — if no `~/.claude/projects/*/memory/` folder matches the project root, derive the slug from the project directory path with the platform's path-to-slug encoding (the same encoding visible in existing sibling project folders), create the tree, and note the creation in the commit summary. Seed `MEMORY.md` with a header line before writing the first file.
- **`MEMORY.md` write race** (rare, but possible if user has another session open) — if the file has changed since read, re-read, reconcile, re-append. Never blind-overwrite.
- **Content plainly duplicates an existing memory** — surface the duplicate in the proposal, ask whether to replace / merge / reject. Never silently overwrite.

## What capture does NOT do

- **Does not auto-fire.** Mode B parked.
- **Does not decide when to capture.** Triggers live in calling context (user says "remember", review surfaces a correction). This skill owns the *how*, not the *when*.
- **Does not modify existing memories for reasons beyond the specific capture.** Lazy migration of old files happens only when the user edits them for another reason (per `memory-capture.md`).
- **Does not read stored memory.** That's discovery's job (`skills/discover`).
- **Does not silent-redact.** Step 7a always halts and surfaces matches; never substitutes without user confirmation — the threat model is "I forgot the stack trace contained a key," not an adversary, so the user is in the loop on every match.
- **Does not retroactively scan existing memories.** Step 7a runs at capture time only. Retrospective scanning of already-written memories lives in `/memory-audit` dimension 9.

See [`docs/capture-organ.md`](../../docs/capture-organ.md) for the organ's scope map and relationship to the rest of the context family.
