---
name: Peer connection lifecycle
description: Drive RTCPeerConnection off its state machine, use perfect negotiation for glare, and tear down completely
type: user
kind: architectural-rule
scope: [webrtc, connection]
relevance: when-domain-webrtc
origin: shipped
---

<!-- id: drive-off-state-machine --> Drive connection setup off the connection/ICE state machine; never assume a fixed negotiation order. Network paths, glare, and ICE restarts make ordering nondeterministic — branch on observed state, not on a hardcoded sequence. (W3C WebRTC — RTCPeerConnection.connectionState / RFC 8445 ICE)

<!-- id: handle-onnegotiationneeded --> React to the `negotiationneeded` event instead of triggering renegotiation manually. The implementation knows when SDP is stale (track/transceiver changes); manual renegotiation races with these signals and produces double-offers. (W3C WebRTC — onnegotiationneeded)

<!-- id: perfect-negotiation-for-glare --> Use the perfect-negotiation pattern (polite/impolite peer with `makingOffer` / `ignoreOffer` guards and rollback) to resolve simultaneous-offer glare. Without it, both peers offer at once and both reject, deadlocking signaling. (W3C WebRTC — setLocalDescription/rollback)

<!-- id: check-state-transitions --> Gate behaviour on `connectionState` and `iceConnectionState` transitions; never assume `connected`. Treat `disconnected`, `failed`, and `closed` explicitly — `disconnected` may recover, `failed` requires an ICE restart or teardown. (W3C WebRTC — RTCPeerConnection / RFC 8445 ICE)

<!-- id: teardown-completeness --> On teardown, close the RTCPeerConnection, stop every local track (`track.stop()`), and stop unused transceivers. Dropping the JS reference alone leaks ICE ports, DTLS sessions, and active media — release the resources explicitly. (W3C WebRTC — RTCPeerConnection.close / DTLS-SRTP)

**Why:** WebRTC connection state is emergent from ICE candidate gathering, DTLS handshake, and bidirectional SDP exchange, so any fixed ordering assumption breaks under real network conditions and simultaneous offers (glare). Driving off the state machine and the `negotiationneeded` signal — with perfect negotiation for glare — keeps signaling convergent, and explicit teardown prevents leaked ports and DTLS sessions. Source: W3C WebRTC specification / IETF RFC 8445 (ICE).
