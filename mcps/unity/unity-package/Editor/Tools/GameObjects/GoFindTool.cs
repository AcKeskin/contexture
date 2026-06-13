using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Finds GameObjects in loaded scenes by name (exact, case-sensitive) or by hierarchy path.
    /// Returns instance IDs + paths so the agent can correlate with future tools (delete, set,
    /// inspect) without round-tripping through transient names.
    /// </summary>
    [UnityMcpTool("go_find")]
    internal sealed class GoFindTool : IUnityMcpTool
    {
        public string Name => "go_find";

        public string Description =>
            "Find GameObjects in loaded scenes. Match modes: 'name' (exact, case-sensitive on " +
            "GameObject.name), 'path' (full hierarchy path like '/Root/Child/Leaf'). Returns " +
            "instanceId, name, and path for each match. Caps at 'limit' results (default 100).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "name", "path" },
                    ["default"] = "name",
                    ["description"] = "Match mode: 'name' for exact name, 'path' for hierarchy path.",
                },
                ["query"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Name or path to match.",
                },
                ["includeInactive"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = true,
                    ["description"] = "Whether to include inactive GameObjects.",
                },
                ["limit"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 1,
                    ["maximum"] = 1000,
                    ["default"] = 100,
                },
            },
            ["required"] = new JArray { "query" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string query = @params.Value<string>("query");
            if (string.IsNullOrEmpty(query))
            {
                throw new System.ArgumentException("'query' is required.");
            }

            string mode = @params.Value<string>("mode") ?? "name";
            bool includeInactive = @params["includeInactive"]?.Value<bool>() ?? true;
            int limit = @params["limit"]?.Value<int>() ?? 100;
            if (limit < 1) limit = 1;
            if (limit > 1000) limit = 1000;

            var matches = new List<GameObject>();
            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount && matches.Count < limit; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var root in scene.GetRootGameObjects())
                {
                    Walk(root, includeInactive, matches, limit, mode, query, parentPath: string.Empty);
                    if (matches.Count >= limit) break;
                }
            }

            var items = new JArray();
            foreach (var go in matches)
            {
                items.Add(new JObject
                {
                    ["instanceId"] = go.GetInstanceID(),
                    ["name"] = go.name,
                    ["path"] = GameObjectPaths.HierarchyPath(go),
                    ["activeSelf"] = go.activeSelf,
                    ["activeInHierarchy"] = go.activeInHierarchy,
                });
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["mode"] = mode,
                ["query"] = query,
                ["count"] = items.Count,
                ["truncated"] = items.Count >= limit,
                ["items"] = items,
            }));
        }

        private static void Walk(GameObject go, bool includeInactive, List<GameObject> sink, int limit,
            string mode, string query, string parentPath)
        {
            if (sink.Count >= limit) return;
            if (!includeInactive && !go.activeInHierarchy) return;

            string path = parentPath + "/" + go.name;
            bool match = mode == "path"
                ? string.Equals(path, query, System.StringComparison.Ordinal)
                : string.Equals(go.name, query, System.StringComparison.Ordinal);
            if (match) sink.Add(go);

            var t = go.transform;
            for (int i = 0; i < t.childCount && sink.Count < limit; i++)
            {
                Walk(t.GetChild(i).gameObject, includeInactive, sink, limit, mode, query, path);
            }
        }

    }
}
