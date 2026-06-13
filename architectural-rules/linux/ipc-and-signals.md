---
name: ipc-and-signals
description: Signal handlers call only async-signal-safe functions; use self-pipe or signalfd for main-loop integration; block signals in multithreaded code.
type: user
kind: architectural-rule
scope: [linux, ipc]
relevance: when-platform-linux
origin: shipped
---

<!-- id: async-signal-safe-only --> In a signal handler, call ONLY functions listed in the async-signal-safe set (man 7 signal-safety); malloc, printf, and most libc functions are NOT safe — they may hold internal locks that the signal interrupted, causing deadlock. (man 7 signal-safety, POSIX.1-2017 §2.4.3)

<!-- id: self-pipe-or-signalfd --> Handle signals in the main event loop, not inside handlers: write a byte to a self-pipe in the handler and poll/epoll the read end, or use signalfd(2) to receive signals as readable events; this keeps all logic outside the async-signal-safe constraint. (man 2 signalfd, man 7 signal-safety)

<!-- id: pthread-sigmask --> In multithreaded programs, use pthread_sigmask to block signals in worker threads and deliver them to exactly one designated thread (or via signalfd); signal delivery to an arbitrary thread is uncontrollable and races with thread-local state. (man 3 pthread_sigmask, POSIX.1-2017 §2.4.1)

<!-- id: epoll-edge-triggered-drain --> With epoll in edge-triggered mode (EPOLLET), drain the fd completely (read/recv until EAGAIN/EWOULDBLOCK) on each event; a single partial read leaves data in the buffer and suppresses future notifications, causing silent stall. (man 7 epoll — "Edge-triggered and level-triggered")

<!-- id: no-busy-wait --> Never busy-wait on a fd or condition; use epoll/poll/select or a condition variable; busy-waiting starves other threads, pins a CPU core, and masks the actual blocking event. (POSIX.1-2017 §2.8.5, man 7 epoll)

<!-- id: signalfd-over-sigaction-in-loops --> Prefer signalfd over sigaction in event-loop programs; signalfd integrates into a unified epoll watch set, removing the need for careful async-signal-safe bookkeeping entirely. (man 2 signalfd)

**Why:** Signal handlers execute in an interrupted execution context where most libc internals are unsafe to call. The self-pipe trick and signalfd are the POSIX-endorsed patterns for bridging asynchronous signal delivery into synchronous event-loop code. Multithreaded signal delivery has undefined target-thread semantics unless masked and routed explicitly. Source: Linux man-pages / POSIX.
