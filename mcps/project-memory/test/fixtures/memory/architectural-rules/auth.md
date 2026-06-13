---
name: auth-session-refresh
description: Verify session refresh on every authenticated request
type: user
kind: architectural-rule
scope: [auth, security]
relevance: always, when-touching-auth
---
Any code path that consumes an authentication token must verify the session
refresh status before acting on the token. Tokens may be valid-looking but
expired in the upstream service.
