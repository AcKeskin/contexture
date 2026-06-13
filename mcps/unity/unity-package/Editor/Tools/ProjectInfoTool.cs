using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Lightweight project introspection. Returns the same identity fields as the capability
    /// descriptor (project name, path, Unity version, render pipeline) without re-listing tools
    /// or scanning packages. Useful for "what am I connected to" sanity calls.
    /// </summary>
    [UnityMcpTool("project_info")]
    internal sealed class ProjectInfoTool : IUnityMcpTool
    {
        public string Name => "project_info";

        public string Description =>
            "Returns identity and environment of the connected Unity Editor: " +
            "projectName, projectPath, projectId, unityVersion, renderPipeline, platform, pid.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
            var projectName = Application.productName ?? "UnknownProject";

            var data = new JObject
            {
                ["projectName"] = projectName,
                ["projectPath"] = projectPath,
                ["projectId"] = CapabilityDescriptor.GetProjectId(),
                ["unityVersion"] = Application.unityVersion,
                ["renderPipeline"] = DetectRenderPipeline(),
                ["platform"] = EditorUserBuildSettings.activeBuildTarget.ToString(),
                ["pid"] = Process.GetCurrentProcess().Id,
                ["isPlaying"] = EditorApplication.isPlaying,
                ["isCompiling"] = EditorApplication.isCompiling,
            };

            return Task.FromResult(ToolResult.Json(data));
        }

        private static string DetectRenderPipeline()
        {
            var rp = GraphicsSettings.currentRenderPipeline;
            if (rp == null) return "Built-in";
            var typeName = rp.GetType().Name;
            if (typeName.Contains("Universal")) return "URP";
            if (typeName.Contains("HDRender") || typeName.Contains("HDRP")) return "HDRP";
            return typeName;
        }
    }
}
