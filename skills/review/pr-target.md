# review: PR target

Read when the target is `--pr`.

1. `gh pr view <N> --json number,title,body,state,author,baseRefName,headRefName,url,additions,deletions,changedFiles,labels,commits`. If it fails (GraphQL is blocked in some cloud sessions), use REST: `gh api repos/{owner}/{repo}/pulls/<N>` (same fields as `base.ref`, `head.ref`, `user.login`, `merged_at`), or the GitHub MCP `pull_request_read`. No N → `gh pr view --json number`, else `gh api "repos/{owner}/{repo}/pulls?head={owner}:<branch>"`. Merged or closed → *"PR #N is `<state>`. Review anyway? (y/N)"*; draft → same warning, not blocking. Show a header: number, title, author, base ← head, files, +/−, labels, URL.
2. `gh pr diff <N>`, parsed per file (path, added/removed lines with numbers, hunks). Skip binary files and count them in the header.
3. More than 30 changed files → *"PR touches N files — narrow with a path or proceed? (y / path / abort)"*.
4. Apply the path filter; report *"Reviewing N of M changed files (filtered to: …)"*.

Work only from `gh` output and `git show <ref>:<path>`; never check out the PR branch, never run its tests.
