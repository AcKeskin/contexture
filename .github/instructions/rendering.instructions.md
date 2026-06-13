---
applyTo: "**"
---

# rendering rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/rendering/` — do not hand-edit.

## Color Space and Precision Discipline

All lighting and shading calculations must be performed in linear light (scene-linear color space); sample sRGB textures through hardware linearization (GL_SRGB8_ALPHA8 / DXGI_FORMAT_*_SRGB / MTLPixelFormatRGBA8Unorm_sRGB) so the hardware converts on read. Mixing gamma-encoded values with linear math produces physically incorrect results. (IEC 61966-2-1 sRGB standard; OpenGL 4.6 spec §8.24 "sRGB Conversion"; Khronos data format spec)

Apply the linear-to-sRGB (or target OETF) conversion exactly once, at the final swapchain/output boundary — via sRGB framebuffer attachment (GL_FRAMEBUFFER_SRGB / DXGI_FORMAT_*_SRGB swapchain), post-process tone-map output, or explicit gamma encode in the final fragment. Do not gamma-encode intermediate render targets. (OpenGL 4.6 spec §17.3.9; D3D11/D3D12 DXGI swap chain format guidelines)

For HDR output paths, apply the correct OETF for the target display standard (PQ/ST.2084 for HDR10, HLG for broadcast) in the tone-mapping pass, not ad-hoc gamma curves. HDR10 metadata (MaxCLL, MaxFALL) must be set correctly; incorrect OETF yields washed-out or clipped images on HDR displays. (ITU-R BT.2100 HDR standard; SMPTE ST.2084 PQ EOTF; D3D12 HDR output guide; Vulkan VK_EXT_hdr_metadata)

Use float16 (R16G16B16A16_FLOAT / GL_RGBA16F) or higher for HDR intermediate render targets; R8G8B8A8_UNORM is insufficient for HDR accumulation or lighting buffers and causes precision loss and banding. Use R11G11B10_FLOAT for HDR when alpha is not needed to save bandwidth. (general HDR render target best practice; GPU Pro / GPU Gems references)

Do not accumulate (additive blend, multipass light accumulation) into 8-bit unorm render targets; the quantization error compounds per pass and produces visible banding. Accumulate in float16 or higher, then resolve/tonemap to 8-bit at output. (general rendering precision best practice; physically based rendering literature)

Use a reversed-Z depth buffer (map far plane to 0.0, near plane to 1.0) with a float32 depth format; the floating-point distribution is then uniform across the depth range, minimizing z-fighting. Conventional 0=near/1=far 16-bit or 24-bit depth wastes precision near the far plane. (Reversed-Z depth buffer technique; NVIDIA "Depth Precision Visualized"; Vulkan depth range configuration)

Never mix sRGB-formatted and linear-formatted texture samples in the same lighting computation without explicit conversion; read the texture format declaration before sampling and add explicit `pow(x, 2.2)` / linearization only when hardware sRGB read is not in use. (OpenGL 4.6 spec §8.24; general sRGB-vs-linear audit practice)

When quantizing from float to 8-bit UNORM at output, apply a small triangular or blue-noise dither before the OETF encode to push quantization error below the perceptual threshold and eliminate smooth-gradient banding. (general signal processing; Bart Wronski blue-noise dithering; GPU Pro 7 dithering chapter)

**Why:** Working in the wrong color space produces physically incorrect lighting that no amount of artistic tuning fully corrects. A single mis-placed sRGB conversion or wrong render target format causes banding, blown-out HDR, and precision loss that cascades through the pipeline. Explicit format declarations and a single conversion boundary are the only reliable prevention. Source: IEC 61966-2-1 (sRGB); ITU-R BT.2100 (HDR); OpenGL 4.6 spec §8.24, §17.3.9; Khronos Data Format Specification 1.3.

## Compute and GPGPU Discipline

Size workgroups to multiples of the hardware warp/wavefront width (32 for NVIDIA, 32/64 for AMD, 32 for Intel Xe, 32/64 for Mali/Adreno); a non-multiple wastes lanes and reduces occupancy. Expose workgroup size as a specialization constant or compile-time define rather than a hardcoded literal so it can be tuned per target. (Vulkan spec §10.7; GLSL compute shader local_size; CUDA occupancy model)

Between any two dispatches where the second reads data written by the first, insert the minimal required barrier: a compute-to-compute memory barrier (Vulkan vkCmdPipelineBarrier with COMPUTE→COMPUTE scope and SHADER_WRITE→SHADER_READ access) or equivalent; omitting it yields a data race with no guaranteed ordering. (Vulkan spec §7 "Synchronization and Cache Control"; GLSL memoryBarrier() for intra-group sync)

Within a single workgroup, use a `barrier()` / `GroupMemoryBarrierWithGroupSync()` (HLSL) after writing to groupshared/shared memory before any other invocation reads it; the execution and memory model does not guarantee ordering across invocations within a group without this. (GLSL 4.60 spec §8.18; HLSL compute shader memory barriers; SPIR-V OpControlBarrier)

Prefer keeping data on the GPU between compute and render passes; staging buffers and readback copies cross the PCIe/memory bus and stall the pipeline. Readback (GPU→CPU) is especially costly — synchronize only when results are strictly required on the host. (general GPU memory bandwidth best practice; NVIDIA GPU Gems; AMD GPU best practices)

Do not call blocking full-pipeline synchronization (Vulkan vkQueueWaitIdle/vkDeviceWaitIdle, GL glFinish, D3D12 fence wait on the render thread) inside the per-frame hot path; use async fence polling or a per-frame fence-per-frame-slot instead. Full stalls serialize CPU and GPU and kill throughput. (Vulkan best practices "Avoid vkQueueWaitIdle in frame loop"; OpenGL ES best practices; D3D12 synchronization guide)

Place independent compute work (skinning, particle update, culling) on the async compute queue to overlap with graphics; ensure all inter-queue dependencies are expressed via timeline semaphores (Vulkan) or fences to avoid hazards. Only use async compute when the workload is truly independent or the overlap gain justifies the added sync complexity. (Vulkan spec §7.4 "Queue Family Properties"; AMD async compute overview; D3D12 async compute guide)

In D3D12/HLSL, insert a UAV barrier between dispatches that write and subsequently read the same unordered-access resource; the D3D12 execution model does not enforce ordering between UAV accesses in different dispatches without it. (D3D12 programming guide "UAV barriers"; HLSL SM 6.x memory model)

**Why:** The GPU memory model is weakly ordered; accesses from different invocations or dispatches are not sequentially consistent without explicit barriers. Missing barriers are a correctness hazard that is invisible on some hardware and catastrophic on others. Full stalls and unnecessary transfers destroy the overlap that makes GPU compute worthwhile. Source: Khronos Vulkan 1.3 spec §7; GLSL 4.60 spec §8.18; D3D12 synchronization documentation; NVIDIA/AMD GPU best-practice guides.

## Frame Graph and Render Passes

Every render pass / compute pass declares its read and write resources explicitly (attachments, images, buffers, memory barriers); no pass may assume state left by a prior pass unless that dependency is encoded in the graph. Implicit cross-pass state is undefined behavior on tile-based and pipelined GPUs. (Vulkan render pass attachments + subpass dependencies §8; D3D12 resource state transitions; Metal render pass descriptors)

Set attachment load/store ops to the cheapest correct value: LOAD_OP_CLEAR or LOAD_OP_DONT_CARE when the full attachment is written; STORE_OP_DONT_CARE for depth/stencil that is not sampled afterward. Incorrect load/store ops are a silent bandwidth and tile-memory cost on mobile/TBDR hardware. (Vulkan spec §8.1 VkAttachmentDescription; ARM/Qualcomm TBDR best-practice guides)

Sort draw calls within a pass by pipeline state object (PSO/program) first, then by texture/descriptor set, then by vertex buffer. Redundant PSO/program binds are costly on all GPU architectures; driver-side re-compilation or state flush may occur. (D3D12 / Vulkan PSO design; OpenGL driver optimization guides)

Render passes must not rely on OpenGL-style implicit global state (blending mode, depth test, viewport, scissor) persisting between passes unless it is explicitly re-set at pass entry. In explicit APIs (Vulkan, D3D12) this is enforced by the API; in GL/GLES code it must be enforced by convention. (OpenGL 4.6 core spec §4 "Per-Fragment Operations"; GLES best practices)

On tile-based / TBDR hardware (mobile), express on-tile dependencies (e.g., G-buffer → lighting) as subpasses / subpass dependencies rather than separate render passes with intermediate resolve; keeping data on tile avoids expensive DRAM round-trips. (Vulkan spec §8.1 subpass dependencies; Khronos blog "Vulkan on Mobile"; ARM Mali best practices)

In a frame-graph implementation, cull passes whose outputs are not consumed by the end of the frame before scheduling; this eliminates redundant rendering and simplifies resource transient allocation. (Frostbite "FrameGraph: Extensible Rendering Architecture", GDC 2017; general render-graph design)

Resources that are only alive within a single frame should be marked transient so the frame graph can alias their memory with other non-overlapping transients; do not allocate persistent GPU memory for resources that have no inter-frame lifetimes. (Vulkan memory aliasing + render pass transient attachments; D3D12 placed resources)

**Why:** Passes that assume implicit ordering or shared global state break on multi-threaded/async command recording, tile-based GPUs, and any driver that reorders work. Explicit dependencies make hazards visible at design time and enable the driver (or frame graph) to overlap passes, place barriers optimally, and alias transient memory. Source: Khronos Vulkan 1.3 spec §8 Render Pass; Frostbite Frame Graph GDC 2017; ARM Mali GPU Best Practices developer guide.

## GPU Resource Lifetime

Wrap every GPU resource (buffer, texture, pipeline, sampler, descriptor set, command buffer, render pass, framebuffer, fence, semaphore) in an RAII handle; destructor enqueues or performs the destroy call — never leak raw handles. (general; matches Vulkan explicit destroy model, GL object deletion, D3D12 Release discipline)

Before destroying any resource, confirm the GPU has finished all submitted work that references it — via fence wait, frame-in-flight counter, or submission timeline; destroying a resource still referenced by in-flight GPU commands is undefined behavior. (Vulkan spec §11 "Resource Creation"; D3D12 object lifetime rules)

Cap frames-in-flight (typically 2-3); recycle per-frame resources (uniform/constant buffers, descriptor pools, command pools) only after the corresponding fence has signaled — never index into a resource ring without checking the fence first. (Vulkan synchronization chapter; general GPU multi-buffering practice)

Destroy child objects before parent objects: framebuffers before render passes, image views before images, descriptor sets before descriptor pools, pipelines before pipeline layouts, command buffers before command pools. Inverting this order is undefined behavior in all explicit APIs. (Vulkan spec §3.3 "Object Model"; D3D12 ComPtr Release ordering)

Free or recycle staging/upload buffers after the copy command has been submitted and the relevant fence has signaled; persistent staging buffers consume VRAM/host-visible memory unnecessarily and mask transfer overhead. (general GPU memory management best practice)

When aliasing resource memory (Vulkan memory aliasing, D3D12 placed resources), insert the required memory barrier / aliasing barrier before switching which alias is active; assume no implicit invalidation by the driver. (Vulkan spec §12.8 "Memory Aliasing"; D3D12 resource aliasing barriers)

**Why:** GPU resources are not reference-counted by the API; silent use-after-destroy causes GPU faults, validation errors, and TDR/device-lost conditions that are hard to reproduce and diagnose. RAII + frame-in-flight discipline eliminates the class of "destroy too early / too late" bugs at compile/design time rather than at crash time. Source: Khronos Vulkan 1.3 spec §3 Object Model; D3D12 programming guide (object lifetime); established GPU multi-buffering patterns (e.g., Khronos Vulkan Tutorial swap-chain, NVIDIA Vulkan best practices).

## Shader and Uniform Interface Discipline

Never hardcode raw integer binding/location/set numbers at call sites; assign them via named constants, reflection, or an enum/namespace shared between CPU and GPU code. Unexplained integer literals break on API version changes and make binding collisions undetectable at compile time. (GLSL layout qualifiers; HLSL register keyword; Vulkan descriptor set/binding model)

In GLSL uniform blocks declared with `layout(std140)`: scalars align to 4 B, vec2 to 8 B, vec3/vec4 to 16 B, arrays and structs pad members to 16 B base alignment. Match every CPU-side struct to these rules exactly, or use `offsetof` assertions. One misaligned field silently corrupts all subsequent uniforms. (GLSL 4.60 spec §7.6.2.2 "Standard Uniform Block Layout")

Prefer `layout(std430)` for shader storage buffer objects (SSBOs); it eliminates the vec3/array base-16 rounding of std140, enabling tighter CPU-side struct packing. Do not use std430 for plain uniform blocks — it is not allowed there by the GLSL spec. (GLSL 4.60 spec §7.6.2.2; GLSL ARB_shader_storage_buffer_object)

In HLSL, cbuffer members pack into 16-byte rows; a member that would straddle a 16-byte boundary is silently moved to the next row, leaving padding. Mirror the packing rules on the CPU side using `packoffset` annotations or explicit padding fields; never assume the C struct layout matches. (HLSL Language Spec §13.6 "Packing Rules for Constant Variables"; D3D11/D3D12 constant buffer layout)

Place per-draw data that changes every draw call (model matrix, draw ID, material index) in push constants (Vulkan) or root constants (D3D12) rather than uniform/constant buffers; this eliminates the buffer update + barrier overhead for the most frequent path. Keep total size within the guaranteed minimum (128 bytes for Vulkan). (Vulkan spec §14.7 "Push Constant Updates"; Vulkan GPU best practices)

Partition descriptor sets by update frequency: set 0 = per-frame globals (camera, lights), set 1 = per-pass, set 2 = per-material, set 3 = per-draw. Bind lower-frequency sets less often and avoid rebinding them per draw. (Vulkan descriptor set design best practice; Khronos Vulkan samples)

Vertex shader outputs and fragment shader inputs must match by name and type (GLSL) or by semantic (HLSL); mismatches produce either a link error or silently zero-initialized inputs depending on driver. Validate with SPIR-V cross-compilation or shader reflection rather than relying on driver leniency. (GLSL 4.60 spec §4.3.4 "Input Variables"; SPIR-V spec §2.16 "Validation Rules")

Prefer Vulkan specialization constants or compile-time #define variants over dynamic uniform booleans driving large if/else trees inside shaders; the GPU executes both branches of a divergent uniform-driven branch on many architectures, wasting ALU. (Vulkan spec §10.7 "Specialization Constants"; NVIDIA GPU Best Practices Guide)

**Why:** CPU-GPU interface bugs (alignment, binding collisions, packing) are silent, often surface only on specific drivers or hardware, and cause corrupted visuals or GPU faults that are difficult to correlate to the source struct. Named bindings and explicit layout annotations make mismatches detectable at compile or link time. Source: GLSL 4.60 core spec §7.6; HLSL Language Specification §13; Khronos Vulkan descriptor set best practices.
