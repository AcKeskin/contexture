using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Reports unsaved work so the agent can check before a destructive op: dirty open
    /// scenes (path + isDirty), the prefab-edit stage's dirty state when one is open, and a
    /// best-effort list of dirty unsaved assets. Read-only: registers no Undo, marks
    /// nothing dirty, and saves nothing (scene_save covers saving).
    ///
    /// The dirty-asset list is bounded to currently-loaded asset objects (no full-project
    /// AssetDatabase scan) — 'assetsExhaustive' is always false to declare this — and is
    /// restricted to project assets under 'Assets/'. Unity holds many built-in/package
    /// assets (built-in shaders, Library resources) perpetually dirty in memory; those are
    /// not user-actionable unsaved work, so they are excluded.
    /// </summary>
    [UnityMcpTool("editor_get_dirty_state")]
    internal sealed class EditorGetDirtyStateTool : IUnityMcpTool
    {
        public string Name => "editor_get_dirty_state";

        public string Description =>
            "Report unsaved work: { scenes: [{path, isDirty}], dirtyAssets: [path...], " +
            "assetsExhaustive: false, prefabStage: {path, isDirty} | null }. dirtyAssets is " +
            "best-effort (loaded asset objects only, no full-project scan) and restricted " +
            "to project assets under 'Assets/' (built-in/package assets Unity holds " +
            "perpetually dirty are excluded) — assetsExhaustive is always false to signal " +
            "this. Read-only: saves nothing, marks nothing dirty. Use scene_save to act on it.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var scenes = new JArray();
            int sceneCount = EditorSceneManager.sceneCount;
            for (int i = 0; i < sceneCount; i++)
            {
                var scene = EditorSceneManager.GetSceneAt(i);
                scenes.Add(new JObject
                {
                    ["path"] = scene.path ?? string.Empty,
                    ["isDirty"] = scene.isDirty,
                });
            }

            JToken prefabStage = JValue.CreateNull();
            var stage = PrefabStageUtility.GetCurrentPrefabStage();
            if (stage != null)
            {
                prefabStage = new JObject
                {
                    ["path"] = stage.assetPath ?? string.Empty,
                    ["isDirty"] = stage.scene.isDirty,
                };
            }

            var dirtyAssets = new JArray();
            var seen = new HashSet<string>();
            foreach (var obj in Resources.FindObjectsOfTypeAll<Object>())
            {
                if (obj == null) continue;
                if (!EditorUtility.IsDirty(obj)) continue;
                if (!AssetDatabase.Contains(obj)) continue; // asset, not a scene object

                string path = AssetDatabase.GetAssetPath(obj);
                if (string.IsNullOrEmpty(path)) continue;
                // Exclude built-in/package assets (Library/..., Packages/..., "Resources/...")
                // that Unity keeps perpetually dirty in memory — they aren't user-actionable
                // unsaved work. Only project assets under Assets/ are.
                if (!path.StartsWith("Assets/")) continue;
                if (seen.Add(path))
                    dirtyAssets.Add(path);
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["scenes"] = scenes,
                ["dirtyAssets"] = dirtyAssets,
                ["assetsExhaustive"] = false,
                ["prefabStage"] = prefabStage,
            }));
        }
    }
}
