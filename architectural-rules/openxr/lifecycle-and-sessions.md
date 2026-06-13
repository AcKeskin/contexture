---
name: OpenXR lifecycle and sessions
description: Instance/session/swapchain create-destroy ordering, frame loop discipline, session state machine — the structural backbone of every OpenXR application.
type: user
kind: architectural-rule
scope: [openxr, lifecycle]
relevance: when-domain-openxr
origin: shipped
---

<!-- id: create-destroy-order --> Destroy in strict reverse-creation order: swapchain → session → instance. Violating this tears down dependent handles while their parents are still live. (OpenXR: xrDestroySwapchain, xrDestroySession, xrDestroyInstance)

<!-- id: frame-loop-order --> The frame loop is xrWaitFrame → xrBeginFrame → submit layers → xrEndFrame, in that order, every frame. Skipping xrWaitFrame or reordering the calls is undefined behaviour; the runtime uses the blocking xrWaitFrame to pace the app to the display. (OpenXR: xrWaitFrame, xrBeginFrame, xrEndFrame)

<!-- id: predicted-display-time --> Use XrFrameState::predictedDisplayTime from xrWaitFrame as the time argument to xrLocateSpace, xrGetActionStatePose, and layer projection views. Never substitute wall-clock time or an independent timer; the runtime's prediction is calibrated to the physical display scanout and differs from wall-clock by compositor pipeline depth. (OpenXR: XrFrameState, xrWaitFrame)

<!-- id: session-state-machine --> Let XrSessionState drive xrBeginSession and xrEndSession. Transition to READY before calling xrBeginSession; transition through STOPPING before calling xrEndSession. Poll events each frame with xrPollEvent; act on XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED. Do not cache state across frames and assume it is still valid. (OpenXR: xrPollEvent, XrSessionState, xrBeginSession, xrEndSession, XrEventDataSessionStateChanged)

<!-- id: swapchain-acquire-wait-release --> Swapchain image access follows acquire → wait → render → release. Never render into an image that has not been waited for with xrWaitSwapchainImage; never release before the GPU work targeting that image is submitted. (OpenXR: xrAcquireSwapchainImage, xrWaitSwapchainImage, xrReleaseSwapchainImage)

**Why:** The OpenXR runtime owns the display schedule and the XR session lifecycle. Code that bypasses the state machine or substitutes its own timing will work on some runtimes by accident and fail on others — often silently producing wrong reprojection or dropped frames. The frame loop contract exists because runtimes use xrWaitFrame's blocking point to synchronise prediction windows, frame pacing, and ATW; violating the ordering breaks those guarantees. Source: Khronos OpenXR specification.
