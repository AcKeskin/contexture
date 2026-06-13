using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Lists every MRTK 3 component instance in the active loaded scenes —
    /// instanceId, GameObject name, MRTK type. Cheap surface for "what UX is on
    /// this scene" before drilling into individual inspect tools.
    /// </summary>
    [UnityMcpTool("mrtk3_list_uxcomponents", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3ListUxComponentsTool : IUnityMcpTool
    {
        public string Name => "mrtk3_list_uxcomponents";

        public string Description =>
            "List MRTK 3 UX components in all loaded scenes. Returns componentInstanceId + " +
            "type (PressableButton, BoundsControl, ObjectManipulator, etc.) + GameObject " +
            "name + path. Cap at 'limit' (default 500).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["limit"] = new JObject
                {
                    ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 5000, ["default"] = 500,
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int limit = @params["limit"]?.Value<int>() ?? 500;
            if (limit < 1) limit = 1;
            if (limit > 5000) limit = 5000;

            var items = new JArray();
            int total = 0;
            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount && items.Count < limit; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var root in scene.GetRootGameObjects())
                {
                    foreach (var go in EnumerateAllChildren(root.transform))
                    {
                        foreach (var comp in Mrtk3Types.GetMrtkComponents(go))
                        {
                            total++;
                            if (items.Count >= limit) continue;
                            items.Add(new JObject
                            {
                                ["componentInstanceId"] = comp.GetInstanceID(),
                                ["gameObjectInstanceId"] = go.GetInstanceID(),
                                ["type"] = comp.GetType().Name,
                                ["typeFullName"] = comp.GetType().FullName,
                                ["gameObjectName"] = go.name,
                                ["scene"] = scene.path ?? string.Empty,
                            });
                        }
                    }
                }
            }

            var data = new JObject
            {
                ["count"] = items.Count,
                ["totalDiscovered"] = total,
                ["truncated"] = total > limit,
                ["items"] = items,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static System.Collections.Generic.IEnumerable<GameObject> EnumerateAllChildren(Transform t)
        {
            yield return t.gameObject;
            for (int i = 0; i < t.childCount; i++)
            {
                foreach (var d in EnumerateAllChildren(t.GetChild(i))) yield return d;
            }
        }
    }
}
