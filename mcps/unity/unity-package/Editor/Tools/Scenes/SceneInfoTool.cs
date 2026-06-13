using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.Scenes
{
    /// <summary>
    /// Returns active scene metadata: name, asset path, dirty state, root GameObject count,
    /// and root GameObject names. Loaded-scene list is also returned (multi-scene editing).
    /// </summary>
    [UnityMcpTool("scene_info")]
    internal sealed class SceneInfoTool : IUnityMcpTool
    {
        public string Name => "scene_info";

        public string Description =>
            "Returns metadata about the active scene and any other loaded scenes: name, " +
            "asset path, isDirty, isLoaded, rootGameObjectCount, rootGameObjectNames. " +
            "Set 'tree=true' to get a full hierarchy tree (depth capped at 'depth', default 3, max 8).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["tree"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = false,
                    ["description"] = "When true, returns a hierarchy tree instead of rootGameObjectNames.",
                },
                ["depth"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 1,
                    ["maximum"] = 8,
                    ["default"] = 3,
                    ["description"] = "Max tree depth when 'tree' is true. Root counts as depth 1.",
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            bool tree = @params["tree"]?.Value<bool>() ?? false;
            int depth = @params["depth"]?.Value<int>() ?? 3;
            depth = Math.Max(1, Math.Min(8, depth));

            var active = EditorSceneManager.GetActiveScene();
            var loaded = new JArray();
            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                loaded.Add(SceneToJson(scene, includeRootNames: false, tree: false, depth: 0));
            }

            var data = new JObject
            {
                ["active"] = SceneToJson(active, includeRootNames: !tree, tree: tree, depth: depth),
                ["loaded"] = loaded,
            };

            return Task.FromResult(ToolResult.Json(data));
        }

        private static JObject SceneToJson(Scene scene, bool includeRootNames, bool tree, int depth)
        {
            var obj = new JObject
            {
                ["name"] = scene.name ?? string.Empty,
                ["path"] = scene.path ?? string.Empty,
                ["isLoaded"] = scene.isLoaded,
                ["isDirty"] = scene.isDirty,
                ["buildIndex"] = scene.buildIndex,
                ["rootGameObjectCount"] = scene.isLoaded ? scene.rootCount : 0,
            };

            if (!scene.isLoaded) return obj;

            var roots = scene.GetRootGameObjects();
            if (tree)
            {
                var treeArr = new JArray();
                foreach (var r in roots) treeArr.Add(GoToTreeNode(r, depth));
                obj["rootGameObjects"] = treeArr;
            }
            else if (includeRootNames)
            {
                var names = new JArray();
                foreach (var r in roots) names.Add(r.name);
                obj["rootGameObjectNames"] = names;
            }

            return obj;
        }

        private static JObject GoToTreeNode(GameObject go, int depthLeft)
        {
            var node = new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["name"] = go.name,
                ["childCount"] = go.transform.childCount,
            };

            if (depthLeft > 1)
            {
                var children = new JArray();
                for (int i = 0; i < go.transform.childCount; i++)
                    children.Add(GoToTreeNode(go.transform.GetChild(i).gameObject, depthLeft - 1));
                node["children"] = children;
            }

            return node;
        }
    }
}
