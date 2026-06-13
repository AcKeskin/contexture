---
name: OpenXR spaces and tracking
description: Reference spaces vs action spaces, mandatory validity-flag checks before pose use, predicted-display-time as the locate timestamp.
type: user
kind: architectural-rule
scope: [openxr, tracking]
relevance: when-domain-openxr
origin: shipped
---

<!-- id: check-location-valid-bits --> ALWAYS test XR_SPACE_LOCATION_POSITION_VALID_BIT and XR_SPACE_LOCATION_ORIENTATION_VALID_BIT in XrSpaceLocation::locationFlags before reading the pose. Runtimes set these bits to zero when tracking is lost or the space is not yet initialised; using unvalidated pose data produces garbage transforms. (OpenXR: XrSpaceLocation, XrSpaceLocationFlags, XR_SPACE_LOCATION_POSITION_VALID_BIT, XR_SPACE_LOCATION_ORIENTATION_VALID_BIT)

<!-- id: tracked-vs-valid --> Distinguish VALID from TRACKED. POSITION_VALID and ORIENTATION_VALID mean the pose has a value; POSITION_TRACKED and ORIENTATION_TRACKED additionally mean the runtime is actively tracking (not extrapolating from last known). Drive rendering decisions on VALID; drive UI feedback (e.g. "tracking lost" indicator) on the absence of TRACKED. (OpenXR: XR_SPACE_LOCATION_POSITION_TRACKED_BIT, XR_SPACE_LOCATION_ORIENTATION_TRACKED_BIT)

<!-- id: locate-with-predicted-time --> Pass predictedDisplayTime from XrFrameState as the time argument to xrLocateSpace. The runtime's prediction accounts for motion-to-photon latency at that exact display scanout; any other timestamp yields a stale or speculative pose. (OpenXR: xrLocateSpace, XrFrameState::predictedDisplayTime)

<!-- id: reference-space-types --> Choose reference spaces by semantic intent: XR_REFERENCE_SPACE_TYPE_LOCAL for head-locked or room-scale content anchored to a recentring origin; XR_REFERENCE_SPACE_TYPE_STAGE for floor-level play-area content; XR_REFERENCE_SPACE_TYPE_VIEW for content rigidly attached to the HMD optical axes. Verify support with xrEnumerateReferenceSpaces before creating. (OpenXR: xrEnumerateReferenceSpaces, xrCreateReferenceSpace, XrReferenceSpaceType)

<!-- id: action-spaces-for-controllers --> Use action spaces (created via xrCreateActionSpace) for controller and hand poses — never hard-code a reference-space offset as a proxy for a controller. Action spaces route through the interaction-profile abstraction and stay valid across input-device changes. (OpenXR: xrCreateActionSpace, XrActionSpaceCreateInfo)

<!-- id: no-pose-caching --> Never cache a pose across frames. A pose located at frame N's predicted time is numerically wrong at frame N+1; always call xrLocateSpace each frame with that frame's predictedDisplayTime. (OpenXR: xrLocateSpace)

**Why:** Tracking is not guaranteed. A space that is valid one frame may be invalid the next — cable pulls, occlusion, room-scale boundary events. Designs that skip validity checks produce unclamped NaN/infinity transforms or silent teleportation artefacts that are extremely hard to reproduce in controlled testing. The VALID/TRACKED distinction exists to let an app render a stabilised ghost pose (VALID, not TRACKED) while informing the user, rather than freezing or crashing. Source: Khronos OpenXR specification.
