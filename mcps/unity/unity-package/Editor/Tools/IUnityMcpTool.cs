using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Contract every Unity MCP tool implements. Discovered via reflection over the
    /// package's Editor assembly using <see cref="UnityMcpToolAttribute"/>. Public so
    /// project-local custom tools can implement it when
    /// <c>unityMcp.customToolsEnabled</c> is set in package.json.
    /// </summary>
    public interface IUnityMcpTool
    {
        string Name { get; }
        string Description { get; }
        JObject InputSchema { get; }
        Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx);
    }
}
