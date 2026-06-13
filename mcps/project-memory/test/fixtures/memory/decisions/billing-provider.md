---
name: billing-provider-choice
description: Picked Stripe over Adyen for billing integration
type: user
kind: decision
scope: [billing, integration]
relevance: when-touching-billing
---
We chose Stripe for v1 billing because the SDK's idempotency-key story is
better documented and the test-mode coverage matches our test fixtures.
Adyen revisit if we need true global card-network coverage.
