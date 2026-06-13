using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor.Capabilities
{
    /// <summary>
    /// Builds the v1 capability descriptor (schemaVersion: 1) from live editor state.
    /// MUST run on the main thread — touches Application, EditorUserBuildSettings, GraphicsSettings,
    /// and the package manager registry.
    /// </summary>
    internal static class CapabilityDescriptor
    {
        public static JObject Build(int port)
        {
            var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
            var projectName = Application.productName ?? "UnknownProject";
            var projectId = $"{Sanitize(projectName)}@{ShortHash(projectPath)}";
            var renderPipeline = DetectRenderPipeline();

            var caps = CapabilityDetector.Detect();

            var tools = new JArray(
                ToolRegistry.AllSatisfying(caps).Select(e => new JObject
                {
                    ["name"] = e.Tool.Name,
                    ["description"] = e.Tool.Description ?? string.Empty,
                    ["inputSchema"] = e.Tool.InputSchema ?? new JObject { ["type"] = "object", ["properties"] = new JObject() },
                    ["isBuiltIn"] = e.IsBuiltIn,
                }));

            return new JObject
            {
                ["schemaVersion"] = 1,
                ["unityVersion"] = Application.unityVersion,
                ["projectId"] = projectId,
                ["projectName"] = projectName,
                ["projectPath"] = projectPath,
                ["renderPipeline"] = renderPipeline,
                ["platform"] = EditorUserBuildSettings.activeBuildTarget.ToString(),
                ["port"] = port,
                ["pid"] = Process.GetCurrentProcess().Id,
                ["xri"] = BuildXriField(caps),
                ["mrtk"] = BuildMrtkField(caps),
                ["packages"] = BuildPackageStrings(caps),
                ["capabilities"] = new JArray(caps.ToWireStrings()),
                ["tools"] = tools,
            };
        }

        public static string GetProjectId()
        {
            var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
            var projectName = Application.productName ?? "UnknownProject";
            return $"{Sanitize(projectName)}@{ShortHash(projectPath)}";
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

        private static JToken BuildXriField(CapabilitySet caps)
        {
            if (!caps.Has(CapabilityKey.Xri)) return JValue.CreateNull();
            var subs = new JArray();
            if (caps.Has(CapabilityKey.XriHands)) subs.Add("xri.hands");
            if (caps.Has(CapabilityKey.XriEyeGaze)) subs.Add("xri.eyeGaze");
            return new JObject
            {
                ["installed"] = true,
                ["version"] = caps.XriVersion ?? string.Empty,
                ["subsystems"] = subs,
            };
        }

        private static JToken BuildMrtkField(CapabilitySet caps)
        {
            if (!caps.Has(CapabilityKey.Mrtk)) return JValue.CreateNull();
            return new JObject
            {
                ["installed"] = true,
                ["version"] = caps.MrtkVersion ?? string.Empty,
            };
        }

        private static JArray BuildPackageStrings(CapabilitySet caps)
        {
            var list = new JArray();
            foreach (var s in caps.PackageStrings) list.Add(s);
            return list;
        }

        private static string Sanitize(string s)
        {
            if (string.IsNullOrEmpty(s)) return "Project";
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                if (char.IsLetterOrDigit(c) || c == '-' || c == '_') sb.Append(c);
            }
            var result = sb.ToString();
            return string.IsNullOrEmpty(result) ? "Project" : result;
        }

        private static string ShortHash(string input)
        {
            using (var sha = SHA1.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input ?? string.Empty));
                var sb = new StringBuilder(6);
                for (int i = 0; i < 3; i++) sb.Append(bytes[i].ToString("x2"));
                return sb.ToString();
            }
        }
    }
}
