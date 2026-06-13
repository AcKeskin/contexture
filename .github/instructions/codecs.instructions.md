---
applyTo: "**"
---

# codecs rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/codecs/` — do not hand-edit.

## Codec session lifetime

Treat each hardware encode/decode session as an explicitly-owned scarce resource with a defined create→use→destroy lifetime; release it deterministically, never on GC/finalizer timing. Hardware codec engines (NVENC/NVDEC, VideoToolbox, MediaCodec) expose a small fixed number of concurrent sessions; a leaked session starves every other consumer on the host until process exit. (VideoToolbox VTCompressionSession / VTDecompressionSession; NVENC nvEncOpenEncodeSessionEx + nvEncDestroyEncoder contract)

Open the session once for a stream and feed every frame through it; never create-and-destroy per frame. Session creation negotiates hardware, allocates the DPB/reference pool, and parses/builds parameter sets — per-frame churn destroys rate-control state, forces an IDR each time, and dominates latency. Reconfigure in place where the API allows (bitrate/framerate change) rather than tearing down. (NVENC reconfigure; VTSessionSetProperty; H.264/AVC §7.4.2 parameter-set continuity)

FLUSH/drain the codec before destroying the session and only then release. Encoders and decoders hold queued/in-flight frames (lookahead, B-frame reordering, async slots); destroying without draining silently drops trailing frames and truncates the bitstream. Submit the end-of-stream/flush sentinel, pump completions until the codec reports empty, then destroy. (VTCompressionSessionCompleteFrames; NVENC EOS NULL-input flush; MediaCodec end-of-stream BUFFER_FLAG_END_OF_STREAM)

For callback/async-completion codecs, treat submit and completion as separate events: do not assume output is ready when input returns, keep input frames/buffers alive until their completion fires, and join all outstanding completions before teardown. Releasing an input buffer or the session while a completion is pending corrupts output or faults the driver. (VTCompressionSession output handler; NVENC async event + nvEncLockBitstream; MediaCodec dequeueOutputBuffer)

**Why:** Hardware codec sessions are a scarce, explicitly-owned resource — leaking one degrades the whole machine, and per-frame teardown wrecks rate control and latency. Trailing frames live inside the codec's reorder/lookahead queues, so destroying without an explicit drain truncates output. Async codecs decouple submission from completion, so buffer and session lifetimes must outlive in-flight work. Source: codec specifications / platform encode-decode API contracts.

## Pixel format and color signaling

Negotiate the surface pixel format explicitly (NV12, I420, P010, etc.) at session setup; never assume the codec's default or a producer/consumer match. Layout, chroma subsampling (4:2:0 vs 4:2:2), and bit depth (8 vs 10) differ across hardware and platforms; a mismatched assumption yields swapped chroma, green frames, or a silent reinterpret. (VideoToolbox kCVPixelBufferPixelFormatTypeKey; FFmpeg/libav AVPixelFormat negotiation; MediaCodec COLOR_FormatYUV420* / format query)

Propagate color primaries, transfer characteristics, matrix coefficients, and range (full vs limited/video) as first-class metadata from source through encode, container, and decode to display. These are independent axes; dropping or defaulting any one produces visibly wrong color (washed-out, shifted hue, crushed black/white) even though every frame "decodes". Carry them in the bitstream VUI and the container, and keep them consistent across both. (ITU-T H.273 code points; H.264/HEVC VUI colour_primaries / transfer_characteristics / matrix_coefficients / video_full_range_flag)

Avoid implicit or unnecessary pixel-format and colorspace conversions in the pipeline; convert only when a stage genuinely requires it, and convert deliberately with known math. Each RGB↔YUV or range/primary conversion costs cycles and can lose precision (8-bit round-trips, range clamping); chained implicit conversions compound error. Keep zero-copy paths zero-copy. (H.273 matrix_coefficients defines the YUV↔RGB math; limited↔full range clamping)

Match the HDR transfer function (PQ / SMPTE ST 2084, HLG / ARIB STD-B67) end to end and pass HDR static/dynamic metadata (mastering display, MaxCLL/MaxFALL) through unchanged. Treating PQ content as SDR (or re-tonemapping mid-pipeline) destroys the HDR grade and blows out highlights or crushes shadows. Signal the transfer in H.273 code points and the container, and do not silently tonemap. (H.273 transfer_characteristics PQ=16 / HLG=18; HEVC mastering-display + content-light-level SEI)

**Why:** Pixel format and color are independent, easily-defaulted axes that the codec will happily honor wrong — bad assumptions decode cleanly but look broken. Primaries, transfer, matrix, and range must travel together through bitstream and container or color shifts; implicit conversions cost performance and precision. HDR is just a transfer-function and metadata contract that must hold from source to display, or the grade is lost. Source: codec specifications / platform encode-decode API contracts.

## Timing and buffer discipline

Track presentation (PTS) and decode (DTS) timestamps separately; with B-frames the decode order differs from presentation order, so never assume output emerges in input/display order. Carry the source PTS on each frame and let the codec/container assign DTS; reordering output by arrival instead of PTS produces stutter and A/V drift. Honor the codec's reorder delay when computing end-to-end latency. (H.264/AVC §C / HEVC §C HRD picture timing; container PTS/DTS, e.g. ISO BMFF cts offsets)

Reuse buffer/surface pools sized to the in-flight depth; never allocate or free frame buffers on the per-frame hot path. Heap allocation, GPU surface creation, and zeroing per frame add jitter and latency and fragment memory at sustained frame rates; acquire from a pool, return on completion. Size the pool to DPB + lookahead + async depth so it never starves. (VideoToolbox CVPixelBufferPool; FFmpeg AVBufferPool / get_buffer2 refcounted frames)

Respect the codec's decoded-picture-buffer and reference-frame constraints — max_dec_frame_buffering / num_ref_frames implied by the level and stream config; do not hold more references or reorder deeper than the negotiated profile/level permits. Exceeding the DPB causes decoder failure or forces reference eviction that breaks prediction; configure GOP/reference structure within level limits. (H.264/AVC level limits MaxDpbMbs; HEVC sps_max_dec_pic_buffering / level table)

Bound every queue between pipeline stages; never let frames accumulate without backpressure. Unbounded queues trade latency for the illusion of throughput — they hide a too-slow stage until memory blows up and end-to-end delay is unusable for live/interactive use. For low latency, cap lookahead/B-frame depth and apply backpressure to the producer instead of buffering. (general low-latency encode practice; HRD/CPB buffer model bounds in H.264/HEVC §C)

**Why:** B-frames make decode order diverge from presentation order, so PTS and DTS must be tracked independently or playback stutters and drifts. Per-frame allocation injects jitter at frame rate, so buffers must come from pools sized to in-flight depth. The DPB and reference limits are level-bound contracts the decoder enforces, and unbounded inter-stage queues convert a slow stage into unbounded latency and memory growth. Source: codec specifications / platform encode-decode API contracts.
