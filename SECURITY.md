# Security

This is a personal project shared in case it's useful — but it ships things that touch your machine: safety hooks, git automation, and MCP servers that read and write files. So if you find a security issue, I'd genuinely like to know.

## Reporting

Please report vulnerabilities **privately**, not in a public issue.

Use GitHub's private advisory flow: go to the **Security** tab → **Report a vulnerability**. That opens a private channel only you and I can see.

Useful things to include, if you have them:

- What the issue is and roughly how bad it could be.
- Steps to reproduce, or a small proof of concept.
- The affected area (a hook, a bootstrap step, one of the MCP servers).

## What to expect

I maintain this in my own time, on a best-effort basis — there's no SLA and no bug bounty. I'll read the report, confirm I've seen it, and fix what's real as I'm able. If a fix changes behaviour that affects anyone who's cloned this, I'll note it in the release.

## Scope

In scope: the harness itself — bootstrap, hooks, skills, and the bundled MCP servers under `mcps/`.

Out of scope: vulnerabilities in third-party dependencies (report those upstream), and anything that requires an attacker to already control your machine or your `~/.claude/` directory.
