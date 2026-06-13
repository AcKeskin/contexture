---
name: Data channels and reliability
description: Choose reliability mode deliberately, respect message-size limits, handle backpressure via bufferedAmount
type: user
kind: architectural-rule
scope: [webrtc, datachannel]
relevance: when-domain-webrtc
origin: shipped
---

<!-- id: choose-reliability-mode --> Choose ordered/reliable vs unreliable per use case deliberately. Set `maxRetransmits` or `maxPacketLifeTime` (never both) for partial reliability; leave both unset only when full reliability is actually required. State sync wants reliable; real-time telemetry wants unreliable. (W3C WebRTC — RTCDataChannel / createDataChannel options)

<!-- id: respect-message-size --> Respect message-size limits: chunk large payloads to a ~16 KB ceiling for portable interop. Larger single messages are not portably supported across SCTP implementations and can stall or drop the channel. (W3C WebRTC — RTCDataChannel.send)

<!-- id: handle-backpressure --> Handle backpressure: check `bufferedAmount` before sending and pause until the `bufferedamountlow` event when it exceeds `bufferedAmountLowThreshold`. Sending blind floods the SCTP send buffer, ballooning memory and latency. (W3C WebRTC — RTCDataChannel.bufferedAmount / bufferedAmountLowThreshold)

<!-- id: channel-open-close-lifecycle --> Drive sends off the channel's `open`/`close` lifecycle: only send while `readyState === "open"`, and clean up listeners on `close`. Sending before open or after close throws or silently drops. (W3C WebRTC — RTCDataChannel.readyState)

**Why:** RTCDataChannel runs over SCTP, which exposes both reliability/ordering knobs and a finite send buffer, so the reliability mode and message size are application decisions that must be made on purpose, not defaulted into. Honoring the ~16 KB portable size ceiling, gating on `bufferedAmount`/`bufferedamountlow` for flow control, and respecting the open/close lifecycle prevents stalled channels, unbounded buffer growth, and dropped sends. Source: W3C WebRTC specification (RTCDataChannel).
