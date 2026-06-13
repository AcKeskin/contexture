---
applyTo: "**"
---

# linux rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/linux/` — do not hand-edit.

## ipc-and-signals

In a signal handler, call ONLY functions listed in the async-signal-safe set (man 7 signal-safety); malloc, printf, and most libc functions are NOT safe — they may hold internal locks that the signal interrupted, causing deadlock. (man 7 signal-safety, POSIX.1-2017 §2.4.3)

Handle signals in the main event loop, not inside handlers: write a byte to a self-pipe in the handler and poll/epoll the read end, or use signalfd(2) to receive signals as readable events; this keeps all logic outside the async-signal-safe constraint. (man 2 signalfd, man 7 signal-safety)

In multithreaded programs, use pthread_sigmask to block signals in worker threads and deliver them to exactly one designated thread (or via signalfd); signal delivery to an arbitrary thread is uncontrollable and races with thread-local state. (man 3 pthread_sigmask, POSIX.1-2017 §2.4.1)

With epoll in edge-triggered mode (EPOLLET), drain the fd completely (read/recv until EAGAIN/EWOULDBLOCK) on each event; a single partial read leaves data in the buffer and suppresses future notifications, causing silent stall. (man 7 epoll — "Edge-triggered and level-triggered")

Never busy-wait on a fd or condition; use epoll/poll/select or a condition variable; busy-waiting starves other threads, pins a CPU core, and masks the actual blocking event. (POSIX.1-2017 §2.8.5, man 7 epoll)

Prefer signalfd over sigaction in event-loop programs; signalfd integrates into a unified epoll watch set, removing the need for careful async-signal-safe bookkeeping entirely. (man 2 signalfd)

**Why:** Signal handlers execute in an interrupted execution context where most libc internals are unsafe to call. The self-pipe trick and signalfd are the POSIX-endorsed patterns for bridging asynchronous signal delivery into synchronous event-loop code. Multithreaded signal delivery has undefined target-thread semantics unless masked and routed explicitly. Source: Linux man-pages / POSIX.

## resources-and-fds

Close every file descriptor you open; leaked fds exhaust the per-process limit (RLIMIT_NOFILE) and block resource reclaim — pipes, sockets, and locks stay open until the process dies. (man 2 close, man 2 getrlimit)

Open with O_CLOEXEC (or set FD_CLOEXEC via fcntl) on every fd that must not survive exec; without it, fds are inherited by child processes, leaking credentials, sockets, and locks across exec boundaries. (man 2 open, POSIX.1-2008)

Check the return value of close() on write-critical fds (files, pipes, sockets); close() can fail with EIO or ENOSPC on NFS or disk-full paths, meaning buffered writes were silently lost. (man 2 close)

In C++, wrap raw fds in a RAII scope-guard or unique_ptr with a custom deleter; never hold a raw int fd across exception paths or complex branching — a missed close is a permanent leak for the process lifetime. (C++ Core Guidelines R.1)

After close(), the fd integer may be immediately reused by the kernel for a new open/socket/pipe; never touch an fd after close() and do not cache the integer across close boundaries. (man 2 close — NOTES, POSIX.1-2017 §2.14)

**Why:** File descriptors are a finite per-process kernel resource. A single leaked fd in a loop exhausts the table, causing EMFILE on subsequent opens. O_CLOEXEC is the safe default for exec-capable code; the POSIX gap between open() and fcntl() is a known race. close() returning an error is the only way the kernel reports deferred write failures on some filesystems. Source: Linux man-pages / POSIX.

## syscalls-and-errno

Check EVERY syscall return value — never discard -1 silently. A call that "usually works" fails under resource pressure, quota limits, or signal delivery. (man 2 intro)

Retry interruptible calls (read, write, accept, wait, etc.) on EINTR unless SA_RESTART is set on the signal handler; a single unretried EINTR silently short-circuits a blocking operation. (man 2 intro, man 7 signal)

errno is only valid immediately after a -1 return; save it into a local variable before any subsequent call (including fprintf, strerror_r, or anything that may call a syscall internally). (man 3 errno)

Use strerror_r (POSIX XSI variant) — not strerror — for error-to-string conversion; strerror is not thread-safe and uses a static buffer. (man 3 strerror)

Never ignore errno on partial reads/writes; check both the return value and errno together to distinguish EOF, error, and short I/O. (POSIX.1-2017 §2.3)

**Why:** Linux syscalls signal failure through -1 + errno, not exceptions. EINTR is delivered to any blocking syscall when a signal arrives and the handler lacks SA_RESTART; silently ignoring it produces intermittent, hard-to-reproduce data loss. errno validity is caller-frame-scoped: any subsequent libc call may reset it. Source: Linux man-pages / POSIX.
