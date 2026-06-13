---
applyTo: "**"
---

# android rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/android/` — do not hand-edit.

## Android Lifecycle Discipline

Never hold a static or long-lived reference to an Activity, Fragment, View, or their `Context`. Use `applicationContext` for needs that outlive a single screen. A static Activity ref keeps the whole view hierarchy alive past `onDestroy`, leaking memory. (Android docs — Activity lifecycle)

Do not store UI state in the Activity/Fragment. Hold it in a `ViewModel` (survives rotation/config changes) plus `SavedStateHandle` / saved instance state for process death. The system destroys and recreates the Activity on configuration change; instance fields are lost. (Android docs — Handle configuration changes)

Register and unregister listeners, receivers, sensors, and observers symmetrically: acquire in `onStart`/`onResume`, release in the paired `onStop`/`onPause`. Asymmetric registration leaks callbacks and double-fires after recreation. (Android docs — Activity lifecycle)

**Why:** The framework owns Activity/Fragment lifetime and recreates them on configuration changes, so any UI state or Context captured in instance/static fields either leaks or is silently lost. Hoisting state into a lifecycle-aware `ViewModel` and binding resource acquisition to symmetric lifecycle callbacks keeps ownership explicit and prevents both leaks and stale callbacks. Source: Android developer documentation.

## Android Resources and Manifest Discipline

Never hardcode UI strings, dimensions, colors, or sizes in code or layouts. Put them in `res/values/` (`strings.xml`, `dimens.xml`, `colors.xml`) and provide configuration-qualified variants (`values-fr/`, `values-night/`, `values-sw600dp/`). Externalized resources enable localization, theming, and device adaptation. (Android docs — App resources)

Declare every permission in the manifest, and for dangerous permissions request them at runtime and handle denial gracefully. Assuming a permission is granted without checking crashes on modern Android. Request only what the feature needs. (Android docs — Permissions on Android)

Use explicit intents (named component/class) to start your own app's components; reserve implicit intents for cross-app actions. Implicit intents for internal navigation are ambiguous and can be intercepted by other apps. (Android docs — Intents and intent filters)

**Why:** Externalizing strings, dimensions, and colors into qualified resources lets the system pick the right variant for locale, theme, and screen without code changes, while hardcoded values block localization and adaptation. Declaring permissions in the manifest and requesting dangerous ones at runtime is required by the platform permission model, and explicit intents keep internal navigation unambiguous and safe from interception. Source: Android developer documentation.

## Android Threading Discipline

Never run network, disk, database, or other blocking I/O on the main/UI thread. The main thread renders the UI; blocking it stalls frames and triggers ANR ("Application Not Responding"). Move all blocking work off-main. (Android docs — Keep your app responsive)

Use Kotlin coroutines with structured concurrency (`Dispatchers.IO`/`Default` for work, suspending APIs) — or `Executors` in Java — instead of raw threads. Structured scopes propagate cancellation and surface failures rather than leaking orphan threads. (Android docs — Kotlin coroutines on Android)

Touch the UI only from the main thread. Switch back via `withContext(Dispatchers.Main)`, `lifecycleScope`, or `runOnUiThread` before mutating views. View access off-main throws or corrupts state. (Android docs — Keep your app responsive)

Launch background work in a lifecycle-bound scope (`viewModelScope`, `lifecycleScope`, or `repeatOnLifecycle`) so it cancels automatically when the owner is destroyed. Unscoped work outlives its screen and writes into a dead UI. (Android docs — Kotlin coroutines on Android)

**Why:** The main thread is the single thread that draws the UI and processes input, so any blocking call there freezes the app and risks an ANR. Structured concurrency moves work off-main while keeping cancellation and error propagation tied to a lifecycle owner, ensuring background work stops when its screen dies and UI updates always land back on the main thread. Source: Android developer documentation.
