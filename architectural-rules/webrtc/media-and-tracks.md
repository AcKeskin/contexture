---
name: Media and tracks
description: Manage transceivers and tracks explicitly, tie sender/receiver lifetime to the connection, never orphan MediaStreamTracks
type: user
kind: architectural-rule
scope: [webrtc, media]
relevance: when-domain-webrtc
origin: shipped
---

<!-- id: explicit-transceivers --> Manage transceivers explicitly: set `addTransceiver` direction (`sendrecv`/`sendonly`/`recvonly`/`inactive`) deliberately and stop transceivers you no longer need. Implicit m-line creation via `addTrack` hides direction and leaves dead media sections in the SDP. (W3C WebRTC — RTCRtpTransceiver.direction)

<!-- id: sender-receiver-lifetime --> Tie RTCRtpSender/RTCRtpReceiver lifetime to the connection — they are owned by the RTCPeerConnection, not by application code. Do not cache senders/receivers past the connection's life; they become invalid when the connection closes. (W3C WebRTC — RTCRtpSender / RTCRtpReceiver)

<!-- id: no-orphaned-tracks --> Never orphan MediaStreamTracks. Call `track.stop()` on every local track when removing it or tearing down — an unstopped camera/mic track keeps the device live and the capture indicator on. (W3C WebRTC — MediaStreamTrack.stop)

<!-- id: renegotiate-on-track-change --> Renegotiate when tracks or transceivers are added or removed. Adding/removing media changes the SDP m-lines, so the change must be re-offered or the remote peer never sees the new (or gone) media. (W3C WebRTC — onnegotiationneeded)

**Why:** RTP media sections are negotiated per-transceiver in SDP, and senders/receivers/transceivers are objects the RTCPeerConnection owns and invalidates on close — treating them as long-lived application state leaks device handles and stale m-lines. Explicit direction, stopping unused transceivers, stopping every track, and renegotiating on track changes keeps the negotiated media state consistent with what the application actually streams. Source: W3C WebRTC specification (MediaStream, RTCRtpTransceiver) / IETF RFC 3550 (RTP).
