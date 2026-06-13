---
name: resources-and-fds
description: Own and close every fd; open with O_CLOEXEC; check close() on critical data paths; RAII-wrap fds in C++.
type: user
kind: architectural-rule
scope: [linux, resources]
relevance: when-platform-linux
origin: shipped
---

<!-- id: close-every-fd --> Close every file descriptor you open; leaked fds exhaust the per-process limit (RLIMIT_NOFILE) and block resource reclaim — pipes, sockets, and locks stay open until the process dies. (man 2 close, man 2 getrlimit)

<!-- id: o-cloexec --> Open with O_CLOEXEC (or set FD_CLOEXEC via fcntl) on every fd that must not survive exec; without it, fds are inherited by child processes, leaking credentials, sockets, and locks across exec boundaries. (man 2 open, POSIX.1-2008)

<!-- id: check-close-return --> Check the return value of close() on write-critical fds (files, pipes, sockets); close() can fail with EIO or ENOSPC on NFS or disk-full paths, meaning buffered writes were silently lost. (man 2 close)

<!-- id: raii-fd --> In C++, wrap raw fds in a RAII scope-guard or unique_ptr with a custom deleter; never hold a raw int fd across exception paths or complex branching — a missed close is a permanent leak for the process lifetime. (C++ Core Guidelines R.1)

<!-- id: fd-reuse-race --> After close(), the fd integer may be immediately reused by the kernel for a new open/socket/pipe; never touch an fd after close() and do not cache the integer across close boundaries. (man 2 close — NOTES, POSIX.1-2017 §2.14)

**Why:** File descriptors are a finite per-process kernel resource. A single leaked fd in a loop exhausts the table, causing EMFILE on subsequent opens. O_CLOEXEC is the safe default for exec-capable code; the POSIX gap between open() and fcntl() is a known race. close() returning an error is the only way the kernel reports deferred write failures on some filesystems. Source: Linux man-pages / POSIX.
