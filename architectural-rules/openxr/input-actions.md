---
name: OpenXR input actions
description: Action-set/action model discipline — suggest bindings once at init, sync each frame, abstract over hardware via interaction profiles.
type: user
kind: architectural-rule
scope: [openxr, input]
relevance: when-domain-openxr
origin: shipped
---

<!-- id: suggest-bindings-at-init --> Call xrSuggestInteractionProfileBindings once per interaction profile during initialisation, before xrBeginSession. Suggesting bindings inside the frame loop is legal but wasteful; more importantly it signals that the binding design couples input layout to runtime state, which is an architecture smell. (OpenXR: xrSuggestInteractionProfileBindings, XrInteractionProfileSuggestedBinding)

<!-- id: attach-action-sets-before-session --> Attach all action sets to the session with xrAttachSessionActionSets before calling xrBeginSession. Action sets cannot be attached or detached after the session begins; design the full set of required actions up front. (OpenXR: xrAttachSessionActionSets)

<!-- id: sync-actions-each-frame --> Call xrSyncActions every frame before querying any action state. Action state is a snapshot; it is only updated by xrSyncActions. Reading stale state (e.g. querying without syncing after a focus loss/regain) produces silently outdated input. (OpenXR: xrSyncActions, XrActionsSyncInfo)

<!-- id: no-hardcoded-paths --> Never hardcode a device-specific component path (e.g. a literal vendor path string) as the only binding. Suggest bindings for at least the Khronos Simple Controller profile (/interaction_profiles/khr/simple_controller) as a universal fallback, then add richer profiles for known hardware. The runtime selects the best available profile. (OpenXR: xrSuggestInteractionProfileBindings, XrPath, /interaction_profiles/khr/simple_controller)

<!-- id: check-action-active --> Check XrActionStateBoolean::isActive / XrActionStateFloat::isActive / XrActionStatePose::isActive before using the state value. isActive is false when no interaction profile is active for that action or the source binding is not available; reading currentState when inactive is undefined. (OpenXR: XrActionStateBoolean, XrActionStateFloat, XrActionStatePose)

<!-- id: query-active-profile-for-ui --> Use xrGetCurrentInteractionProfile to discover which profile is active at runtime; use this to select context-sensitive button-prompt icons. Do not assume a profile based on platform at compile time. (OpenXR: xrGetCurrentInteractionProfile, XrInteractionProfileState)

**Why:** The action model is OpenXR's portability boundary for input. Designs that bypass it — by querying raw device paths or assuming a specific controller layout — break whenever the user switches hardware or the runtime remaps inputs. The init-time suggest + per-frame sync contract keeps input logic stateless between frames and lets the runtime handle rebinding, accessibility remapping, and device hot-swap transparently. Source: Khronos OpenXR specification.
