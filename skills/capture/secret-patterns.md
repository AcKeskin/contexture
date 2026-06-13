# Secret patterns — capture pre-write redaction

Pattern set used by [`capture/SKILL.md`](SKILL.md) step 7a (pre-write secret scan) and by [`memory-audit/SKILL.md`](../memory-audit/SKILL.md) dimension 9 (retrospective spot-check on existing memory bodies).

**Seed:** lifted from [Lemma](https://github.com/xenitV1/lemma) `src/memory/privacy.ts` at examination time (2026-04-27, MIT licensed). Original 17 patterns kept verbatim. Four patterns added for shapes the proposal explicitly named that Lemma lacked (Anthropic, fine-grained GitHub PAT, Stripe live keys, JWT). Total **21 patterns**.

This file is the canonical source. Editing it propagates to both consumers — capture redaction + audit dimension 9 — automatically (both read this file at run time).

## Pattern set

```json
[
 { "name": "openai-project-key", "type": "OpenAI project key", "regex": "sk-proj-[a-zA-Z0-9]{20,}", "flags": "g" },
 { "name": "openai-api-key", "type": "OpenAI API key", "regex": "sk-[a-zA-Z0-9]{20,}", "flags": "g" },
 { "name": "anthropic-api-key", "type": "Anthropic API key", "regex": "sk-ant-[a-zA-Z0-9-_]{20,}", "flags": "g" },
 { "name": "github-token", "type": "GitHub token", "regex": "ghp_[a-zA-Z0-9]{36}", "flags": "g" },
 { "name": "github-oauth-token", "type": "GitHub OAuth token", "regex": "gho_[a-zA-Z0-9]{36}", "flags": "g" },
 { "name": "github-app-token", "type": "GitHub app token", "regex": "ghs_[a-zA-Z0-9]{36}", "flags": "g" },
 { "name": "github-user-token", "type": "GitHub user-to-server token", "regex": "ghu_[a-zA-Z0-9]{36}", "flags": "g" },
 { "name": "github-fine-grained-pat", "type": "GitHub fine-grained PAT", "regex": "github_pat_[A-Z0-9_]{82}", "flags": "g" },
 { "name": "slack-token", "type": "Slack token", "regex": "xox[bpas]-[a-zA-Z0-9-]+", "flags": "g" },
 { "name": "stripe-live-secret", "type": "Stripe live secret key", "regex": "sk_live_[a-zA-Z0-9]{20,}", "flags": "g" },
 { "name": "stripe-live-publishable", "type": "Stripe live publishable key", "regex": "pk_live_[a-zA-Z0-9]{20,}", "flags": "g" },
 { "name": "private-key", "type": "Private key", "regex": "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----", "flags": "g" },
 { "name": "mongodb-conn", "type": "MongoDB connection string", "regex": "mongodb(?:\\+srv)?://[^\\s\"']+", "flags": "g" },
 { "name": "postgres-conn", "type": "PostgreSQL connection string","regex": "postgres(?:ql)?://[^\\s\"']+", "flags": "g" },
 { "name": "mysql-conn", "type": "MySQL connection string", "regex": "mysql://[^\\s\"']+", "flags": "g" },
 { "name": "redis-conn", "type": "Redis connection string", "regex": "redis://[^\\s\"']+", "flags": "g" },
 { "name": "aws-access-key", "type": "AWS access key", "regex": "AKIA[0-9A-Z]{16}", "flags": "g" },
 { "name": "google-api-key", "type": "Google API key", "regex": "AIza[0-9A-Za-z_-]{35}", "flags": "g" },
 { "name": "webhook-secret", "type": "Webhook secret", "regex": "whsec_[a-zA-Z0-9]+", "flags": "g" },
 { "name": "jwt", "type": "JWT token", "regex": "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}", "flags": "g" },
 { "name": "password-assignment", "type": "Password in assignment", "regex": "password\\s*[=:]\\s*[\"'][^\"']{4,}[\"']", "flags": "gi" },
 { "name": "bearer-token", "type": "Bearer token", "regex": "Bearer\\s+[a-zA-Z0-9\\-._~+/]+=*", "flags": "g" }
]
```

## How patterns are applied

Each pattern's `regex` + `flags` are compiled into a JavaScript-style RegExp at run time. The matcher walks the candidate text and surfaces every match with `name`, `type`, and the matched substring.

Redaction format on match: `<REDACTED:<name>>`. Examples:
- `ghp_abcd1234ExamPLE5678efgh9012ijkl3456mno` → `<REDACTED:github-token>`
- `AKIA1234EXAMPLE5678PT` → `<REDACTED:aws-access-key>`
- `mongodb+srv://user:pass@cluster.mongodb.net/db` → `<REDACTED:mongodb-conn>` <!-- share-readiness: WONT_FIX — redaction-pattern example with placeholder creds, not a real address. -->

The redaction preserves *that there was a secret* and *what kind*, which is enough for the surrounding lesson to make sense. It strips the secret value, which is the only thing being removed.

## Changelog

Every pattern change records the case that motivated it. Tighten patterns rather than removing them when false positives surface. Add patterns when real false-negatives slip through.

| Date | Change | Reason | |------------|-------------------------------------------------|-------------------------------------------------------------------------------------------------------| | 2026-04-27 | Initial set: 17 verbatim from Lemma + 4 added | Lemma's `src/memory/privacy.ts`, MIT. Added: `anthropic-api-key`, `github-fine-grained-pat`, `stripe-live-*` (×2), `jwt`. | ## False-positive log

When a user picks `(i)gnore` for a match in capture's step 7a, log the case here so the pattern can be tightened later. Each entry: pattern name, the matched text (sanitized — replace the actual secret-like token with `<example>`), and one line on why it was a false positive. Periodic review of this log informs pattern refinement.

| Date | Pattern | Sanitized match | Why false positive | |------|---------|-----------------|--------------------| | (none yet) | | | | ## Vetting notes (initial set)

These were the decisions made when lifting the seed set:

- `password-assignment` could fire on documentation snippets like `password = "your-password-here"`. Accepted: better to flag and let the user dismiss than to miss a real password. The `(i)gnore` path is fast.
- `bearer-token` could fire on abstract examples like `Bearer abc123`. Same trade — flag, let the user dismiss.
- `openai-api-key` (`sk-[a-zA-Z0-9]{20,}`) could collide with non-OpenAI things (Stripe non-live keys, file IDs starting `sk-`). Acceptable false-positive risk given the threat model.
- The `private-key` pattern matches the BEGIN line only; the body of a private key block won't trigger further matches. By design — surfacing the BEGIN line is enough to halt the capture and prompt the user to abort or edit out the whole block.
- All patterns use literal anchors (`AKIA`, `ghp_`, `xox`, etc.) where possible. High specificity keeps false-positive rates low on technical writing about systems.
