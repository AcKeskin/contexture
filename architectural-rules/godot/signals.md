---
name: Signals
description: Decouple via signals not _process polling; disciplined connect/disconnect; typed custom signals
type: user
kind: architectural-rule
scope: [godot, signals]
relevance: when-engine-godot
origin: shipped
---

<!-- id: signals-over-polling --> Emit a signal when something changes; do not poll for the change in `_process`. Per-frame polling burns CPU and couples the watcher to the watched node's internals. Signals invert the dependency. (Godot docs — Signals)
<!-- id: typed-custom-signals --> Declare intent with the `signal` keyword and typed parameters: `signal health_changed(amount: int)`. Named, typed signals document the event contract; generic catch-all signals do not. (Godot docs — Signals)
<!-- id: no-double-connect --> Never connect the same callable to the same signal twice — it fires twice. Guard with `is_connected()` before connecting in code paths that can run more than once. (Godot docs — Signals)
<!-- id: disconnect-when-outliving --> Disconnect when the connection outlives the emitter–receiver relationship (e.g. a receiver that persists while emitters churn). Connections to a freed node clean up automatically, but a live receiver holding stale connections leaks and double-fires. (Godot docs — Signals)

**Why:** Signals are Godot's first-class decoupling primitive — an emitter never needs to know who listens. Replacing `_process` polling with signals removes per-frame cost and a hard dependency; connect/disconnect discipline prevents the double-fire and stale-connection bugs that signals otherwise invite. Source: Godot docs — Signals.
