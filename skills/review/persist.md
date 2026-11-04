# review: writing the run files

Read at step 7b, before saving.

**How to write.** Claude Code blocks Write/Edit under `.claude/` in headless runs, so never write there directly. Write the file to `.review-run.tmp.json` (or `.md`) at the project root, then move it in with `node <skill dir>/save-run.mjs <slug> json|md|latest <tmp>` — json first, then md; `latest` for `--since`. Run it with the Bash tool as one plain command: the skill dir written out as an absolute path with forward slashes (e.g. `<home>/.claude/skills/review`, with `<home>` written out), no variables, no `&&`, no `cd`. The allow rule only matches that shape. It numbers versions, writes atomically and deletes the temp file. Bootstrap allows the temp write and that command for headless runs. Always save both, json then md; never skip either on the guess that it will be denied.

After the json and md are saved, stamp the receipt with every file in scope plus the rule files loaded in §2a (rule files by absolute path): `node <skill dir>/receipts.mjs stamp .claude/reviews/<scope-slug> --list <list>`. Write the list to `.review-run.tmp.txt` at the project root first; the script deletes it. Not for `--since` or PR runs.
