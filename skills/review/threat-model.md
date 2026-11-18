# review: saved threat model

Read when the `security` angle runs. A threat model is a map of what an attacker wants and where they can get in. Building it costs the most reading in a security pass, so it is saved and reused while the code it describes has not changed. From `openai/codex-security` threat-model (read 2026-11-12).

It lives at `.claude/reviews/threat-model/threat-model.md`, with a receipt of the files it cites in the same folder.

## 1. Check

Run `node <skill dir>/receipts.mjs check .claude/reviews/threat-model` (same command shape as in [persist.md](persist.md)).

| Result | Do | Header line |
| --- | --- | --- |
| `RECEIPT: NONE` | Build one (step 2) | *Threat model: built fresh.* |
| every line `UNCHANGED`, and the scope adds no entry point | Hand it to the security angle as is | *Threat model: reused, version <Version>.* |
| any `CHANGED` or `GONE`, or the scope adds an entry point | Hand it over with the changed files; the angle returns it updated | *Threat model: updated from <Version>.* |

An entry point is anywhere untrusted input arrives: a route or handler, a CLI argument, a webhook, an upload, an MCP tool, a message queue, a file or env var an attacker can set.

## 2. Build or update

The security angle writes the model before it looks for findings, then reviews against it. Keep it under about 60 lines:

```markdown
# Threat model

## Assets
What an attacker wants: data, credentials, money, compute.

## Entry points
- <what arrives> at <file:line>, from <who>

## Trust boundaries
- <where data crosses from less to more trusted>, <file:line>

## Sinks
- <query, shell, path, template, deserializer, outbound call> at <file:line>

## Attackers and assumptions
Who attacks, what they control, and what we assume (for example: admins are trusted, the network is not).

---
Repository: <repo name>
Version: <`git log -1 --format=%h`, or "no git">
Built: <YYYY-MM-DD>
Files: <every file cited above, comma separated>
```

The model is context, not evidence. A finding still needs its own trace. The model never rules a finding out: if the code shows an entry point or sink the model lacks, the model is wrong, so add it.

## 3. Save

After the run files (7b), on local targets only. Write the model to `.review-run.tmp.md` and run `node <skill dir>/save-run.mjs threat-model threat .review-run.tmp.md`. Then write its `Files` list to `.review-run.tmp.txt`, one per line, and run `node <skill dir>/receipts.mjs stamp .claude/reviews/threat-model --list .review-run.tmp.txt`.

On a PR run, read a saved model for context but do not save: the PR's files are not on disk.
