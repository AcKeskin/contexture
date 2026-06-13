---
name: Timing and buffer discipline
description: Keep PTS/DTS correct under B-frame reorder, pool buffers (no hot-path heap), respect DPB/reference limits, bound latency
type: user
kind: architectural-rule
scope: [codecs, timing]
relevance: when-domain-codecs
origin: shipped
---

<!-- id: pts-dts-decode-vs-presentation --> Track presentation (PTS) and decode (DTS) timestamps separately; with B-frames the decode order differs from presentation order, so never assume output emerges in input/display order. Carry the source PTS on each frame and let the codec/container assign DTS; reordering output by arrival instead of PTS produces stutter and A/V drift. Honor the codec's reorder delay when computing end-to-end latency. (H.264/AVC §C / HEVC §C HRD picture timing; container PTS/DTS, e.g. ISO BMFF cts offsets)

<!-- id: pool-buffers-no-hotpath-alloc --> Reuse buffer/surface pools sized to the in-flight depth; never allocate or free frame buffers on the per-frame hot path. Heap allocation, GPU surface creation, and zeroing per frame add jitter and latency and fragment memory at sustained frame rates; acquire from a pool, return on completion. Size the pool to DPB + lookahead + async depth so it never starves. (VideoToolbox CVPixelBufferPool; FFmpeg AVBufferPool / get_buffer2 refcounted frames)

<!-- id: respect-dpb-and-reference-limits --> Respect the codec's decoded-picture-buffer and reference-frame constraints — max_dec_frame_buffering / num_ref_frames implied by the level and stream config; do not hold more references or reorder deeper than the negotiated profile/level permits. Exceeding the DPB causes decoder failure or forces reference eviction that breaks prediction; configure GOP/reference structure within level limits. (H.264/AVC level limits MaxDpbMbs; HEVC sps_max_dec_pic_buffering / level table)

<!-- id: bound-latency-no-unbounded-queue --> Bound every queue between pipeline stages; never let frames accumulate without backpressure. Unbounded queues trade latency for the illusion of throughput — they hide a too-slow stage until memory blows up and end-to-end delay is unusable for live/interactive use. For low latency, cap lookahead/B-frame depth and apply backpressure to the producer instead of buffering. (general low-latency encode practice; HRD/CPB buffer model bounds in H.264/HEVC §C)

**Why:** B-frames make decode order diverge from presentation order, so PTS and DTS must be tracked independently or playback stutters and drifts. Per-frame allocation injects jitter at frame rate, so buffers must come from pools sized to in-flight depth. The DPB and reference limits are level-bound contracts the decoder enforces, and unbounded inter-stage queues convert a slow stage into unbounded latency and memory growth. Source: codec specifications / platform encode-decode API contracts.
