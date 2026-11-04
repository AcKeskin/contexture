# capture: secret scan

Read at step 7a, before any memory write. Never skip it.

### 7a. Pre-write secret scan

After the user accepts in step 7 but **before** the disk write in step 8, run the secret-pattern set from [`secret-patterns.md`](secret-patterns.md) over the proposed body and over every frontmatter value (description, name, scope tags, relations notes, etc.). Frontmatter keys themselves are not scanned — they're a fixed schema.

For each pattern in the set, walk the text and collect matches as `(pattern_name, type_label, matched_text, line_offset)`.

**Zero matches** → continue to step 8.

**Matches found** → halt the write. For each match, surface to the user:

```
Capture paused — possible secret detected.

Pattern: <type_label> (matches /<regex>/)
Line <N>: "<matched_text>"

(r)edact and continue — replace with <REDACTED:<pattern_name>>
(e)dit body manually before retrying
(a)bort       — don't write this memory
(i)gnore      — pattern misfire, write this match as-is (logs to false-positive table)
```

Process matches one at a time (not all at once). The user picks per match:

- **r → redact and continue.** Substitute the matched text with `<REDACTED:<pattern_name>>` in the body / frontmatter value. Re-run the entire pattern set against the (now-modified) text — there may be more matches the first didn't expose, or new ones overlapping. Keep redacting until zero matches remain, then continue to step 8.
- **e → edit body.** Drop back into step 7 with the current draft for the user to edit. Loop. (The user's edit may resolve all matches manually, in which case the next pass through 7a finds zero.)
- **a → abort.** Discard the capture cleanly. No file, no MEMORY.md change, no residue. Same as step 8 reject.
- **i → ignore (false positive).** Write the match as-is. Append a row to the false-positive table in `secret-patterns.md` capturing the pattern name, a *sanitized* version of the match (replace the secret-like token with `<example>`), and the user's one-line reason. Re-run the rest of the pattern set on the body to catch any unrelated matches; ignore is per-match, not per-capture.

Per-match ignore avoids edit-around friction; the false-positive log feeds pattern refinement.

The body that lands on disk is the post-redaction version; the original (with secrets) is never written anywhere — not to disk, not to the false-positive log, not to anywhere.
