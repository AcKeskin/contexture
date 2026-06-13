---
name: Android Threading Discipline
description: Never block the main thread, use structured concurrency off-main, update UI only on main, scope work to lifecycle
type: user
kind: architectural-rule
scope: [android, concurrency]
relevance: when-platform-android
origin: shipped
---

<!-- id: never-block-main --> Never run network, disk, database, or other blocking I/O on the main/UI thread. The main thread renders the UI; blocking it stalls frames and triggers ANR ("Application Not Responding"). Move all blocking work off-main. (Android docs — Keep your app responsive)

<!-- id: structured-concurrency --> Use Kotlin coroutines with structured concurrency (`Dispatchers.IO`/`Default` for work, suspending APIs) — or `Executors` in Java — instead of raw threads. Structured scopes propagate cancellation and surface failures rather than leaking orphan threads. (Android docs — Kotlin coroutines on Android)

<!-- id: ui-on-main --> Touch the UI only from the main thread. Switch back via `withContext(Dispatchers.Main)`, `lifecycleScope`, or `runOnUiThread` before mutating views. View access off-main throws or corrupts state. (Android docs — Keep your app responsive)

<!-- id: scope-to-lifecycle --> Launch background work in a lifecycle-bound scope (`viewModelScope`, `lifecycleScope`, or `repeatOnLifecycle`) so it cancels automatically when the owner is destroyed. Unscoped work outlives its screen and writes into a dead UI. (Android docs — Kotlin coroutines on Android)

**Why:** The main thread is the single thread that draws the UI and processes input, so any blocking call there freezes the app and risks an ANR. Structured concurrency moves work off-main while keeping cancellation and error propagation tied to a lifecycle owner, ensuring background work stops when its screen dies and UI updates always land back on the main thread. Source: Android developer documentation.
