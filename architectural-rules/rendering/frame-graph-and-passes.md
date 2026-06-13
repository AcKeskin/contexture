---
name: Frame Graph and Render Passes
description: Explicit pass dependencies, no global state leakage between passes, pipeline-state batching, and minimal redundant state changes.
type: user
kind: architectural-rule
scope: [rendering, frame-graph]
relevance: when-domain-rendering
origin: shipped
---

<!-- id: explicit-pass-deps --> Every render pass / compute pass declares its read and write resources explicitly (attachments, images, buffers, memory barriers); no pass may assume state left by a prior pass unless that dependency is encoded in the graph. Implicit cross-pass state is undefined behavior on tile-based and pipelined GPUs. (Vulkan render pass attachments + subpass dependencies §8; D3D12 resource state transitions; Metal render pass descriptors)

<!-- id: load-store-ops --> Set attachment load/store ops to the cheapest correct value: LOAD_OP_CLEAR or LOAD_OP_DONT_CARE when the full attachment is written; STORE_OP_DONT_CARE for depth/stencil that is not sampled afterward. Incorrect load/store ops are a silent bandwidth and tile-memory cost on mobile/TBDR hardware. (Vulkan spec §8.1 VkAttachmentDescription; ARM/Qualcomm TBDR best-practice guides)

<!-- id: batch-by-pso --> Sort draw calls within a pass by pipeline state object (PSO/program) first, then by texture/descriptor set, then by vertex buffer. Redundant PSO/program binds are costly on all GPU architectures; driver-side re-compilation or state flush may occur. (D3D12 / Vulkan PSO design; OpenGL driver optimization guides)

<!-- id: no-global-state-mutation --> Render passes must not rely on OpenGL-style implicit global state (blending mode, depth test, viewport, scissor) persisting between passes unless it is explicitly re-set at pass entry. In explicit APIs (Vulkan, D3D12) this is enforced by the API; in GL/GLES code it must be enforced by convention. (OpenGL 4.6 core spec §4 "Per-Fragment Operations"; GLES best practices)

<!-- id: subpass-for-tile-data --> On tile-based / TBDR hardware (mobile), express on-tile dependencies (e.g., G-buffer → lighting) as subpasses / subpass dependencies rather than separate render passes with intermediate resolve; keeping data on tile avoids expensive DRAM round-trips. (Vulkan spec §8.1 subpass dependencies; Khronos blog "Vulkan on Mobile"; ARM Mali best practices)

<!-- id: frame-graph-culling --> In a frame-graph implementation, cull passes whose outputs are not consumed by the end of the frame before scheduling; this eliminates redundant rendering and simplifies resource transient allocation. (Frostbite "FrameGraph: Extensible Rendering Architecture", GDC 2017; general render-graph design)

<!-- id: transient-resource-lifetime --> Resources that are only alive within a single frame should be marked transient so the frame graph can alias their memory with other non-overlapping transients; do not allocate persistent GPU memory for resources that have no inter-frame lifetimes. (Vulkan memory aliasing + render pass transient attachments; D3D12 placed resources)

**Why:** Passes that assume implicit ordering or shared global state break on multi-threaded/async command recording, tile-based GPUs, and any driver that reorders work. Explicit dependencies make hazards visible at design time and enable the driver (or frame graph) to overlap passes, place barriers optimally, and alias transient memory. Source: Khronos Vulkan 1.3 spec §8 Render Pass; Frostbite Frame Graph GDC 2017; ARM Mali GPU Best Practices developer guide.
