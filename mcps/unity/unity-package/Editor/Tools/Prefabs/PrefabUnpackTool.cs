using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Breaks the prefab linkage on a scene instance while preserving its GameObject/component
    /// structure. 'mode' selects how deep the unpack goes:
    ///   "completely" → PrefabUnpackMode.Completely  (nested prefab instances are also unpacked)
    ///   "outermost"  → PrefabUnpackMode.OutermostRoot (nested prefab instances survive as instances)
    /// Registers Undo on the full hierarchy + marks the scene dirty before unpacking.
    /// </summary>
    [UnityMcpTool("prefab_unpack")]
    internal sealed class PrefabUnpackTool : IUnityMcpTool
    {
        public string Name => "prefab_unpack";

        public string Description =>
            "Break a scene prefab instance's linkage, preserving its structure. 'mode': " +
            "'completely' (also unpacks nested prefab instances) or 'outermost' (nested prefab " +
            "instances survive as instances). Undo recorded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "completely", "outermost" },
                    ["default"] = "outermost",
                },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            string mode = @params.Value<string>("mode") ?? "outermost";

            PrefabUnpackMode unpackMode;
            switch (mode)
            {
                case "completely": unpackMode = PrefabUnpackMode.Completely; break;
                case "outermost": unpackMode = PrefabUnpackMode.OutermostRoot; break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown mode '{mode}'. Use 'completely' or 'outermost'.");
            }

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ToolException("InvalidInput", "GameObject is not a prefab instance.");
            }

            // Undo + dirty BEFORE the structural change, so a single undo restores the linkage.
            Undo.RegisterFullObjectHierarchyUndo(go, "Unity MCP: Unpack Prefab");
            EditorSceneManager.MarkSceneDirty(go.scene);

            PrefabUtility.UnpackPrefabInstance(go, unpackMode, InteractionMode.UserAction);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["mode"] = mode,
                ["unpacked"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
