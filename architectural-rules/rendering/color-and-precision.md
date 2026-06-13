---
name: Color Space and Precision Discipline
description: Linear-space lighting, sRGB boundary conversion, HDR transfer-function correctness, format selection to prevent banding.
type: user
kind: architectural-rule
scope: [rendering, color]
relevance: when-domain-rendering
origin: shipped
---

<!-- id: light-in-linear --> All lighting and shading calculations must be performed in linear light (scene-linear color space); sample sRGB textures through hardware linearization (GL_SRGB8_ALPHA8 / DXGI_FORMAT_*_SRGB / MTLPixelFormatRGBA8Unorm_sRGB) so the hardware converts on read. Mixing gamma-encoded values with linear math produces physically incorrect results. (IEC 61966-2-1 sRGB standard; OpenGL 4.6 spec §8.24 "sRGB Conversion"; Khronos data format spec)

<!-- id: srgb-write-at-boundary --> Apply the linear-to-sRGB (or target OETF) conversion exactly once, at the final swapchain/output boundary — via sRGB framebuffer attachment (GL_FRAMEBUFFER_SRGB / DXGI_FORMAT_*_SRGB swapchain), post-process tone-map output, or explicit gamma encode in the final fragment. Do not gamma-encode intermediate render targets. (OpenGL 4.6 spec §17.3.9; D3D11/D3D12 DXGI swap chain format guidelines)

<!-- id: hdr-oetf --> For HDR output paths, apply the correct OETF for the target display standard (PQ/ST.2084 for HDR10, HLG for broadcast) in the tone-mapping pass, not ad-hoc gamma curves. HDR10 metadata (MaxCLL, MaxFALL) must be set correctly; incorrect OETF yields washed-out or clipped images on HDR displays. (ITU-R BT.2100 HDR standard; SMPTE ST.2084 PQ EOTF; D3D12 HDR output guide; Vulkan VK_EXT_hdr_metadata)

<!-- id: rt-format-precision --> Use float16 (R16G16B16A16_FLOAT / GL_RGBA16F) or higher for HDR intermediate render targets; R8G8B8A8_UNORM is insufficient for HDR accumulation or lighting buffers and causes precision loss and banding. Use R11G11B10_FLOAT for HDR when alpha is not needed to save bandwidth. (general HDR render target best practice; GPU Pro / GPU Gems references)

<!-- id: no-8bit-accumulation --> Do not accumulate (additive blend, multipass light accumulation) into 8-bit unorm render targets; the quantization error compounds per pass and produces visible banding. Accumulate in float16 or higher, then resolve/tonemap to 8-bit at output. (general rendering precision best practice; physically based rendering literature)

<!-- id: depth-format-choice --> Use a reversed-Z depth buffer (map far plane to 0.0, near plane to 1.0) with a float32 depth format; the floating-point distribution is then uniform across the depth range, minimizing z-fighting. Conventional 0=near/1=far 16-bit or 24-bit depth wastes precision near the far plane. (Reversed-Z depth buffer technique; NVIDIA "Depth Precision Visualized"; Vulkan depth range configuration)

<!-- id: avoid-implicit-colorspace-conversion --> Never mix sRGB-formatted and linear-formatted texture samples in the same lighting computation without explicit conversion; read the texture format declaration before sampling and add explicit `pow(x, 2.2)` / linearization only when hardware sRGB read is not in use. (OpenGL 4.6 spec §8.24; general sRGB-vs-linear audit practice)

<!-- id: dithering-at-quantize --> When quantizing from float to 8-bit UNORM at output, apply a small triangular or blue-noise dither before the OETF encode to push quantization error below the perceptual threshold and eliminate smooth-gradient banding. (general signal processing; Bart Wronski blue-noise dithering; GPU Pro 7 dithering chapter)

**Why:** Working in the wrong color space produces physically incorrect lighting that no amount of artistic tuning fully corrects. A single mis-placed sRGB conversion or wrong render target format causes banding, blown-out HDR, and precision loss that cascades through the pipeline. Explicit format declarations and a single conversion boundary are the only reliable prevention. Source: IEC 61966-2-1 (sRGB); ITU-R BT.2100 (HDR); OpenGL 4.6 spec §8.24, §17.3.9; Khronos Data Format Specification 1.3.
