---
applyTo: "**/*.{cpp,cc,cxx,h,hpp,hxx}"
---

# cpp rules

> Auto-loaded by Copilot when editing files matching `**/*.{cpp,cc,cxx,h,hpp,hxx}`. Generated from `architectural-rules/cpp/` — do not hand-edit.

## C++ concurrency

Use RAII lock guards (`std::lock_guard`, `std::scoped_lock`, `std::unique_lock`) — never bare `mutex.lock()` / `unlock()`. A manual unlock is skipped on every early return and every throw. (CP.20)
Acquire multiple locks with `std::scoped_lock` (or `std::lock`) in one statement — it orders acquisition to avoid deadlock. Never hand-order two `lock_guard`s. (CP.21)
Never call unknown / user-supplied code while holding a lock — it may re-enter and deadlock, or block far longer than intended. (CP.22)
Use `std::atomic` for cross-thread flags and counters. `volatile` is not a synchronization primitive — it has no memory-ordering guarantees. (CP.8)
Do not write lock-free code unless you must and have measured the need. Assume your lock-free code is wrong until proven otherwise with tooling. (CP.100)
Minimize sharing of writable data. The cheapest concurrency bug is the one that can't happen because nothing is shared. (CP.3)

**Why:** concurrency bugs are non-deterministic and survive code review and most tests — RAII locking and atomics remove whole classes of them by construction. Source: C++ Core Guidelines (CP).

## C++ const-correctness

Declare objects `const` unless the value must change. Immutable-by-default makes the few mutable things visible and lets the compiler enforce the rest. (Con.1)
Make member functions `const` when they don't modify observable state. A non-`const` method is a claim that it mutates — don't make that claim falsely. (Con.2)
Pass non-trivial types by `const&` (or `const*`) when you only read them — no copy, no mutation. Pass by value only for cheap-to-copy types or when you need an owned copy anyway. (Con.3)
Use `constexpr` for values computable at compile time — they cost nothing at runtime and can be used in constant contexts (array sizes, template args). (Con.5)

**Why:** const-correctness is contract documentation the compiler checks — it propagates through call sites and catches accidental mutation at compile time, for free. Source: C++ Core Guidelines (Con).

## C++ error paths

- Every error path is explicit and visible in the code. No silent `catch (...)` that swallows.
- Choose one strategy per project: exceptions, error codes, `std::expected`, or a dedicated `Result` type. Do not mix without a deliberate reason (e.g. C-API boundary).
- Destructors do not throw.
- `noexcept` on move constructors / move assignment where achievable — standard library containers depend on it.

**Why:** silent failures in C++ become corrupted state. Explicit errors are the minimum insurance against that.

## C++ GPU interop

Every GPU object (SSBO, shader program, framebuffer, texture, GL sync) must be owned by a RAII wrapper whose destructor calls the matching delete function (`glDeleteBuffers`, `glDeleteProgram`, `glDeleteFramebuffers`, `glDeleteTextures`). Never hold a raw `GLuint` handle in application code without a wrapping owner. (R.1)
GPU buffer wrappers must be move-only (copy deleted, move `noexcept`). A copy would alias the GL buffer name, causing the second destructor to delete a buffer still in use by the GPU. The canonical pattern for a move-only GPU buffer wrapper: delete copy, define move-ctor/assign, zero-out source handle after transfer.
Host↔GPU data transfer must go through typed `Upload(const std::vector<T>&)` / `Download(std::vector<T>&)` methods, never via raw `glBufferData` at call sites. The typed wrapper enforces element size (`sizeof(T)`) at one point and prevents count/byte confusion across call sites.
Insert an explicit memory barrier (`glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT)`) — or `cudaDeviceSynchronize()` on CUDA paths — before any host readback or dependent dispatch that reads results written by a prior compute dispatch. Absence of a barrier is undefined behavior: the GPU may not have flushed writes yet. Encapsulate this in a wait-for-completion method and call it between dependent dispatches.
Poll a fence object (e.g. via `glClientWaitSync`) to check completion instead of `glFinish`. `glFinish` stalls the CPU until the entire GPU pipeline drains; a fence signals only when the specific set of commands preceding it completes, enabling pipelining across frames.
Do not pass raw host pointers or device pointers across a compute dispatch boundary. The GPU operates asynchronously; the host buffer may have been moved, resized, or freed by the time the shader reads it. All input/output data must reside in a GPU buffer (a typed GPU buffer wrapper, texture, or UBO) allocated before the dispatch and not touched by the host until the fence signals. Dispatch methods should accept a GPU buffer reference, not a raw pointer.
Capture GPU object creation parameters in a descriptor struct (e.g. a texture descriptor, a framebuffer descriptor) passed to the constructor. This enables recreation on resize without scattering creation logic, and makes the intended format/usage explicit at the type level.
Expose GPU objects through an abstract interface (e.g. texture, framebuffer, shader, compute-shader interfaces) with a static factory. Concrete OpenGL/Vulkan/CUDA types are implementation details hidden from callers.

**Why:** GPU APIs are C-level interfaces that return integer names or opaque pointers with no reference counting. Without RAII wrappers, leak and double-delete bugs appear only at teardown or on error paths. Barriers and fences are the correctness contract for async compute — missing one is a race condition the driver does not diagnose. Source: C++ Core Guidelines (R.1).

## C++ headers

- Headers minimal. Include what you use; no transitive-include reliance.
- Forward declare where possible. Full include only when the type's size or members are needed.
- `.h` owns the contract (declarations, public interface).
- `.cpp` owns implementation.
- No logic in headers unless trivial inline accessors or `constexpr`. Templates are the exception — implementation must live in the header, keep it self-contained.

**Why:** header bloat is the dominant cost of C++ build times. Each unnecessary include is paid by every TU that transitively pulls it in.

## C++ interfaces and ABI

Public entry points that cross a binary boundary must be `extern "C"` with an explicit calling-convention macro (e.g. `XRAPI_CALL`, an exported-symbol macro). C++ name mangling and calling conventions are not stable across compilers or versions.
Expose only opaque integer or pointer-sized handles across the ABI. Never expose C++ object pointers or references directly — the other side cannot destruct them. Internal mapping lives in a dispatch table or registry hidden from the caller.
Do not pass `std::string`, `std::vector`, or any STL type across an `extern "C"` or DLL boundary. Their layout and allocator are CRT-version-specific; use `const char*`, `T*`+`count`, or the C-style two-call pattern (`capacityInput`, `countOutput`, `elements`). (I.4)
Implement runtime polymorphism across a binary boundary as a flat struct of function pointers, not as a vtable. A vtable layout is ABI-private to the compiler; a plain C struct of `PFN_` typedefs is stable.
Use static factory methods as the public creation point for objects that manage binary-loaded resources. The factory validates, negotiates the protocol (e.g. an interface-negotiation handshake), and owns the resulting `unique_ptr`.
Classes that wrap a binary-loaded library handle (e.g. a type owning a platform library handle) must delete copy and copy-assign. Copying the handle aliases the library reference count and causes a double-close on teardown. (C.81)
Keep internal state (dispatch-table maps, supported-extension sets, and similar) in private members or a separate implementation type, never in the public header that ships with the SDK. Changes to internal members break binary compatibility for any translation unit that includes the header.
Wrap platform-specific handle types behind a single typedef per platform (e.g. a library-handle typedef resolving to `HMODULE` on Windows, `void*` on POSIX). All code above the abstraction layer uses only the typedef, never the platform type directly.

**Why:** C++ ABI is not stable — vtable layouts, name mangling, STL internals, and calling conventions all vary by compiler and CRT version. A stable C ABI boundary (opaque handles + function-pointer dispatch tables + `extern "C"` exports) lets the loader, layers, and runtime be built independently and upgraded without recompilation. Source: C++ Core Guidelines (I.4, C.81).

## Modern C++ and RAII

- Target C++17 or newer unless the project explicitly constrains to older.
- RAII mandatory. Every resource (memory, file handle, lock, socket, GPU resource) is owned by an object whose destructor releases it.
- No manual `new` / `delete` pairs at call sites. If you write `new`, wrap it in a smart pointer or RAII type immediately.
- No raw `malloc` / `free` in application code.

**Why:** resource leaks in C++ are the dominant source of bugs, and they are entirely preventable by construction.

## C++ move semantics

Prefer the Rule of Zero: compose resource ownership through RAII members (`unique_ptr`, a move-only buffer wrapper, etc.) so the compiler generates all five special members correctly. Write Rule-of-Five only when the class directly owns a raw OS or GPU handle. (C.20)
When you write any of destructor, copy-ctor, copy-assign, move-ctor, move-assign, define or `= delete` all five. A destructor alone suppresses generated move. (C.21)
Delete copy for types that own a unique GPU or OS handle — copy would alias the handle and cause double-free. (C.81)
Mark move constructor and move-assignment `noexcept`. STL containers call the move path only when `noexcept`; without it, `std::vector` of a handle-owning type copies instead of moves. (C.66)
In the move constructor/assignment, null-out the source handle immediately after transferring it. The source destructor must be a no-op on the zeroed state (`other.handle = 0;`).
In move-assignment, guard against `this == &other` before releasing the current resource — otherwise you destroy the handle before reading it from `other`.
Pass sink parameters by value and `std::move` into storage (forwarding pattern). Pass read-only parameters by const-ref. Never copy a resource-owning type where a move or reference suffices. (F.15, F.18)
`shared_ptr` is not a default for GPU/OS resource ownership — it pays reference-count overhead and hides the ownership graph. Use `unique_ptr` or a move-only RAII wrapper when exactly one owner exists; reserve `shared_ptr` for genuinely shared lifetimes. (R.20, R.21)

**Why:** moving handle types (`GLuint`, `HMODULE`, fds) instead of copying prevents double-free and alias bugs that appear only under destruction order. `noexcept` on moves is load-bearing for STL container reallocation. Source: C++ Core Guidelines (C.20, C.21, C.66, C.81, F.15, F.18, R.20, R.21).

## C++ ownership semantics

- `std::unique_ptr` is the default for heap-owned resources. Single owner, move semantics.
- `std::shared_ptr` only when ownership is genuinely shared and lifetime cannot be expressed with a single owner. Every `shared_ptr` is a design claim — justify it.
- Raw pointers only as non-owning views or short-lived parameters. Never for ownership.
- No hidden globals or singletons without a strong, documented reason. Prefer dependency injection.

**Why:** ownership confusion is the second-largest source of C++ bugs after lifetimes. Make it impossible to get wrong.

## C++ performance

Mark move constructors and move-assignment `noexcept`. `std::vector` and other containers use the move path during reallocation only when the move is `noexcept`; without it they fall back to copy, which for GPU buffer types means double allocation or a deleted-function compile error. This is both a correctness and a performance rule. (Per.10, C.66)
Do not default to `shared_ptr` for GPU resources that have a single clear owner. `shared_ptr` adds atomic reference-count increments on every copy — including passing to functions — and hides the ownership graph. Use `unique_ptr` or a move-only RAII wrapper when there is one owner; reserve `shared_ptr` for genuinely shared lifetimes (e.g. a texture referenced by multiple render passes). (R.20, R.21)
Use `GL_DYNAMIC_COPY` for SSBOs written from the CPU and read by the GPU (compute input) or written by the GPU and read by the CPU (compute output). `GL_STATIC_DRAW` signals one-time upload; using it for per-frame or per-patch data pessimizes driver buffer placement.
Process GPU work in bounded per-frame batches (e.g. a max-dispatches / max-completions cap) rather than draining all pending work in one frame. Unbounded dispatch loops stall the CPU waiting for earlier dispatches and cause frame-time spikes. Bound is a tuning knob, not a magic constant. (Per.1)
Sort pending work by priority (distance to camera, screen-space error) before dispatching within the budget. Dispatching in insertion order wastes the frame budget on distant low-visibility patches while nearby visible gaps go unfilled.
Prefer `glMemoryBarrier` over `glFinish` for inter-dispatch synchronization. `glFinish` flushes the entire pipeline and stalls; `glMemoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT)` signals only the required visibility guarantee and allows the GPU to continue other work.
Mark `const` query methods that cannot throw as `noexcept` (e.g. validity, count, and size-in-bytes accessors). This enables the compiler to omit exception-handling machinery at call sites in tight loops. (F.6)

**Why:** performance in GPU-coupled C++ code is dominated by three things — unnecessary memory traffic (shared_ptr, needless copy), CPU/GPU synchronization granularity (glFinish vs. barrier + fence), and work scheduling (unbounded vs. budgeted dispatch). Getting these right eliminates whole categories of frame-time spikes without profiling heroics. Source: C++ Core Guidelines (Per.1, Per.10, R.20, R.21, F.6, C.66).

## C++ templates and generics

Constrain every template parameter with a concept (C++20). Prefer the standard concepts (`std::integral`, `std::ranges::range`) before writing your own. (T.10)
A concept must express meaningful semantics, not just a syntactic shape. A naked `typename`-only constraint isn't a concept — it's an unconstrained template wearing a name. (T.20)
Use SFINAE / `enable_if` only when concepts genuinely can't express the constraint. Concepts give readable errors; SFINAE gives a wall of substitution failures. (T.13x)
Do not specialize function templates — overload instead. Function-template specialization interacts surprisingly with overload resolution. (T.144)
Template definitions live in the header (or an included `.tpp`/`.ipp`), not a `.cpp` — the definition must be visible at every instantiation point. Keep it self-contained.

**Why:** concepts turn template misuse into a one-line readable error at the call site instead of a screen of instantiation noise — they are the single biggest readability win in modern generic C++. Source: C++ Core Guidelines (T).
