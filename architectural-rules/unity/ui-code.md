---
name: Unity UI architecture rules
description: UI never owns game state. Localization mandatory. Keyboard + gamepad parity. Pick UI Toolkit for new screen-space UI on 2022.3+.
type: user
kind: architectural-rule
scope: [unity, ui]
relevance: when-domain-unity
---

- UI never owns or directly mutates game state. Display state, emit events / commands for changes.
- All player-facing strings go through the localization system. No hardcoded strings in UXML, prefabs, or code.
- Every interactive element must be reachable by both pointer (mouse/touch) and gamepad. Mouse-only navigation is a bug.
- Animations must be skippable. Respect reduced-motion preferences when the platform exposes them.
- UI must never block the main thread. Long work goes off-thread or into coroutines/Awaitable.
- Pick UI Toolkit for new screen-space UI on Unity 2022.3+. Drop to UGUI only when UI Toolkit can't deliver — world-space UI, complex tween chains driven by DOTween, or features UITK still lacks at the project's editor target.
- Do not mix UI Toolkit and UGUI inside the same screen. Pick one per screen.

**Why:** UI that owns state desyncs from the simulation the moment another system touches the same value. Localization-after-the-fact requires retrofitting every label site. Gamepad parity is non-negotiable for console / Steam Deck targets and trivial to add up front. UI Toolkit is the strategic engine path — UGUI is in maintenance — but UGUI still wins for world-space and tween-heavy work, so don't pretend it's deprecated.
