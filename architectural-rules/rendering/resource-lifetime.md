---
name: GPU Resource Lifetime
description: RAII ownership, explicit destroy ordering, and fence/frame-in-flight discipline for GPU resources.
type: user
kind: architectural-rule
scope: [rendering, resource-management]
relevance: when-domain-rendering
origin: shipped
---

<!-- id: raii-gpu-resource --> Wrap every GPU resource (buffer, texture, pipeline, sampler, descriptor set, command buffer, render pass, framebuffer, fence, semaphore) in an RAII handle; destructor enqueues or performs the destroy call — never leak raw handles. (general; matches Vulkan explicit destroy model, GL object deletion, D3D12 Release discipline)

<!-- id: fence-before-destroy --> Before destroying any resource, confirm the GPU has finished all submitted work that references it — via fence wait, frame-in-flight counter, or submission timeline; destroying a resource still referenced by in-flight GPU commands is undefined behavior. (Vulkan spec §11 "Resource Creation"; D3D12 object lifetime rules)

<!-- id: frame-in-flight-cap --> Cap frames-in-flight (typically 2-3); recycle per-frame resources (uniform/constant buffers, descriptor pools, command pools) only after the corresponding fence has signaled — never index into a resource ring without checking the fence first. (Vulkan synchronization chapter; general GPU multi-buffering practice)

<!-- id: destroy-order --> Destroy child objects before parent objects: framebuffers before render passes, image views before images, descriptor sets before descriptor pools, pipelines before pipeline layouts, command buffers before command pools. Inverting this order is undefined behavior in all explicit APIs. (Vulkan spec §3.3 "Object Model"; D3D12 ComPtr Release ordering)

<!-- id: no-orphan-staging --> Free or recycle staging/upload buffers after the copy command has been submitted and the relevant fence has signaled; persistent staging buffers consume VRAM/host-visible memory unnecessarily and mask transfer overhead. (general GPU memory management best practice)

<!-- id: memory-aliasing-explicit --> When aliasing resource memory (Vulkan memory aliasing, D3D12 placed resources), insert the required memory barrier / aliasing barrier before switching which alias is active; assume no implicit invalidation by the driver. (Vulkan spec §12.8 "Memory Aliasing"; D3D12 resource aliasing barriers)

**Why:** GPU resources are not reference-counted by the API; silent use-after-destroy causes GPU faults, validation errors, and TDR/device-lost conditions that are hard to reproduce and diagnose. RAII + frame-in-flight discipline eliminates the class of "destroy too early / too late" bugs at compile/design time rather than at crash time. Source: Khronos Vulkan 1.3 spec §3 Object Model; D3D12 programming guide (object lifetime); established GPU multi-buffering patterns (e.g., Khronos Vulkan Tutorial swap-chain, NVIDIA Vulkan best practices).
