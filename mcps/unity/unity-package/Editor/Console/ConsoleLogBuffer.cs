using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Console
{
    /// <summary>
    /// Bounded ring buffer of Unity log events captured via Application.logMessageReceivedThreaded.
    /// v1 captures runtime + editor log calls (anything routed through Debug/UnityEngine logger);
    /// it does NOT capture console-window-only entries that Unity stores via UnityEditor.LogEntries
    /// (compile errors, package manager messages, etc.). v2 may add a LogEntries reflection path
    /// for parity with the Editor console window.
    /// </summary>
    internal static class ConsoleLogBuffer
    {
        private const int Capacity = 1000;

        private static readonly object _lock = new object();
        private static readonly Entry[] _ring = new Entry[Capacity];
        private static int _head; // next write index
        private static int _count;
        private static bool _initialized;

        public static void Initialize()
        {
            if (_initialized) return;
            _initialized = true;
            Application.logMessageReceivedThreaded += OnLogMessage;
        }

        public static void Shutdown()
        {
            if (!_initialized) return;
            _initialized = false;
            Application.logMessageReceivedThreaded -= OnLogMessage;
            lock (_lock)
            {
                Array.Clear(_ring, 0, _ring.Length);
                _head = 0;
                _count = 0;
            }
        }

        public static void Clear()
        {
            lock (_lock)
            {
                Array.Clear(_ring, 0, _ring.Length);
                _head = 0;
                _count = 0;
            }
        }

        /// <summary>Returns up to <paramref name="max"/> most-recent entries in chronological order.</summary>
        public static List<Entry> Snapshot(int max)
        {
            if (max <= 0) return new List<Entry>(0);
            lock (_lock)
            {
                int take = Math.Min(max, _count);
                var result = new List<Entry>(take);
                int start = (_head - _count + Capacity) % Capacity;
                int skip = _count - take;
                for (int i = 0; i < take; i++)
                {
                    int idx = (start + skip + i) % Capacity;
                    result.Add(_ring[idx]);
                }
                return result;
            }
        }

        private static void OnLogMessage(string condition, string stackTrace, LogType type)
        {
            var entry = new Entry(DateTime.UtcNow, type, condition ?? string.Empty, stackTrace ?? string.Empty);
            lock (_lock)
            {
                _ring[_head] = entry;
                _head = (_head + 1) % Capacity;
                if (_count < Capacity) _count++;
            }
        }

        internal readonly struct Entry
        {
            public readonly DateTime TimestampUtc;
            public readonly LogType Type;
            public readonly string Message;
            public readonly string StackTrace;

            public Entry(DateTime timestampUtc, LogType type, string message, string stackTrace)
            {
                TimestampUtc = timestampUtc;
                Type = type;
                Message = message;
                StackTrace = stackTrace;
            }
        }
    }
}
