---
name: syscalls-and-errno
description: Check every syscall return; retry EINTR on interruptible calls; save errno before other calls; use strerror_r.
type: user
kind: architectural-rule
scope: [linux, syscalls]
relevance: when-platform-linux
origin: shipped
---

<!-- id: check-every-return --> Check EVERY syscall return value — never discard -1 silently. A call that "usually works" fails under resource pressure, quota limits, or signal delivery. (man 2 intro)

<!-- id: eintr-retry --> Retry interruptible calls (read, write, accept, wait, etc.) on EINTR unless SA_RESTART is set on the signal handler; a single unretried EINTR silently short-circuits a blocking operation. (man 2 intro, man 7 signal)

<!-- id: errno-validity --> errno is only valid immediately after a -1 return; save it into a local variable before any subsequent call (including fprintf, strerror_r, or anything that may call a syscall internally). (man 3 errno)

<!-- id: strerror-r --> Use strerror_r (POSIX XSI variant) — not strerror — for error-to-string conversion; strerror is not thread-safe and uses a static buffer. (man 3 strerror)

<!-- id: never-ignore-errno --> Never ignore errno on partial reads/writes; check both the return value and errno together to distinguish EOF, error, and short I/O. (POSIX.1-2017 §2.3)

**Why:** Linux syscalls signal failure through -1 + errno, not exceptions. EINTR is delivered to any blocking syscall when a signal arrives and the handler lacks SA_RESTART; silently ignoring it produces intermittent, hard-to-reproduce data loss. errno validity is caller-frame-scoped: any subsequent libc call may reset it. Source: Linux man-pages / POSIX.
