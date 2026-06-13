---
name: Android Lifecycle Discipline
description: Never leak a Context, survive config changes via ViewModel/saved state, register and unregister symmetrically
type: user
kind: architectural-rule
scope: [android, lifecycle]
relevance: when-platform-android
origin: shipped
---

<!-- id: no-leaked-context --> Never hold a static or long-lived reference to an Activity, Fragment, View, or their `Context`. Use `applicationContext` for needs that outlive a single screen. A static Activity ref keeps the whole view hierarchy alive past `onDestroy`, leaking memory. (Android docs — Activity lifecycle)

<!-- id: survive-config-changes --> Do not store UI state in the Activity/Fragment. Hold it in a `ViewModel` (survives rotation/config changes) plus `SavedStateHandle` / saved instance state for process death. The system destroys and recreates the Activity on configuration change; instance fields are lost. (Android docs — Handle configuration changes)

<!-- id: symmetric-register --> Register and unregister listeners, receivers, sensors, and observers symmetrically: acquire in `onStart`/`onResume`, release in the paired `onStop`/`onPause`. Asymmetric registration leaks callbacks and double-fires after recreation. (Android docs — Activity lifecycle)

**Why:** The framework owns Activity/Fragment lifetime and recreates them on configuration changes, so any UI state or Context captured in instance/static fields either leaks or is silently lost. Hoisting state into a lifecycle-aware `ViewModel` and binding resource acquisition to symmetric lifecycle callbacks keeps ownership explicit and prevents both leaks and stale callbacks. Source: Android developer documentation.
