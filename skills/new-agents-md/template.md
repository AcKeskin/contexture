# new-agents-md: AGENTS.md template

   ```
   - Projection depth (resolved per spec): **always-tier + detected-language + detected-domain**.
   - **Language detection** = file-extension scan of the repo, mapped to the language-tier folders
     that exist under `architectural-rules/` (e.g. `.cs` → `csharp/`, `.rs` → `rust/`, `.ts`/`.tsx`
     → `typescript/`, `.py` → `python/`, `.cpp`/`.h` → `cpp/`, `.sh` → `bash/`, `.sql` → `sql/`).
     This mapping is **non-exhaustive** — read the current set of language folders from
     `architectural-rules/` rather than treating this list as complete. Inline the language tiers
     for languages actually present.
   - **Domain detection** is a weaker signal than file extensions. Do **not** guess silently:
     gather candidate domains (from top-level directory names, module keywords) and **confirm them
     with the user in Pass 2** before inlining. Default to inlining none until confirmed.
3. **Landmines.** Read the `warning/` and `feedback/` memory entries. These become the **"Never X"
   critical-rules block at the top of the file** (lead-with-prohibitions). Each projects as the
   rule + its one-line "why" — the why is what lets a stateless reader generalise.
4. **Canonical commands.** If `architectural-rules/universal/canonical-commands.md` exists,
   project its verb→command pins into the Dev-commands section as a *seed* the
   Pass-2 command interview confirms. If absent, the command section starts empty and Pass 2 asks
   cold.
5. **Domain glossary.** If a project-tier glossary (`<repo>/.claude/rules/glossary.md`)
   exists, project its ubiquitous-language terms into the **`## Domain Language`** section —
   term → one-line definition, so a non-Claude agent shares the project's vocabulary. Drop the
   per-term code-symbol map (the generic reader wants the meaning, not the Claude-internal link).
   Absent → omit the section entirely.

Compose the draft in the required order (see Compose). The draft is a starting point, not a
finished file — Pass 2 fills the gaps.

### Pass 2 — Interview (fill only what the corpus can't know)

Soft-rejection forcing functions, matching the `new-agent` rhythm (re-show the example, re-ask
once; after two soft rejections accept whatever the user gives — forcing function, not gatekeeper).
Four gap categories:

1. **Exact dev commands.** The corpus names verbs; the repo names commands.

   ```
