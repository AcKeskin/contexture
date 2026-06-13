---
name: C++ GPU interop
description: RAII for GPU handles, no raw GL/CUDA handles outside owning wrappers, explicit barriers before readback, typed Upload/Download, move-only GPU buffers.
type: user
kind: architectural-rule
scope: [cpp, gpu, compute]
relevance: when-language-cpp
origin: shipped
---

<!-- id: raii-gpu-handle --> Every GPU object (SSBO, shader program, framebuffer, texture, GL sync) must be owned by a RAII wrapper whose destructor calls the matching delete function (`glDeleteBuffers`, `glDeleteProgram`, `glDeleteFramebuffers`, `glDeleteTextures`). Never hold a raw `GLuint` handle in application code without a wrapping owner. (R.1)
<!-- id: move-only-gpu-buffer --> GPU buffer wrappers must be move-only (copy deleted, move `noexcept`). A copy would alias the GL buffer name, causing the second destructor to delete a buffer still in use by the GPU. The canonical pattern for a move-only GPU buffer wrapper: delete copy, define move-ctor/assign, zero-out source handle after transfer.
<!-- id: typed-upload-download --> Host↔GPU data transfer must go through typed `Upload(const std::vector<T>&)` / `Download(std::vector<T>&)` methods, never via raw `glBufferData` at call sites. The typed wrapper enforces element size (`sizeof(T)`) at one point and prevents count/byte confusion across call sites.
<!-- id: explicit-barrier --> Insert an explicit memory barrier (`glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT)`) — or `cudaDeviceSynchronize()` on CUDA paths — before any host readback or dependent dispatch that reads results written by a prior compute dispatch. Absence of a barrier is undefined behavior: the GPU may not have flushed writes yet. Encapsulate this in a wait-for-completion method and call it between dependent dispatches.
<!-- id: fence-not-finish --> Poll a fence object (e.g. via `glClientWaitSync`) to check completion instead of `glFinish`. `glFinish` stalls the CPU until the entire GPU pipeline drains; a fence signals only when the specific set of commands preceding it completes, enabling pipelining across frames.
<!-- id: no-raw-pointer-across-dispatch --> Do not pass raw host pointers or device pointers across a compute dispatch boundary. The GPU operates asynchronously; the host buffer may have been moved, resized, or freed by the time the shader reads it. All input/output data must reside in a GPU buffer (a typed GPU buffer wrapper, texture, or UBO) allocated before the dispatch and not touched by the host until the fence signals. Dispatch methods should accept a GPU buffer reference, not a raw pointer.
<!-- id: descriptor-for-gpu-objects --> Capture GPU object creation parameters in a descriptor struct (e.g. a texture descriptor, a framebuffer descriptor) passed to the constructor. This enables recreation on resize without scattering creation logic, and makes the intended format/usage explicit at the type level.
<!-- id: abstract-api-interface --> Expose GPU objects through an abstract interface (e.g. texture, framebuffer, shader, compute-shader interfaces) with a static factory. Concrete OpenGL/Vulkan/CUDA types are implementation details hidden from callers.

**Why:** GPU APIs are C-level interfaces that return integer names or opaque pointers with no reference counting. Without RAII wrappers, leak and double-delete bugs appear only at teardown or on error paths. Barriers and fences are the correctness contract for async compute — missing one is a race condition the driver does not diagnose. Source: C++ Core Guidelines (R.1).
