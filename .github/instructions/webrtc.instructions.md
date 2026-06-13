---
applyTo: "**"
---

# webrtc rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/webrtc/` — do not hand-edit.

## Data channels and reliability

Choose ordered/reliable vs unreliable per use case deliberately. Set `maxRetransmits` or `maxPacketLifeTime` (never both) for partial reliability; leave both unset only when full reliability is actually required. State sync wants reliable; real-time telemetry wants unreliable. (W3C WebRTC — RTCDataChannel / createDataChannel options)

Respect message-size limits: chunk large payloads to a ~16 KB ceiling for portable interop. Larger single messages are not portably supported across SCTP implementations and can stall or drop the channel. (W3C WebRTC — RTCDataChannel.send)

Handle backpressure: check `bufferedAmount` before sending and pause until the `bufferedamountlow` event when it exceeds `bufferedAmountLowThreshold`. Sending blind floods the SCTP send buffer, ballooning memory and latency. (W3C WebRTC — RTCDataChannel.bufferedAmount / bufferedAmountLowThreshold)

Drive sends off the channel's `open`/`close` lifecycle: only send while `readyState === "open"`, and clean up listeners on `close`. Sending before open or after close throws or silently drops. (W3C WebRTC — RTCDataChannel.readyState)

**Why:** RTCDataChannel runs over SCTP, which exposes both reliability/ordering knobs and a finite send buffer, so the reliability mode and message size are application decisions that must be made on purpose, not defaulted into. Honoring the ~16 KB portable size ceiling, gating on `bufferedAmount`/`bufferedamountlow` for flow control, and respecting the open/close lifecycle prevents stalled channels, unbounded buffer growth, and dropped sends. Source: W3C WebRTC specification (RTCDataChannel).

## Media and tracks

Manage transceivers explicitly: set `addTransceiver` direction (`sendrecv`/`sendonly`/`recvonly`/`inactive`) deliberately and stop transceivers you no longer need. Implicit m-line creation via `addTrack` hides direction and leaves dead media sections in the SDP. (W3C WebRTC — RTCRtpTransceiver.direction)

Tie RTCRtpSender/RTCRtpReceiver lifetime to the connection — they are owned by the RTCPeerConnection, not by application code. Do not cache senders/receivers past the connection's life; they become invalid when the connection closes. (W3C WebRTC — RTCRtpSender / RTCRtpReceiver)

Never orphan MediaStreamTracks. Call `track.stop()` on every local track when removing it or tearing down — an unstopped camera/mic track keeps the device live and the capture indicator on. (W3C WebRTC — MediaStreamTrack.stop)

Renegotiate when tracks or transceivers are added or removed. Adding/removing media changes the SDP m-lines, so the change must be re-offered or the remote peer never sees the new (or gone) media. (W3C WebRTC — onnegotiationneeded)

**Why:** RTP media sections are negotiated per-transceiver in SDP, and senders/receivers/transceivers are objects the RTCPeerConnection owns and invalidates on close — treating them as long-lived application state leaks device handles and stale m-lines. Explicit direction, stopping unused transceivers, stopping every track, and renegotiating on track changes keeps the negotiated media state consistent with what the application actually streams. Source: W3C WebRTC specification (MediaStream, RTCRtpTransceiver) / IETF RFC 3550 (RTP).

## Peer connection lifecycle

Drive connection setup off the connection/ICE state machine; never assume a fixed negotiation order. Network paths, glare, and ICE restarts make ordering nondeterministic — branch on observed state, not on a hardcoded sequence. (W3C WebRTC — RTCPeerConnection.connectionState / RFC 8445 ICE)

React to the `negotiationneeded` event instead of triggering renegotiation manually. The implementation knows when SDP is stale (track/transceiver changes); manual renegotiation races with these signals and produces double-offers. (W3C WebRTC — onnegotiationneeded)

Use the perfect-negotiation pattern (polite/impolite peer with `makingOffer` / `ignoreOffer` guards and rollback) to resolve simultaneous-offer glare. Without it, both peers offer at once and both reject, deadlocking signaling. (W3C WebRTC — setLocalDescription/rollback)

Gate behaviour on `connectionState` and `iceConnectionState` transitions; never assume `connected`. Treat `disconnected`, `failed`, and `closed` explicitly — `disconnected` may recover, `failed` requires an ICE restart or teardown. (W3C WebRTC — RTCPeerConnection / RFC 8445 ICE)

On teardown, close the RTCPeerConnection, stop every local track (`track.stop()`), and stop unused transceivers. Dropping the JS reference alone leaks ICE ports, DTLS sessions, and active media — release the resources explicitly. (W3C WebRTC — RTCPeerConnection.close / DTLS-SRTP)

**Why:** WebRTC connection state is emergent from ICE candidate gathering, DTLS handshake, and bidirectional SDP exchange, so any fixed ordering assumption breaks under real network conditions and simultaneous offers (glare). Driving off the state machine and the `negotiationneeded` signal — with perfect negotiation for glare — keeps signaling convergent, and explicit teardown prevents leaked ports and DTLS sessions. Source: W3C WebRTC specification / IETF RFC 8445 (ICE).
