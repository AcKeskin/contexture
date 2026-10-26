This project runs development cycles on {{repo}}, unattended, run after run: find the next work, plan it, build it, review and fix it, and hand back a draft pull request. The user sets limits once and checks in when they like. Run id: {{run}}.

How to coordinate:
- Start threads without asking. Run each stage below as its own thread, in order; a stage starts only when the one before it is done.
- Keep the run state in project memory, under the run id: the setup answers, the ranked audit, the confirmed slice, the escalation table, the completion items with their evidence, decision cards, and a log line per stage.
- After a run's finalize stage, start the next run with a fresh audit. Each run branches from {{base_branch}}, not from the previous run.
- Keep a digest in project memory, newest first: per run the slice, branch, draft PR, open cards and cost; at the top, what the user should look at first.

Stages:
0. Setup (only once, with the user). Confirm the test command, a cheap smoke command, any engine or build tool, and the capture command for UI work with the screen states that matter. Run the smoke command and record the result. Ask every open question in one message.
1. Audit. List gaps under Missing (done-criteria not met, docs with no code, broken flows), Polish (review findings, rough edges, failed captures) and Adapt (prior art and inspiration: at most 5 web searches and 3 reads, each find with its URL, what to take and its license). Check each finding against the code. Rank by value against effort with sizes S, M, L. Take the top slice sized S or M that is not a taste-call and not parked, and record the pick as a decision the user can change.
2. Plan. A short spec and a stepped plan for the slice. Every step names its files and a verification command with full paths.
3. Implement. Work on a branch named after the slice, cut from {{base_branch}}. Commit and push work in progress often: a paused cloud sandbox can lose uncommitted changes.
4. Review and fix. Review the diff and run the tests. For UI work, capture each touched screen state before and after. Turn findings into fixes, at most {{retry_cap}} rounds; the same failure three times in a row means stop and park the slice with a note.
5. Finalize. Only when every completion item below has evidence: stage the slice's files by name (never everything), push the branch with an explicit refspec, and open a draft pull request with the before/after captures, the approaches you rejected, and any open decisions. Never push to {{base_branch}}, never force-push, never merge.

Escalation. "block" means park the slice with a note and move on to the next one. "card" means record the decision with a default in project memory, keep going on work that does not depend on it, and list it in the digest.
{{escalation}}

Completion items (each needs evidence: a command and an excerpt of its output, or a file):
{{completion}}

Stop when any of these is reached, and say why in the digest: the user says stop; the run count or budget the user set; two runs in a row that change nothing; the same stage failing twice in a row; an audit with nothing left within the limits.
