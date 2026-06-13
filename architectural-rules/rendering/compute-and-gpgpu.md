---
name: Compute and GPGPU Discipline
description: Workgroup sizing, barrier/sync correctness between dispatches, host-device transfer minimization, async-first synchronization.
type: user
kind: architectural-rule
scope: [rendering, compute]
relevance: when-domain-rendering
origin: shipped
---

<!-- id: workgroup-size-hardware --> Size workgroups to multiples of the hardware warp/wavefront width (32 for NVIDIA, 32/64 for AMD, 32 for Intel Xe, 32/64 for Mali/Adreno); a non-multiple wastes lanes and reduces occupancy. Expose workgroup size as a specialization constant or compile-time define rather than a hardcoded literal so it can be tuned per target. (Vulkan spec §10.7; GLSL compute shader local_size; CUDA occupancy model)

<!-- id: barrier-between-dependent-dispatches --> Between any two dispatches where the second reads data written by the first, insert the minimal required barrier: a compute-to-compute memory barrier (Vulkan vkCmdPipelineBarrier with COMPUTE→COMPUTE scope and SHADER_WRITE→SHADER_READ access) or equivalent; omitting it yields a data race with no guaranteed ordering. (Vulkan spec §7 "Synchronization and Cache Control"; GLSL memoryBarrier() for intra-group sync)

<!-- id: groupshared-barrier --> Within a single workgroup, use a `barrier()` / `GroupMemoryBarrierWithGroupSync()` (HLSL) after writing to groupshared/shared memory before any other invocation reads it; the execution and memory model does not guarantee ordering across invocations within a group without this. (GLSL 4.60 spec §8.18; HLSL compute shader memory barriers; SPIR-V OpControlBarrier)

<!-- id: minimize-host-device-transfer --> Prefer keeping data on the GPU between compute and render passes; staging buffers and readback copies cross the PCIe/memory bus and stall the pipeline. Readback (GPU→CPU) is especially costly — synchronize only when results are strictly required on the host. (general GPU memory bandwidth best practice; NVIDIA GPU Gems; AMD GPU best practices)

<!-- id: no-stall-in-hot-path --> Do not call blocking full-pipeline synchronization (Vulkan vkQueueWaitIdle/vkDeviceWaitIdle, GL glFinish, D3D12 fence wait on the render thread) inside the per-frame hot path; use async fence polling or a per-frame fence-per-frame-slot instead. Full stalls serialize CPU and GPU and kill throughput. (Vulkan best practices "Avoid vkQueueWaitIdle in frame loop"; OpenGL ES best practices; D3D12 synchronization guide)

<!-- id: async-compute-queue --> Place independent compute work (skinning, particle update, culling) on the async compute queue to overlap with graphics; ensure all inter-queue dependencies are expressed via timeline semaphores (Vulkan) or fences to avoid hazards. Only use async compute when the workload is truly independent or the overlap gain justifies the added sync complexity. (Vulkan spec §7.4 "Queue Family Properties"; AMD async compute overview; D3D12 async compute guide)

<!-- id: uav-barrier-d3d --> In D3D12/HLSL, insert a UAV barrier between dispatches that write and subsequently read the same unordered-access resource; the D3D12 execution model does not enforce ordering between UAV accesses in different dispatches without it. (D3D12 programming guide "UAV barriers"; HLSL SM 6.x memory model)

**Why:** The GPU memory model is weakly ordered; accesses from different invocations or dispatches are not sequentially consistent without explicit barriers. Missing barriers are a correctness hazard that is invisible on some hardware and catastrophic on others. Full stalls and unnecessary transfers destroy the overlap that makes GPU compute worthwhile. Source: Khronos Vulkan 1.3 spec §7; GLSL 4.60 spec §8.18; D3D12 synchronization documentation; NVIDIA/AMD GPU best-practice guides.
