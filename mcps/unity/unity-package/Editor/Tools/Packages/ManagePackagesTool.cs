using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace UnityMcp.Editor.Tools.Packages
{
    /// <summary>
    /// Unity Package Manager (UPM) operations: list / search / install / remove /
    /// info. All operations route through <see cref="Client"/>, which is async
    /// (returns a Request object). The tool blocks on the Request with a
    /// configurable timeout (default 60 s) before returning.
    ///
    /// Reads (list / search / info) are safe to run on every smoke invocation.
    /// Writes (install / remove) mutate the project's manifest.json — they're
    /// behind an opt-in flag in smoke and warrant explicit caller intent. The
    /// tool surface itself is uniform (no separate read/write tools); the
    /// `action` parameter discriminates.
    /// </summary>
    [UnityMcpTool("manage_packages")]
    internal sealed class ManagePackagesTool : IUnityMcpTool
    {
        private const int DefaultTimeoutMs = 60_000;

        public string Name => "manage_packages";

        public string Description =>
            "Unity Package Manager operations. action=list|search|install|remove|info. " +
            "list: returns installed packages [{name, version, source, displayName, " +
            "resolvedPath}]. Optional 'offline' (default true) skips registry hits. " +
            "search: query the registry by name; returns [{name, version, displayName, " +
            "description}]. Required 'query'. install: add a package; required 'name', " +
            "optional 'version' (or use full URL/path in 'name' for git/file/local). " +
            "remove: uninstall by name; refuses if other installed packages declare a " +
            "dependency on it (override with 'force:true'). info: detailed info for one " +
            "installed package; required 'name'. Optional 'timeoutMs' across all actions " +
            "(default 60000). Writes (install/remove) mutate manifest.json — call " +
            "deliberately.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "list", "search", "install", "remove", "info" },
                },
                ["name"] = new JObject { ["type"] = "string" },
                ["query"] = new JObject { ["type"] = "string" },
                ["version"] = new JObject { ["type"] = "string" },
                ["offline"] = new JObject { ["type"] = "boolean", ["default"] = true },
                ["force"] = new JObject { ["type"] = "boolean", ["default"] = false },
                ["timeoutMs"] = new JObject
                {
                    ["type"] = "integer", ["minimum"] = 1000, ["maximum"] = 600_000, ["default"] = 60_000,
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            int timeoutMs = @params.Value<int?>("timeoutMs") ?? DefaultTimeoutMs;
            if (timeoutMs < 1000) timeoutMs = 1000;
            if (timeoutMs > 600_000) timeoutMs = 600_000;

            switch (action)
            {
                case "list":    return await List(@params.Value<bool?>("offline") ?? true, timeoutMs);
                case "search":  return await Search(@params.Value<string>("query"), timeoutMs);
                case "install": return await Install(@params.Value<string>("name"), @params.Value<string>("version"), timeoutMs);
                case "remove":  return await Remove(@params.Value<string>("name"), @params.Value<bool?>("force") ?? false, timeoutMs);
                case "info":    return await Info(@params.Value<string>("name"), timeoutMs);
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be one of list|search|install|remove|info; got '{action}'.");
            }
        }

        private static async Task<ToolResult> List(bool offline, int timeoutMs)
        {
            var req = Client.List(offlineMode: offline, includeIndirectDependencies: true);
            await WaitForRequest(req, timeoutMs, "list");

            var items = new JArray();
            foreach (var pkg in req.Result ?? Enumerable.Empty<PackageInfo>())
            {
                items.Add(SerializePackage(pkg, includeDependencies: false));
            }
            return ToolResult.Json(new JObject
            {
                ["count"] = items.Count,
                ["offline"] = offline,
                ["items"] = items,
            });
        }

        private static async Task<ToolResult> Search(string query, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(query))
                throw new ToolException("InvalidInput", "'query' is required for action=search.");

            var req = Client.SearchAll();
            await WaitForRequest(req, timeoutMs, "search");

            var lowered = query.ToLowerInvariant();
            var items = new JArray();
            foreach (var pkg in req.Result ?? Enumerable.Empty<PackageInfo>())
            {
                if ((pkg.name ?? string.Empty).ToLowerInvariant().Contains(lowered)
                    || (pkg.displayName ?? string.Empty).ToLowerInvariant().Contains(lowered))
                {
                    items.Add(new JObject
                    {
                        ["name"] = pkg.name ?? string.Empty,
                        ["version"] = pkg.version ?? string.Empty,
                        ["displayName"] = pkg.displayName ?? string.Empty,
                        ["description"] = pkg.description ?? string.Empty,
                    });
                }
            }
            return ToolResult.Json(new JObject
            {
                ["count"] = items.Count,
                ["query"] = query,
                ["items"] = items,
            });
        }

        private static async Task<ToolResult> Install(string nameOrUrl, string version, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(nameOrUrl))
                throw new ToolException("InvalidInput", "'name' is required for action=install.");

            // For registry packages with a version, Unity expects "name@version".
            // Git URLs / file: paths / npm tarball URLs go through as-is.
            var arg = nameOrUrl;
            if (!string.IsNullOrEmpty(version) && !nameOrUrl.Contains("@"))
            {
                arg = $"{nameOrUrl}@{version}";
            }

            var req = Client.Add(arg);
            await WaitForRequest(req, timeoutMs, $"install({arg})");

            if (req.Status != StatusCode.Success || req.Result == null)
            {
                var errMsg = req.Error?.message ?? "unknown error";
                throw new ToolException("ToolError", $"Failed to install '{arg}': {errMsg}");
            }

            return ToolResult.Json(new JObject
            {
                ["installed"] = SerializePackage(req.Result, includeDependencies: false),
            });
        }

        private static async Task<ToolResult> Remove(string name, bool force, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ToolException("InvalidInput", "'name' is required for action=remove.");

            // Dependency check: refuse if other installed packages declare this as a
            // dependency, unless force=true.
            if (!force)
            {
                var listReq = Client.List(offlineMode: true, includeIndirectDependencies: false);
                await WaitForRequest(listReq, timeoutMs, "list (dep-check)");

                var dependents = new List<string>();
                foreach (var pkg in listReq.Result ?? Enumerable.Empty<PackageInfo>())
                {
                    if (pkg.name == name) continue;
                    foreach (var dep in pkg.dependencies ?? Array.Empty<DependencyInfo>())
                    {
                        if (dep.name == name) { dependents.Add($"{pkg.name}@{pkg.version}"); break; }
                    }
                }
                if (dependents.Count > 0)
                {
                    throw new ToolException("InvalidInput",
                        $"Cannot remove '{name}' — {dependents.Count} other package(s) depend on it: " +
                        $"{string.Join(", ", dependents)}. Pass force:true to remove anyway " +
                        "(may break the dependents).");
                }
            }

            var req = Client.Remove(name);
            await WaitForRequest(req, timeoutMs, $"remove({name})");

            if (req.Status != StatusCode.Success)
            {
                var errMsg = req.Error?.message ?? "unknown error";
                throw new ToolException("ToolError", $"Failed to remove '{name}': {errMsg}");
            }

            return ToolResult.Json(new JObject
            {
                ["removed"] = name,
                ["forced"] = force,
            });
        }

        private static async Task<ToolResult> Info(string name, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(name))
                throw new ToolException("InvalidInput", "'name' is required for action=info.");

            var req = Client.List(offlineMode: true, includeIndirectDependencies: true);
            await WaitForRequest(req, timeoutMs, "list (info)");

            foreach (var pkg in req.Result ?? Enumerable.Empty<PackageInfo>())
            {
                if (pkg.name == name)
                {
                    return ToolResult.Json(SerializePackage(pkg, includeDependencies: true));
                }
            }
            throw new ToolException("InvalidInput", $"Package '{name}' is not installed in this project.");
        }

        private static JObject SerializePackage(PackageInfo pkg, bool includeDependencies)
        {
            var obj = new JObject
            {
                ["name"] = pkg.name ?? string.Empty,
                ["version"] = pkg.version ?? string.Empty,
                ["displayName"] = pkg.displayName ?? string.Empty,
                ["source"] = pkg.source.ToString(),
                ["resolvedPath"] = pkg.resolvedPath ?? string.Empty,
            };
            if (includeDependencies)
            {
                obj["description"] = pkg.description ?? string.Empty;
                obj["category"] = pkg.category ?? string.Empty;
                obj["author"] = pkg.author?.name ?? string.Empty;

                var deps = new JArray();
                foreach (var d in pkg.dependencies ?? Array.Empty<DependencyInfo>())
                {
                    deps.Add(new JObject
                    {
                        ["name"] = d.name ?? string.Empty,
                        ["version"] = d.version ?? string.Empty,
                    });
                }
                obj["dependencies"] = deps;
            }
            return obj;
        }

        private static async Task WaitForRequest(Request req, int timeoutMs, string label)
        {
            // UPM Client.* requests fire callbacks on the Editor's main thread,
            // which is also where this method runs (inside MainThreadDispatcher).
            // Blocking with Thread.Sleep would deadlock — Unity's update loop
            // would never get a chance to advance the request. await Task.Yield()
            // returns control to the dispatcher's update loop between polls.
            // Same pattern as RunTestsTool's wait.
            var t0 = DateTime.UtcNow;
            while (!req.IsCompleted)
            {
                if ((DateTime.UtcNow - t0).TotalMilliseconds > timeoutMs)
                {
                    throw new ToolException("ToolError",
                        $"UPM {label} did not complete within {timeoutMs} ms.");
                }
                await Task.Yield();
            }
            if (req.Status == StatusCode.Failure)
            {
                throw new ToolException("ToolError",
                    $"UPM {label} failed: {req.Error?.message ?? "unknown error"}");
            }
        }
    }

}
