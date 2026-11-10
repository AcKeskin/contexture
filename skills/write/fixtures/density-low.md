<!-- expect: LOW ai-likeness · register: tech-doc · in-scope · contains decoys (1 em-dash, 1 "testament", native headers+lists) that must NOT raise the score -->

# rate-limiter

A token-bucket limiter for the gateway — it refills at a fixed rate and rejects when the bucket is empty.

It's a small testament to how far a 60-line file can get you: no Redis, no background sweep, just a timestamp and a counter per key.

## Usage

1. Construct with `capacity` and `refillPerSec`.
2. Call `tryTake(key)` before handling a request.
3. On `false`, return 429.

The eviction is lazy — keys expire on next access, so memory tracks active callers, not total seen. That trades a little staleness for not running a timer. Fine for our traffic; revisit if key cardinality explodes.
