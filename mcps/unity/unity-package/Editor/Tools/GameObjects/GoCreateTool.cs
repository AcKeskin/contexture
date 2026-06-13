using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Creates an empty GameObject or a built-in primitive in the active scene.
    /// v1 deliberately omits prefab instantiation, component lists, and serialization knobs;
    /// they belong to component_/prefab_ tools in v2. Registers an Undo entry so the user
    /// can revert any AI-driven creation in-Editor.
    /// </summary>
    [UnityMcpTool("go_create")]
    internal sealed class GoCreateTool : IUnityMcpTool
    {
        public string Name => "go_create";

        public string Description =>
            "Create a GameObject in the active scene. Either an empty GameObject (default) " +
            "or a built-in primitive (Cube, Sphere, Capsule, Cylinder, Plane, Quad). " +
            "Optional 'parentInstanceId' nests under an existing object; optional 'position' " +
            "sets local position. When the parent has a RectTransform, the child is also created " +
            "with RectTransform to match Unity's Editor convention. Returns instanceId, hierarchy " +
            "path, and transformType of the created object.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["name"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Name for the new GameObject.",
                },
                ["primitive"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "none", "Cube", "Sphere", "Capsule", "Cylinder", "Plane", "Quad" },
                    ["default"] = "none",
                    ["description"] = "Built-in primitive to create. 'none' creates an empty GameObject.",
                },
                ["parentInstanceId"] = new JObject
                {
                    ["type"] = "integer",
                    ["description"] = "Optional. Instance ID of an existing GameObject to parent under.",
                },
                ["position"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 3,
                    ["description"] = "Optional [x, y, z] local position. Defaults to (0,0,0).",
                },
            },
            ["required"] = new JArray { "name" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string name = @params.Value<string>("name");
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("'name' is required.");
            }

            string primitiveStr = @params.Value<string>("primitive") ?? "none";
            int? parentId = @params["parentInstanceId"]?.Type == JTokenType.Integer
                ? @params.Value<int?>("parentInstanceId")
                : null;
            Vector3 localPos = Vector3Json.TryParse(@params["position"] as JArray) ?? Vector3.zero;

            GameObject go;
            if (string.Equals(primitiveStr, "none", StringComparison.OrdinalIgnoreCase))
            {
                go = new GameObject(name);
            }
            else
            {
                if (!Enum.TryParse<PrimitiveType>(primitiveStr, ignoreCase: true, out var prim))
                {
                    throw new ArgumentException($"Unknown primitive '{primitiveStr}'.");
                }
                go = GameObject.CreatePrimitive(prim);
                go.name = name;
            }

            // Parenting: explicit parent wins; otherwise place into the active scene.
            GameObject parentGo = null;
            if (parentId.HasValue)
            {
                try
                {
                    parentGo = InstanceIdResolver.GameObjectOrThrow(parentId.Value, "parentInstanceId");
                }
                catch
                {
                    UnityEngine.Object.DestroyImmediate(go);
                    throw;
                }
                // Mirror Unity Editor: UI hierarchy requires RectTransform on both parent and child.
                if (string.Equals(primitiveStr, "none", StringComparison.OrdinalIgnoreCase)
                    && parentGo.transform is RectTransform)
                {
                    go.AddComponent<RectTransform>();
                }
                go.transform.SetParent(parentGo.transform, worldPositionStays: false);
            }
            else
            {
                var active = EditorSceneManager.GetActiveScene();
                if (active.IsValid() && active.isLoaded)
                {
                    SceneManager.MoveGameObjectToScene(go, active);
                }
            }

            go.transform.localPosition = localPos;
            Undo.RegisterCreatedObjectUndo(go, "Unity MCP: Create GameObject");
            EditorSceneManager.MarkSceneDirty(go.scene);

            var data = new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["name"] = go.name,
                ["path"] = GameObjectPaths.HierarchyPath(go),
                ["scene"] = go.scene.path ?? string.Empty,
                ["primitive"] = primitiveStr,
                ["parentInstanceId"] = parentGo != null ? (JToken)parentGo.GetInstanceID() : JValue.CreateNull(),
                ["localPosition"] = Vector3Json.ToJson(localPos),
                ["transformType"] = go.transform is RectTransform ? "RectTransform" : "Transform",
            };

            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
