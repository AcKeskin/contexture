---
name: C# Unity interop — async/disposal exceptions under the Unity runtime
description: Where general C# async, disposal, and lifetime rules bend under Unity's main-thread-only API, coroutine model, and MonoBehaviour lifecycle.
type: user
kind: architectural-rule
scope: [csharp, unity-interop]
relevance: when-language-csharp
origin: shipped
---

<!-- id: no-task-on-monobehaviour --> Do not expose `Task`-returning async methods from `MonoBehaviour` subclasses. Unity's coroutine scheduler and the physics/rendering pipeline run on the main thread with no synchronization context; an awaited `Task` resumed on a thread pool thread will crash on any `UnityEngine` API call. Use coroutines (`IEnumerator` + `StartCoroutine`) for frame-linked async work; reserve `Task`/`UniTask` for engine-free code called from the main thread.
<!-- id: coroutine-instead-of-await --> When frame-cadence matters (wait one frame, wait until end of frame, `WaitForSeconds`), coroutines are the correct primitive — not `Task.Delay`. `yield return new WaitForEndOfFrame()` and `yield return new WaitForSeconds(t)` integrate with Unity's time system; `Task.Delay` does not.
<!-- id: unity-lifecycle-subscribe --> Subscribe to events in `OnEnable`; unsubscribe the matching handler in `OnDisable`. Never subscribe in `Start` or `Awake` and leave no matching unsubscribe — a disabled (not destroyed) `MonoBehaviour` still receives events subscribed outside the Enable/Disable bracket.
<!-- id: disposal-not-idisposable-for-mb --> `MonoBehaviour` objects are not `IDisposable` — Unity controls their lifetime via `OnDestroy`. Release native resources (`ComputeBuffer`, `RenderTexture`, native plugins) in `OnDestroy`, not in `Dispose`. Engine-free helper classes that own resources should still implement `IDisposable` per the general rule; the MonoBehaviour that owns them calls `Dispose` in `OnDestroy`.
<!-- id: unscaled-time-for-ui --> Use `Time.unscaledDeltaTime` for timers that must tick while game time is paused or scaled (UI countdowns, death timers, grounding-delay after landing). `Time.deltaTime` returns 0 when `Time.timeScale = 0`.
<!-- id: no-async-void-coroutine-mix --> Do not mix `async void` with coroutines in the same class — an unhandled exception in `async void` escapes all try/catch and tears down the app silently. Unity event handlers that need async work start a coroutine or fire-and-forget to a static `Task` entry point that logs exceptions. The general `no async void except event handlers` rule still applies; in Unity, prefer coroutines for Unity-lifecycle work and save `async void` only for UnityEvent wired in the Inspector.
<!-- id: main-thread-guard --> All `UnityEngine` namespace calls must occur on the main thread. Do not call `Destroy`, `Instantiate`, `GetComponent`, or any `Transform`/`Rigidbody` setter from a background thread or a `Task` continuation that did not explicitly marshal back with `UnityMainThreadDispatcher` or equivalent. Engine-free domain classes are safe to call from any thread.

**Why:** Unity's runtime is not thread-safe for scene-graph operations, and its coroutine scheduler is frame-coupled, not awaitable. Mixing the two models produces race conditions, NullReferenceExceptions on background threads, and silent data corruption with no stack trace. The general `csharp/async.md` rules hold for engine-free code; this file documents the Unity-specific exceptions and cross-references the Unity subsystem rules. Source: Unity scripting thread-safety documentation and Microsoft .NET async guidance.
