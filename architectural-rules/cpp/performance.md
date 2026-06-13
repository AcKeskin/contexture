---
name: C++ performance
description: noexcept on moves and non-throwing paths, avoid premature shared_ptr for single-owner resources, prefer GL_DYNAMIC_COPY over GL_STATIC_DRAW for GPU buffers written per-frame, per-frame budget not unbounded loops.
type: user
kind: architectural-rule
scope: [cpp, performance]
relevance: when-language-cpp
origin: shipped
---

<!-- id: noexcept-move-perf --> Mark move constructors and move-assignment `noexcept`. `std::vector` and other containers use the move path during reallocation only when the move is `noexcept`; without it they fall back to copy, which for GPU buffer types means double allocation or a deleted-function compile error. This is both a correctness and a performance rule. (Per.10, C.66)
<!-- id: avoid-shared-ptr-single-owner --> Do not default to `shared_ptr` for GPU resources that have a single clear owner. `shared_ptr` adds atomic reference-count increments on every copy — including passing to functions — and hides the ownership graph. Use `unique_ptr` or a move-only RAII wrapper when there is one owner; reserve `shared_ptr` for genuinely shared lifetimes (e.g. a texture referenced by multiple render passes). (R.20, R.21)
<!-- id: gpu-buffer-usage-hint --> Use `GL_DYNAMIC_COPY` for SSBOs written from the CPU and read by the GPU (compute input) or written by the GPU and read by the CPU (compute output). `GL_STATIC_DRAW` signals one-time upload; using it for per-frame or per-patch data pessimizes driver buffer placement.
<!-- id: per-frame-budget --> Process GPU work in bounded per-frame batches (e.g. a max-dispatches / max-completions cap) rather than draining all pending work in one frame. Unbounded dispatch loops stall the CPU waiting for earlier dispatches and cause frame-time spikes. Bound is a tuning knob, not a magic constant. (Per.1)
<!-- id: priority-sort-before-dispatch --> Sort pending work by priority (distance to camera, screen-space error) before dispatching within the budget. Dispatching in insertion order wastes the frame budget on distant low-visibility patches while nearby visible gaps go unfilled.
<!-- id: barrier-not-finish --> Prefer `glMemoryBarrier` over `glFinish` for inter-dispatch synchronization. `glFinish` flushes the entire pipeline and stalls; `glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT)` signals only the required visibility guarantee and allows the GPU to continue other work.
<!-- id: noexcept-query --> Mark `const` query methods that cannot throw as `noexcept` (e.g. validity, count, and size-in-bytes accessors). This enables the compiler to omit exception-handling machinery at call sites in tight loops. (F.6)

**Why:** performance in GPU-coupled C++ code is dominated by three things — unnecessary memory traffic (shared_ptr, needless copy), CPU/GPU synchronization granularity (glFinish vs. barrier + fence), and work scheduling (unbounded vs. budgeted dispatch). Getting these right eliminates whole categories of frame-time spikes without profiling heroics. Source: C++ Core Guidelines (Per.1, Per.10, R.20, R.21, F.6, C.66).
