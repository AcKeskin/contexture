---
applyTo: "**"
---

# openxr rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/openxr/` — do not hand-edit.

## OpenXR extensions and portability

Call xrEnumerateInstanceExtensionProperties before constructing XrInstanceCreateInfo::enabledExtensionNames. Never pass extension names that have not been confirmed present; xrCreateInstance will return XR_ERROR_EXTENSION_NOT_PRESENT and fail. (OpenXR: xrEnumerateInstanceExtensionProperties, XrInstanceCreateInfo, XR_ERROR_EXTENSION_NOT_PRESENT)

Partition extensions into required (app cannot function without them — abort if absent) and optional (enhanced experience — feature-gate at runtime). Document this split explicitly in the extension query phase. This is the primary portability seam across runtimes. (OpenXR: xrEnumerateInstanceExtensionProperties)

Do not call functions or use structures from an optional extension unless that extension was successfully enabled. Extension functions obtained via xrGetInstanceProcAddr are null when the extension is absent; calling them is undefined behaviour. (OpenXR: xrGetInstanceProcAddr)

Load all extension function pointers via xrGetInstanceProcAddr after instance creation. Do not link extension entry points statically where the loader may not expose them. (OpenXR: xrGetInstanceProcAddr)

Enumerate API layers with xrEnumerateApiLayerProperties in debug/development builds; enable validation layer (XR_APILAYER_LUNARG_core_validation) when available. Never hard-enable a layer in release builds — the layer may be absent on end-user machines and will cause instance creation failure. (OpenXR: xrEnumerateApiLayerProperties, XrInstanceCreateInfo::enabledApiLayerNames)

Check the XrResult of every OpenXR call. Many functions return XR_SUCCESS for the normal case but XR_SESSION_LOSS_PENDING or XR_ERROR_* for recoverable or fatal conditions. Ignoring results silently corrupts frame loop state. Use XR_SUCCEEDED(result) for coarse checks; match specific codes for recoverable paths. (OpenXR: XrResult, XR_SUCCEEDED, XR_SESSION_LOSS_PENDING)

Query XrSystemProperties (via xrGetSystemProperties) and XrSystemGraphicsProperties / XrSystemTrackingProperties after instance and system enumeration. Do not assume display resolution, layer count, or tracking capabilities; minimums from one runtime are not guarantees on another. (OpenXR: xrGetSystemProperties, XrSystemProperties, XrSystemGraphicsProperties, XrSystemTrackingProperties)

**Why:** OpenXR's runtime ecosystem spans vendors with deliberately different capability sets. Code that assumes extension presence, skips enumeration, or ignores XrResult works on the developer's machine and silently breaks on another vendor's runtime. The enumerate-then-gate pattern is the spec's explicit portability mechanism; following it is the difference between a portable app and one that is accidentally portable. Source: Khronos OpenXR specification.

## OpenXR input actions

Call xrSuggestInteractionProfileBindings once per interaction profile during initialisation, before xrBeginSession. Suggesting bindings inside the frame loop is legal but wasteful; more importantly it signals that the binding design couples input layout to runtime state, which is an architecture smell. (OpenXR: xrSuggestInteractionProfileBindings, XrInteractionProfileSuggestedBinding)

Attach all action sets to the session with xrAttachSessionActionSets before calling xrBeginSession. Action sets cannot be attached or detached after the session begins; design the full set of required actions up front. (OpenXR: xrAttachSessionActionSets)

Call xrSyncActions every frame before querying any action state. Action state is a snapshot; it is only updated by xrSyncActions. Reading stale state (e.g. querying without syncing after a focus loss/regain) produces silently outdated input. (OpenXR: xrSyncActions, XrActionsSyncInfo)

Never hardcode a device-specific component path (e.g. a literal vendor path string) as the only binding. Suggest bindings for at least the Khronos Simple Controller profile (/interaction_profiles/khr/simple_controller) as a universal fallback, then add richer profiles for known hardware. The runtime selects the best available profile. (OpenXR: xrSuggestInteractionProfileBindings, XrPath, /interaction_profiles/khr/simple_controller)

Check XrActionStateBoolean::isActive / XrActionStateFloat::isActive / XrActionStatePose::isActive before using the state value. isActive is false when no interaction profile is active for that action or the source binding is not available; reading currentState when inactive is undefined. (OpenXR: XrActionStateBoolean, XrActionStateFloat, XrActionStatePose)

Use xrGetCurrentInteractionProfile to discover which profile is active at runtime; use this to select context-sensitive button-prompt icons. Do not assume a profile based on platform at compile time. (OpenXR: xrGetCurrentInteractionProfile, XrInteractionProfileState)

**Why:** The action model is OpenXR's portability boundary for input. Designs that bypass it — by querying raw device paths or assuming a specific controller layout — break whenever the user switches hardware or the runtime remaps inputs. The init-time suggest + per-frame sync contract keeps input logic stateless between frames and lets the runtime handle rebinding, accessibility remapping, and device hot-swap transparently. Source: Khronos OpenXR specification.

## OpenXR lifecycle and sessions

Destroy in strict reverse-creation order: swapchain → session → instance. Violating this tears down dependent handles while their parents are still live. (OpenXR: xrDestroySwapchain, xrDestroySession, xrDestroyInstance)

The frame loop is xrWaitFrame → xrBeginFrame → submit layers → xrEndFrame, in that order, every frame. Skipping xrWaitFrame or reordering the calls is undefined behaviour; the runtime uses the blocking xrWaitFrame to pace the app to the display. (OpenXR: xrWaitFrame, xrBeginFrame, xrEndFrame)

Use XrFrameState::predictedDisplayTime from xrWaitFrame as the time argument to xrLocateSpace, xrGetActionStatePose, and layer projection views. Never substitute wall-clock time or an independent timer; the runtime's prediction is calibrated to the physical display scanout and differs from wall-clock by compositor pipeline depth. (OpenXR: XrFrameState, xrWaitFrame)

Let XrSessionState drive xrBeginSession and xrEndSession. Transition to READY before calling xrBeginSession; transition through STOPPING before calling xrEndSession. Poll events each frame with xrPollEvent; act on XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED. Do not cache state across frames and assume it is still valid. (OpenXR: xrPollEvent, XrSessionState, xrBeginSession, xrEndSession, XrEventDataSessionStateChanged)

Swapchain image access follows acquire → wait → render → release. Never render into an image that has not been waited for with xrWaitSwapchainImage; never release before the GPU work targeting that image is submitted. (OpenXR: xrAcquireSwapchainImage, xrWaitSwapchainImage, xrReleaseSwapchainImage)

**Why:** The OpenXR runtime owns the display schedule and the XR session lifecycle. Code that bypasses the state machine or substitutes its own timing will work on some runtimes by accident and fail on others — often silently producing wrong reprojection or dropped frames. The frame loop contract exists because runtimes use xrWaitFrame's blocking point to synchronise prediction windows, frame pacing, and ATW; violating the ordering breaks those guarantees. Source: Khronos OpenXR specification.

## OpenXR spaces and tracking

ALWAYS test XR_SPACE_LOCATION_POSITION_VALID_BIT and XR_SPACE_LOCATION_ORIENTATION_VALID_BIT in XrSpaceLocation::locationFlags before reading the pose. Runtimes set these bits to zero when tracking is lost or the space is not yet initialised; using unvalidated pose data produces garbage transforms. (OpenXR: XrSpaceLocation, XrSpaceLocationFlags, XR_SPACE_LOCATION_POSITION_VALID_BIT, XR_SPACE_LOCATION_ORIENTATION_VALID_BIT)

Distinguish VALID from TRACKED. POSITION_VALID and ORIENTATION_VALID mean the pose has a value; POSITION_TRACKED and ORIENTATION_TRACKED additionally mean the runtime is actively tracking (not extrapolating from last known). Drive rendering decisions on VALID; drive UI feedback (e.g. "tracking lost" indicator) on the absence of TRACKED. (OpenXR: XR_SPACE_LOCATION_POSITION_TRACKED_BIT, XR_SPACE_LOCATION_ORIENTATION_TRACKED_BIT)

Pass predictedDisplayTime from XrFrameState as the time argument to xrLocateSpace. The runtime's prediction accounts for motion-to-photon latency at that exact display scanout; any other timestamp yields a stale or speculative pose. (OpenXR: xrLocateSpace, XrFrameState::predictedDisplayTime)

Choose reference spaces by semantic intent: XR_REFERENCE_SPACE_TYPE_LOCAL for head-locked or room-scale content anchored to a recentring origin; XR_REFERENCE_SPACE_TYPE_STAGE for floor-level play-area content; XR_REFERENCE_SPACE_TYPE_VIEW for content rigidly attached to the HMD optical axes. Verify support with xrEnumerateReferenceSpaces before creating. (OpenXR: xrEnumerateReferenceSpaces, xrCreateReferenceSpace, XrReferenceSpaceType)

Use action spaces (created via xrCreateActionSpace) for controller and hand poses — never hard-code a reference-space offset as a proxy for a controller. Action spaces route through the interaction-profile abstraction and stay valid across input-device changes. (OpenXR: xrCreateActionSpace, XrActionSpaceCreateInfo)

Never cache a pose across frames. A pose located at frame N's predicted time is numerically wrong at frame N+1; always call xrLocateSpace each frame with that frame's predictedDisplayTime. (OpenXR: xrLocateSpace)

**Why:** Tracking is not guaranteed. A space that is valid one frame may be invalid the next — cable pulls, occlusion, room-scale boundary events. Designs that skip validity checks produce unclamped NaN/infinity transforms or silent teleportation artefacts that are extremely hard to reproduce in controlled testing. The VALID/TRACKED distinction exists to let an app render a stabilised ghost pose (VALID, not TRACKED) while informing the user, rather than freezing or crashing. Source: Khronos OpenXR specification.
