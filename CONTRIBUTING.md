# Contributing

First — thanks for looking. A note on what this repo is, because it shapes how to engage with it.

This isn't a product or a framework looking for contributors. It's my personal working environment for engineering with AI, externalised into config and shared in case it's useful to someone working a similar way. The defaults lean a certain way because they're how *I* work.

## The intended path: fork it and bend it to yours

The honest answer to "how do I contribute" is usually: **don't contribute upstream — fork it.**

The whole design assumes the defaults are *yours* to override:

- The rule overlay (`/rules`) lets you disable, replace, or patch any architectural rule without touching mine.
- Per-machine config (`~/.claude/hook-config.json`, `settings.local.json`) lets you turn organs on and off.
- Everything is plain markdown and small scripts — readable, and meant to be edited.

So if something doesn't fit how you work, change it in your fork. That's not a fallback; that's the point. You'll end up with a setup that fits you better than any upstream merge would.

## Issues and discussion — welcome, best-effort

If you hit a genuine bug (a hook misfires, bootstrap breaks on your platform, a script throws), an issue is welcome and useful — especially with steps to reproduce and your OS / shell. Same for a question about how something is meant to work.

Just set expectations honestly: I maintain this in my own time. Issues may sit for a while, and I won't necessarily act on every one. No promises, no SLA.

## Pull requests — no guarantees

I'm not actively soliciting PRs, and I won't promise to review or merge them. The published repo is generated from a separate private working repo, so even an accepted change has to be reproduced there by hand. That makes PRs higher-friction than they look.

If you've found a clear, small fix (a typo, a broken link, an obviously-wrong command), open a PR and I'll take a look when I can. For anything larger, open an issue first so we can talk about whether it belongs upstream or in your fork — usually it's the fork.

## Security

For anything security-sensitive, don't open a public issue — see [SECURITY.md](SECURITY.md).

## Conduct

Be decent. This is a small personal repo; I'd like keeping it pleasant to not require a formal policy.
