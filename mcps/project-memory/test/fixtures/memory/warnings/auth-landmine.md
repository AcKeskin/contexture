---
name: auth-token-race-condition
description: Token race condition on concurrent request paths
type: project
kind: warning
scope: [auth, concurrency]
relevance: always, when-touching-auth, during-debug
---
Two concurrent requests that both attempt to refresh the auth token will
race; the second refresh's response invalidates the first. Symptom: random
401s on otherwise valid sessions.
