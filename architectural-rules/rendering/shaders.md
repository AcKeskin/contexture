---
name: Shader and Uniform Interface Discipline
description: Named/constant binding indices, std140/std430/HLSL cbuffer packing rules, and CPU-GPU struct layout matching.
type: user
kind: architectural-rule
scope: [rendering, shaders]
relevance: when-domain-rendering
origin: shipped
---

<!-- id: no-magic-binding-indices --> Never hardcode raw integer binding/location/set numbers at call sites; assign them via named constants, reflection, or an enum/namespace shared between CPU and GPU code. Unexplained integer literals break on API version changes and make binding collisions undetectable at compile time. (GLSL layout qualifiers; HLSL register keyword; Vulkan descriptor set/binding model)

<!-- id: std140-alignment --> In GLSL uniform blocks declared with `layout(std140)`: scalars align to 4 B, vec2 to 8 B, vec3/vec4 to 16 B, arrays and structs pad members to 16 B base alignment. Match every CPU-side struct to these rules exactly, or use `offsetof` assertions. One misaligned field silently corrupts all subsequent uniforms. (GLSL 4.60 spec §7.6.2.2 "Standard Uniform Block Layout")

<!-- id: std430-for-ssbos --> Prefer `layout(std430)` for shader storage buffer objects (SSBOs); it eliminates the vec3/array base-16 rounding of std140, enabling tighter CPU-side struct packing. Do not use std430 for plain uniform blocks — it is not allowed there by the GLSL spec. (GLSL 4.60 spec §7.6.2.2; GLSL ARB_shader_storage_buffer_object)

<!-- id: hlsl-cbuffer-packing --> In HLSL, cbuffer members pack into 16-byte rows; a member that would straddle a 16-byte boundary is silently moved to the next row, leaving padding. Mirror the packing rules on the CPU side using `packoffset` annotations or explicit padding fields; never assume the C struct layout matches. (HLSL Language Spec §13.6 "Packing Rules for Constant Variables"; D3D11/D3D12 constant buffer layout)

<!-- id: push-constants-for-hot-data --> Place per-draw data that changes every draw call (model matrix, draw ID, material index) in push constants (Vulkan) or root constants (D3D12) rather than uniform/constant buffers; this eliminates the buffer update + barrier overhead for the most frequent path. Keep total size within the guaranteed minimum (128 bytes for Vulkan). (Vulkan spec §14.7 "Push Constant Updates"; Vulkan GPU best practices)

<!-- id: descriptor-set-frequency --> Partition descriptor sets by update frequency: set 0 = per-frame globals (camera, lights), set 1 = per-pass, set 2 = per-material, set 3 = per-draw. Bind lower-frequency sets less often and avoid rebinding them per draw. (Vulkan descriptor set design best practice; Khronos Vulkan samples)

<!-- id: shader-interface-matching --> Vertex shader outputs and fragment shader inputs must match by name and type (GLSL) or by semantic (HLSL); mismatches produce either a link error or silently zero-initialized inputs depending on driver. Validate with SPIR-V cross-compilation or shader reflection rather than relying on driver leniency. (GLSL 4.60 spec §4.3.4 "Input Variables"; SPIR-V spec §2.16 "Validation Rules")

<!-- id: specialization-over-ubershader-branches --> Prefer Vulkan specialization constants or compile-time #define variants over dynamic uniform booleans driving large if/else trees inside shaders; the GPU executes both branches of a divergent uniform-driven branch on many architectures, wasting ALU. (Vulkan spec §10.7 "Specialization Constants"; NVIDIA GPU Best Practices Guide)

**Why:** CPU-GPU interface bugs (alignment, binding collisions, packing) are silent, often surface only on specific drivers or hardware, and cause corrupted visuals or GPU faults that are difficult to correlate to the source struct. Named bindings and explicit layout annotations make mismatches detectable at compile or link time. Source: GLSL 4.60 core spec §7.6; HLSL Language Specification §13; Khronos Vulkan descriptor set best practices.
