using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Bridge
{
    /// <summary>
    /// Marshals work from background threads onto Unity's main thread.
    /// Editor APIs are not thread-safe; HTTP listener runs on the .NET thread pool.
    /// </summary>
    internal static class MainThreadDispatcher
    {
        private static readonly ConcurrentQueue<WorkItem> _queue = new ConcurrentQueue<WorkItem>();
        private static bool _initialized;

        public static void Initialize()
        {
            if (_initialized) return;
            _initialized = true;
            EditorApplication.update += Drain;
        }

        public static void Shutdown()
        {
            if (!_initialized) return;
            _initialized = false;
            EditorApplication.update -= Drain;

            // Fault any work items still pending so awaiters don't hang forever.
            while (_queue.TryDequeue(out var item))
            {
                item.Tcs.TrySetException(new InvalidOperationException("Dispatcher shut down before work item ran."));
            }
        }

        public static Task<object> EnqueueAsync(Func<Task<object>> work)
        {
            if (work == null) throw new ArgumentNullException(nameof(work));
            var tcs = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
            _queue.Enqueue(new WorkItem(work, tcs));
            return tcs.Task;
        }

        private static async void Drain()
        {
            while (_queue.TryDequeue(out var item))
            {
                try
                {
                    var result = await item.Work().ConfigureAwait(true);
                    item.Tcs.TrySetResult(result);
                }
                catch (Exception ex)
                {
                    item.Tcs.TrySetException(ex);
                }
            }
        }

        private readonly struct WorkItem
        {
            public readonly Func<Task<object>> Work;
            public readonly TaskCompletionSource<object> Tcs;

            public WorkItem(Func<Task<object>> work, TaskCompletionSource<object> tcs)
            {
                Work = work;
                Tcs = tcs;
            }
        }
    }
}
