using System;
using System.Diagnostics;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Discovery
{
    /// <summary>
    /// Writes/deletes ~/.claude/unity-mcp/instances/&lt;projectId&gt;.json so the MCP server
    /// can discover a live Unity Editor's port + PID. Schema is forward-compatible with v2 multi-instance.
    /// </summary>
    internal static class RegistryWriter
    {
        private static string _filePath;

        public static string FilePath => _filePath;

        public static void Write(int port)
        {
            try
            {
                var dir = GetRegistryDir();
                Directory.CreateDirectory(dir);

                var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
                var projectName = Application.productName ?? "UnknownProject";
                var projectId = CapabilityDescriptor.GetProjectId();

                var entry = new JObject
                {
                    ["projectId"] = projectId,
                    ["projectPath"] = projectPath,
                    ["projectName"] = projectName,
                    ["unityVersion"] = Application.unityVersion,
                    ["port"] = port,
                    ["pid"] = Process.GetCurrentProcess().Id,
                    ["startedAt"] = DateTime.UtcNow.ToString("o"),
                };

                _filePath = Path.Combine(dir, projectId + ".json");
                File.WriteAllText(_filePath, entry.ToString(Newtonsoft.Json.Formatting.Indented));
                UnityEngine.Debug.Log($"[UnityMCP] registry entry written: {_filePath}");
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError($"[UnityMCP] failed to write registry entry: {ex.Message}");
            }
        }

        public static void Delete()
        {
            try
            {
                if (!string.IsNullOrEmpty(_filePath) && File.Exists(_filePath))
                {
                    File.Delete(_filePath);
                    UnityEngine.Debug.Log($"[UnityMCP] registry entry deleted: {_filePath}");
                }
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogWarning($"[UnityMCP] failed to delete registry entry: {ex.Message}");
            }
            finally
            {
                _filePath = null;
            }
        }

        private static string GetRegistryDir()
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return Path.Combine(home, ".claude", "unity-mcp", "instances");
        }
    }
}
