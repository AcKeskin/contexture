---
name: OpenXR extensions and portability
description: Enumerate before enabling, hard-depend only on ratified core, feature-detect optional extensions at runtime — the portability contract across runtimes and platforms.
type: user
kind: architectural-rule
scope: [openxr, portability]
relevance: when-domain-openxr
origin: shipped
---

<!-- id: enumerate-before-enable --> Call xrEnumerateInstanceExtensionProperties before constructing XrInstanceCreateInfo::enabledExtensionNames. Never pass extension names that have not been confirmed present; xrCreateInstance will return XR_ERROR_EXTENSION_NOT_PRESENT and fail. (OpenXR: xrEnumerateInstanceExtensionProperties, XrInstanceCreateInfo, XR_ERROR_EXTENSION_NOT_PRESENT)

<!-- id: required-vs-optional --> Partition extensions into required (app cannot function without them — abort if absent) and optional (enhanced experience — feature-gate at runtime). Document this split explicitly in the extension query phase. This is the primary portability seam across runtimes. (OpenXR: xrEnumerateInstanceExtensionProperties)

<!-- id: no-hard-dep-on-optional --> Do not call functions or use structures from an optional extension unless that extension was successfully enabled. Extension functions obtained via xrGetInstanceProcAddr are null when the extension is absent; calling them is undefined behaviour. (OpenXR: xrGetInstanceProcAddr)

<!-- id: proc-addr-for-ext-functions --> Load all extension function pointers via xrGetInstanceProcAddr after instance creation. Do not link extension entry points statically where the loader may not expose them. (OpenXR: xrGetInstanceProcAddr)

<!-- id: api-layer-enumeration --> Enumerate API layers with xrEnumerateApiLayerProperties in debug/development builds; enable validation layer (XR_APILAYER_LUNARG_core_validation) when available. Never hard-enable a layer in release builds — the layer may be absent on end-user machines and will cause instance creation failure. (OpenXR: xrEnumerateApiLayerProperties, XrInstanceCreateInfo::enabledApiLayerNames)

<!-- id: check-xr-result-always --> Check the XrResult of every OpenXR call. Many functions return XR_SUCCESS for the normal case but XR_SESSION_LOSS_PENDING or XR_ERROR_* for recoverable or fatal conditions. Ignoring results silently corrupts frame loop state. Use XR_SUCCEEDED(result) for coarse checks; match specific codes for recoverable paths. (OpenXR: XrResult, XR_SUCCEEDED, XR_SESSION_LOSS_PENDING)

<!-- id: system-properties-at-runtime --> Query XrSystemProperties (via xrGetSystemProperties) and XrSystemGraphicsProperties / XrSystemTrackingProperties after instance and system enumeration. Do not assume display resolution, layer count, or tracking capabilities; minimums from one runtime are not guarantees on another. (OpenXR: xrGetSystemProperties, XrSystemProperties, XrSystemGraphicsProperties, XrSystemTrackingProperties)

**Why:** OpenXR's runtime ecosystem spans vendors with deliberately different capability sets. Code that assumes extension presence, skips enumeration, or ignores XrResult works on the developer's machine and silently breaks on another vendor's runtime. The enumerate-then-gate pattern is the spec's explicit portability mechanism; following it is the difference between a portable app and one that is accidentally portable. Source: Khronos OpenXR specification.
