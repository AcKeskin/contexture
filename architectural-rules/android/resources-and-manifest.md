---
name: Android Resources and Manifest Discipline
description: Externalize UI strings/dimens/colors with qualifiers, declare and request permissions correctly, use explicit intents internally
type: user
kind: architectural-rule
scope: [android, resources]
relevance: when-platform-android
origin: shipped
---

<!-- id: externalize-resources --> Never hardcode UI strings, dimensions, colors, or sizes in code or layouts. Put them in `res/values/` (`strings.xml`, `dimens.xml`, `colors.xml`) and provide configuration-qualified variants (`values-fr/`, `values-night/`, `values-sw600dp/`). Externalized resources enable localization, theming, and device adaptation. (Android docs — App resources)

<!-- id: runtime-permissions --> Declare every permission in the manifest, and for dangerous permissions request them at runtime and handle denial gracefully. Assuming a permission is granted without checking crashes on modern Android. Request only what the feature needs. (Android docs — Permissions on Android)

<!-- id: explicit-internal-intents --> Use explicit intents (named component/class) to start your own app's components; reserve implicit intents for cross-app actions. Implicit intents for internal navigation are ambiguous and can be intercepted by other apps. (Android docs — Intents and intent filters)

**Why:** Externalizing strings, dimensions, and colors into qualified resources lets the system pick the right variant for locale, theme, and screen without code changes, while hardcoded values block localization and adaptation. Declaring permissions in the manifest and requesting dangerous ones at runtime is required by the platform permission model, and explicit intents keep internal navigation unambiguous and safe from interception. Source: Android developer documentation.
