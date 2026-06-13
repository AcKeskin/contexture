---
name: C++ interfaces and ABI
description: Stable C-ABI exports via extern "C" + calling-convention macros, opaque handles, no STL across the boundary, dispatch tables as function-pointer structs, PIMPL/factory for binary compat.
type: user
kind: architectural-rule
scope: [cpp, abi, interfaces]
relevance: when-language-cpp
origin: shipped
---

<!-- id: c-abi-boundary --> Public entry points that cross a binary boundary must be `extern "C"` with an explicit calling-convention macro (e.g. `XRAPI_CALL`, an exported-symbol macro). C++ name mangling and calling conventions are not stable across compilers or versions.
<!-- id: opaque-handles --> Expose only opaque integer or pointer-sized handles across the ABI. Never expose C++ object pointers or references directly — the other side cannot destruct them. Internal mapping lives in a dispatch table or registry hidden from the caller.
<!-- id: no-stl-across-boundary --> Do not pass `std::string`, `std::vector`, or any STL type across an `extern "C"` or DLL boundary. Their layout and allocator are CRT-version-specific; use `const char*`, `T*`+`count`, or the C-style two-call pattern (`capacityInput`, `countOutput`, `elements`). (I.4)
<!-- id: dispatch-table --> Implement runtime polymorphism across a binary boundary as a flat struct of function pointers, not as a vtable. A vtable layout is ABI-private to the compiler; a plain C struct of `PFN_` typedefs is stable.
<!-- id: factory-not-ctor --> Use static factory methods as the public creation point for objects that manage binary-loaded resources. The factory validates, negotiates the protocol (e.g. an interface-negotiation handshake), and owns the resulting `unique_ptr`.
<!-- id: non-copyable-singleton-resource --> Classes that wrap a binary-loaded library handle (e.g. a type owning a platform library handle) must delete copy and copy-assign. Copying the handle aliases the library reference count and causes a double-close on teardown. (C.81)
<!-- id: pimpl-internal --> Keep internal state (dispatch-table maps, supported-extension sets, and similar) in private members or a separate implementation type, never in the public header that ships with the SDK. Changes to internal members break binary compatibility for any translation unit that includes the header.
<!-- id: platform-typedef-abstraction --> Wrap platform-specific handle types behind a single typedef per platform (e.g. a library-handle typedef resolving to `HMODULE` on Windows, `void*` on POSIX). All code above the abstraction layer uses only the typedef, never the platform type directly.

**Why:** C++ ABI is not stable — vtable layouts, name mangling, STL internals, and calling conventions all vary by compiler and CRT version. A stable C ABI boundary (opaque handles + function-pointer dispatch tables + `extern "C"` exports) lets the loader, layers, and runtime be built independently and upgraded without recompilation. Source: C++ Core Guidelines (I.4, C.81).
