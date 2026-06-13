using System;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Tool-side exception that surfaces a structured error envelope to the caller.
    /// Tools throw this to specify both the error <c>code</c> (matches
    /// envelope ErrorCodeSchema on the TS side) and an optional <c>details</c> payload
    /// the agent can branch on programmatically. Plain System.ArgumentException continues
    /// to map to InvalidInput without details. Public for custom-tool authors.
    /// </summary>
    public sealed class ToolException : Exception
    {
        public string Code { get; }
        public JObject Details { get; }

        public ToolException(string code, string message, JObject details = null)
            : base(message)
        {
            if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("code required", nameof(code));
            Code = code;
            Details = details;
        }
    }
}
