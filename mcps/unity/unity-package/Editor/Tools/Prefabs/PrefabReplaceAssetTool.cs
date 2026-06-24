using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Repoints a scene prefab instance at a different prefab asset, preserving mappable overrides
    /// (Unity merges by name-matching). Returns the previous and new asset paths.
    ///
    /// Floor note: PrefabUtility.ReplacePrefabAssetOfPrefabInstance (and PrefabReplacingSettings)
    /// were introduced in Unity 2022.1 — ABOVE this package's 2021.3 LTS compile floor. To keep the
    /// package compiling on 2021.3, the API is invoked via reflection: on 2022.1+ it works
    /// natively; on older editors the tool throws ToolException("Unsupported", …) at call time
    /// rather than failing to compile. Mirrors the reflection pattern already used for the
    /// internal SerializedProperty.gradientValue accessor.
    /// </summary>
    [UnityMcpTool("prefab_replace_asset")]
    internal sealed class PrefabReplaceAssetTool : IUnityMcpTool
    {
        public string Name => "prefab_replace_asset";

        public string Description =>
            "Repoint a scene prefab instance at a different prefab asset ('newPath'), preserving " +
            "mappable overrides (name-matched). Returns { instanceId, oldPath, newPath, replaced }. " +
            "Requires Unity 2022.1+ (throws 'Unsupported' on older editors). Undo recorded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["newPath"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "instanceId", "newPath" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            string newPath = @params.Value<string>("newPath");
            if (string.IsNullOrWhiteSpace(newPath))
            {
                throw new ToolException("InvalidInput", "'newPath' is required.");
            }

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ToolException("InvalidInput", "GameObject is not a prefab instance.");
            }

            var newAsset = AssetDatabase.LoadAssetAtPath<GameObject>(newPath);
            if (newAsset == null)
            {
                throw new ToolException("InvalidInput", $"No prefab asset at newPath '{newPath}'.");
            }

            var method = ResolveReplaceMethod();
            if (method == null)
            {
                throw new ToolException("Unsupported",
                    "prefab_replace_asset requires Unity 2022.1+ " +
                    "(PrefabUtility.ReplacePrefabAssetOfPrefabInstance is unavailable on this editor).");
            }

            string oldPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go);

            // Undo + dirty before the structural change so one undo restores the prior asset.
            Undo.RegisterFullObjectHierarchyUndo(go, "Unity MCP: Replace Prefab Asset");
            EditorSceneManager.MarkSceneDirty(go.scene);

            InvokeReplace(method, go, newAsset);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["oldPath"] = oldPath ?? string.Empty,
                ["newPath"] = newPath,
                ["replaced"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static MethodInfo ResolveReplaceMethod()
        {
            // Unity 6 exposes more than one ReplacePrefabAssetOfPrefabInstance overload. Pick
            // deterministically among the ones this binder can fill (two GameObjects, an optional
            // settings struct, an optional InteractionMode), preferring the overload that carries
            // the settings struct so "keep mappable overrides" defaults apply. FirstOrDefault over
            // GetMethods() is order-nondeterministic, so never rely on declaration order.
            return typeof(PrefabUtility)
                .GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Where(m => m.Name == "ReplacePrefabAssetOfPrefabInstance")
                .Where(CanBind)
                .OrderByDescending(m => m.GetParameters().Length)
                .FirstOrDefault();
        }

        // True only when every parameter is a type InvokeReplace knows how to supply — so a future
        // overload with an unrecognised parameter is skipped rather than mis-invoked.
        private static bool CanBind(MethodInfo m)
        {
            foreach (var p in m.GetParameters())
            {
                var pt = p.ParameterType;
                bool known = pt == typeof(GameObject)
                    || pt == typeof(InteractionMode)
                    || (pt.IsValueType && !pt.IsEnum); // the settings struct
                if (!known) return false;
            }
            // Must take exactly the two GameObjects (instance + new asset).
            int goCount = m.GetParameters().Count(p => p.ParameterType == typeof(GameObject));
            return goCount == 2;
        }

        private static void InvokeReplace(MethodInfo method, GameObject instance, GameObject newAsset)
        {
            var ps = method.GetParameters();
            var args = new object[ps.Length];
            bool instanceSlotFilled = false; // first GameObject param = instance, second = new asset
            for (int i = 0; i < ps.Length; i++)
            {
                var pt = ps[i].ParameterType;
                if (pt == typeof(GameObject))
                {
                    args[i] = instanceSlotFilled ? newAsset : instance;
                    instanceSlotFilled = true;
                }
                else if (pt == typeof(InteractionMode))
                {
                    args[i] = InteractionMode.UserAction;
                }
                else if (pt.IsValueType)
                {
                    // PrefabReplacingSettings (struct) — default-construct; its defaults keep
                    // mappable overrides, matching the Inspector's "Replace and Keep Overrides".
                    args[i] = Activator.CreateInstance(pt);
                }
                else
                {
                    args[i] = null;
                }
            }

            try
            {
                method.Invoke(null, args);
            }
            catch (TargetInvocationException tie)
            {
                var inner = tie.InnerException ?? tie;
                throw new ToolException("Internal",
                    $"ReplacePrefabAssetOfPrefabInstance failed: {inner.Message}");
            }
        }
    }
}
