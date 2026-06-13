using System.Threading;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Per-invocation context. v1 carries the wire correlation ID and a cancellation token.
    /// v2/v3 will add auth tier and audit hooks here without changing the tool contract.
    /// Public for custom-tool authors.
    /// </summary>
    public sealed class ToolContext
    {
        public string CorrelationId { get; }
        public CancellationToken Cancellation { get; }

        public ToolContext(string correlationId, CancellationToken cancellation)
        {
            CorrelationId = correlationId;
            Cancellation = cancellation;
        }
    }
}
