using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Instantiates a prefab asset into the active scene. Optional 'parentInstanceId' nests
    /// under an existing scene GameObject; otherwise placed at the active scene's root.
    /// Registers Undo. Errors when 'path' doesn't resolve to a prefab asset.
    /// </summary>
    [UnityMcpTool("prefab_instantiate")]
    internal sealed class PrefabInstantiateTool : IUnityMcpTool
    {
        public string Name => "prefab_instantiate";

        public string Description =>
            "Instantiate a prefab asset into the active scene. Optional 'parentInstanceId' " +
            "places it under an existing GameObject. Returns the new scene-instance's instanceId.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["parentInstanceId"] = new JObject
                {
                    ["type"] = new JArray { "integer", "null" },
                },
                ["position"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 3,
                },
            },
            ["required"] = new JArray { "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("'path' is required.");
            }

            var prefabAsset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefabAsset == null)
            {
                throw new ArgumentException($"No prefab asset at '{path}'.");
            }

            int? parentId = null;
            if (@params["parentInstanceId"] != null && @params["parentInstanceId"].Type != JTokenType.Null)
            {
                parentId = @params.Value<int?>("parentInstanceId");
            }

            Transform parent = null;
            if (parentId.HasValue && parentId.Value != 0)
            {
                var parentGo = InstanceIdResolver.GameObjectOrThrow(parentId.Value, "parentInstanceId");
                parent = parentGo.transform;
            }

            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabAsset);
            if (instance == null)
            {
                throw new InvalidOperationException("PrefabUtility.InstantiatePrefab returned null.");
            }

            if (parent != null)
            {
                instance.transform.SetParent(parent, worldPositionStays: false);
            }
            else
            {
                var active = EditorSceneManager.GetActiveScene();
                if (active.IsValid() && active.isLoaded)
                {
                    SceneManager.MoveGameObjectToScene(instance, active);
                }
            }

            if (@params["position"] is JArray posArr)
            {
                var v = Vector3Json.TryParse(posArr);
                if (v.HasValue) instance.transform.localPosition = v.Value;
            }

            Undo.RegisterCreatedObjectUndo(instance, "Unity MCP: Instantiate Prefab");
            EditorSceneManager.MarkSceneDirty(instance.scene);

            var data = new JObject
            {
                ["instanceId"] = instance.GetInstanceID(),
                ["name"] = instance.name,
                ["path"] = path,
                ["parentInstanceId"] = parent != null ? (JToken)parent.gameObject.GetInstanceID() : JValue.CreateNull(),
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
