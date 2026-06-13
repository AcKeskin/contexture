using System;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Tool return shape. Either application/json (Data is JToken) or image/png (Data is byte[]).
    /// HttpHost serializes both into the wire envelope. Public for custom-tool authors.
    /// </summary>
    public sealed class ToolResult
    {
        public string ContentType { get; }
        public object Data { get; }

        private ToolResult(string contentType, object data)
        {
            ContentType = contentType;
            Data = data;
        }

        public static ToolResult Json(JToken data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            return new ToolResult("application/json", data);
        }

        public static ToolResult JsonNull()
        {
            return new ToolResult("application/json", JValue.CreateNull());
        }

        public static ToolResult Png(byte[] bytes)
        {
            if (bytes == null) throw new ArgumentNullException(nameof(bytes));
            return new ToolResult("image/png", bytes);
        }
    }
}
