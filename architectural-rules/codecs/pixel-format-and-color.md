---
name: Pixel format and color signaling
description: Negotiate pixel format explicitly, carry primaries/transfer/matrix/range end to end, avoid implicit conversions, match HDR transfer
type: user
kind: architectural-rule
scope: [codecs, color]
relevance: when-domain-codecs
origin: shipped
---

<!-- id: negotiate-pixel-format-explicitly --> Negotiate the surface pixel format explicitly (NV12, I420, P010, etc.) at session setup; never assume the codec's default or a producer/consumer match. Layout, chroma subsampling (4:2:0 vs 4:2:2), and bit depth (8 vs 10) differ across hardware and platforms; a mismatched assumption yields swapped chroma, green frames, or a silent reinterpret. (VideoToolbox kCVPixelBufferPixelFormatTypeKey; FFmpeg/libav AVPixelFormat negotiation; MediaCodec COLOR_FormatYUV420* / format query)

<!-- id: carry-color-signaling-through --> Propagate color primaries, transfer characteristics, matrix coefficients, and range (full vs limited/video) as first-class metadata from source through encode, container, and decode to display. These are independent axes; dropping or defaulting any one produces visibly wrong color (washed-out, shifted hue, crushed black/white) even though every frame "decodes". Carry them in the bitstream VUI and the container, and keep them consistent across both. (ITU-T H.273 code points; H.264/HEVC VUI colour_primaries / transfer_characteristics / matrix_coefficients / video_full_range_flag)

<!-- id: avoid-implicit-conversions --> Avoid implicit or unnecessary pixel-format and colorspace conversions in the pipeline; convert only when a stage genuinely requires it, and convert deliberately with known math. Each RGB↔YUV or range/primary conversion costs cycles and can lose precision (8-bit round-trips, range clamping); chained implicit conversions compound error. Keep zero-copy paths zero-copy. (H.273 matrix_coefficients defines the YUV↔RGB math; limited↔full range clamping)

<!-- id: match-hdr-transfer-end-to-end --> Match the HDR transfer function (PQ / SMPTE ST 2084, HLG / ARIB STD-B67) end to end and pass HDR static/dynamic metadata (mastering display, MaxCLL/MaxFALL) through unchanged. Treating PQ content as SDR (or re-tonemapping mid-pipeline) destroys the HDR grade and blows out highlights or crushes shadows. Signal the transfer in H.273 code points and the container, and do not silently tonemap. (H.273 transfer_characteristics PQ=16 / HLG=18; HEVC mastering-display + content-light-level SEI)

**Why:** Pixel format and color are independent, easily-defaulted axes that the codec will happily honor wrong — bad assumptions decode cleanly but look broken. Primaries, transfer, matrix, and range must travel together through bitstream and container or color shifts; implicit conversions cost performance and precision. HDR is just a transfer-function and metadata contract that must hold from source to display, or the grade is lost. Source: codec specifications / platform encode-decode API contracts.
