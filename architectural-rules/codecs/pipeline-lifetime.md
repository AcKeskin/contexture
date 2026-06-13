---
name: Codec session lifetime
description: Create codec sessions once, reuse across frames, drain before destroy, never leak scarce hardware sessions, handle async completion
type: user
kind: architectural-rule
scope: [codecs, lifetime]
relevance: when-domain-codecs
origin: shipped
---

<!-- id: session-is-scarce-resource --> Treat each hardware encode/decode session as an explicitly-owned scarce resource with a defined create→use→destroy lifetime; release it deterministically, never on GC/finalizer timing. Hardware codec engines (NVENC/NVDEC, VideoToolbox, MediaCodec) expose a small fixed number of concurrent sessions; a leaked session starves every other consumer on the host until process exit. (VideoToolbox VTCompressionSession / VTDecompressionSession; NVENC nvEncOpenEncodeSessionEx + nvEncDestroyEncoder contract)

<!-- id: reuse-session-across-frames --> Open the session once for a stream and feed every frame through it; never create-and-destroy per frame. Session creation negotiates hardware, allocates the DPB/reference pool, and parses/builds parameter sets — per-frame churn destroys rate-control state, forces an IDR each time, and dominates latency. Reconfigure in place where the API allows (bitrate/framerate change) rather than tearing down. (NVENC reconfigure; VTSessionSetProperty; H.264/AVC §7.4.2 parameter-set continuity)

<!-- id: drain-before-destroy --> FLUSH/drain the codec before destroying the session and only then release. Encoders and decoders hold queued/in-flight frames (lookahead, B-frame reordering, async slots); destroying without draining silently drops trailing frames and truncates the bitstream. Submit the end-of-stream/flush sentinel, pump completions until the codec reports empty, then destroy. (VTCompressionSessionCompleteFrames; NVENC EOS NULL-input flush; MediaCodec end-of-stream BUFFER_FLAG_END_OF_STREAM)

<!-- id: async-completion-ownership --> For callback/async-completion codecs, treat submit and completion as separate events: do not assume output is ready when input returns, keep input frames/buffers alive until their completion fires, and join all outstanding completions before teardown. Releasing an input buffer or the session while a completion is pending corrupts output or faults the driver. (VTCompressionSession output handler; NVENC async event + nvEncLockBitstream; MediaCodec dequeueOutputBuffer)

**Why:** Hardware codec sessions are a scarce, explicitly-owned resource — leaking one degrades the whole machine, and per-frame teardown wrecks rate control and latency. Trailing frames live inside the codec's reorder/lookahead queues, so destroying without an explicit drain truncates output. Async codecs decouple submission from completion, so buffer and session lifetimes must outlive in-flight work. Source: codec specifications / platform encode-decode API contracts.
