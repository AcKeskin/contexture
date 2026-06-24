using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools.Components;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Edits a prefab ASSET's root in isolation in a single stateless call: LoadPrefabContents →
    /// apply a verb list of mutations → SaveAsPrefabAsset → UnloadPrefabContents. No editor state
    /// is held across calls (the loaded contents never escape this method), so a second unrelated
    /// tool call between two prefab_edit calls cannot corrupt anything. Stateful open/edit/close
    /// sessions are deliberately out of scope.
    ///
    /// Mutations (applied in order to the loaded root):
    ///   { "op": "addComponent",    "type": "&lt;Component type name&gt;" }
    ///   { "op": "removeComponent", "type": "&lt;Component type name&gt;" }
    ///   { "op": "setProperty",     "component": "&lt;type&gt;", "propertyPath": "...", "value": ... }
    ///
    /// Save registers Undo + marks the asset dirty. UnloadPrefabContents runs even on a
    /// mid-mutation throw, so loaded contents are never leaked.
    /// </summary>
    [UnityMcpTool("prefab_edit")]
    internal sealed class PrefabEditTool : IUnityMcpTool
    {
        public string Name => "prefab_edit";

        public string Description =>
            "Edit a prefab asset's root in one stateless call (load → mutate → save → unload). " +
            "'path' is the prefab asset. 'mutations' is an ordered array of verb ops: " +
            "{op:'addComponent',type}, {op:'removeComponent',type}, " +
            "{op:'setProperty',component,propertyPath,value}. setProperty 'value' follows " +
            "component_set_property coercion. Re-instantiating the asset reflects the edits. " +
            "Undo recorded; no state held across calls.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["mutations"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JObject
                        {
                            ["op"] = new JObject
                            {
                                ["type"] = "string",
                                ["enum"] = new JArray { "addComponent", "removeComponent", "setProperty" },
                            },
                            ["type"] = new JObject { ["type"] = "string" },
                            ["component"] = new JObject { ["type"] = "string" },
                            ["propertyPath"] = new JObject { ["type"] = "string" },
                            ["value"] = new JObject(),
                        },
                        ["required"] = new JArray { "op" },
                        ["additionalProperties"] = false,
                    },
                },
            },
            ["required"] = new JArray { "path", "mutations" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ToolException("InvalidInput", "'path' is required.");
            }
            if (!(@params["mutations"] is JArray mutations))
            {
                throw new ToolException("InvalidInput", "'mutations' must be an array.");
            }

            var prefabAsset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefabAsset == null)
            {
                throw new ToolException("InvalidInput", $"No prefab asset at '{path}'.");
            }

            int applied = 0;
            GameObject root = PrefabUtility.LoadPrefabContents(path);
            try
            {
                foreach (var token in mutations)
                {
                    if (!(token is JObject m))
                    {
                        throw new ToolException("InvalidInput", "Each mutation must be an object.");
                    }
                    ApplyMutation(root, m);
                    applied++;
                }

                Undo.RegisterCompleteObjectUndo(prefabAsset, "Unity MCP: Edit Prefab");
                var saved = PrefabUtility.SaveAsPrefabAsset(root, path);
                if (saved == null)
                {
                    throw new ToolException("Internal",
                        $"PrefabUtility.SaveAsPrefabAsset returned null for '{path}'.");
                }
                EditorUtility.SetDirty(prefabAsset);
            }
            finally
            {
                // Always unload — even on a mid-mutation throw — so loaded contents never leak.
                PrefabUtility.UnloadPrefabContents(root);
            }

            var data = new JObject
            {
                ["path"] = path,
                ["applied"] = applied,
                ["saved"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static void ApplyMutation(GameObject root, JObject m)
        {
            string op = m.Value<string>("op");
            switch (op)
            {
                case "addComponent":
                {
                    var type = ResolveComponentType(m.Value<string>("type"));
                    root.AddComponent(type);
                    return;
                }
                case "removeComponent":
                {
                    var type = ResolveComponentType(m.Value<string>("type"));
                    var comp = root.GetComponent(type);
                    if (comp == null)
                    {
                        throw new ToolException("InvalidInput",
                            $"removeComponent: root has no component of type '{type.Name}'.");
                    }
                    // LoadPrefabContents returns an in-memory preview-scene root, so its components
                    // are scene objects, not assets — the default (allowDestroyingAssets:false)
                    // applies and keeps the asset-destroy safety guard in force.
                    UnityEngine.Object.DestroyImmediate(comp);
                    return;
                }
                case "setProperty":
                {
                    string compName = m.Value<string>("component");
                    if (string.IsNullOrWhiteSpace(compName))
                    {
                        throw new ToolException("InvalidInput", "setProperty requires 'component'.");
                    }
                    string propertyPath = m.Value<string>("propertyPath");
                    if (string.IsNullOrWhiteSpace(propertyPath))
                    {
                        throw new ToolException("InvalidInput", "setProperty requires 'propertyPath'.");
                    }
                    var type = ResolveComponentType(compName);
                    var comp = root.GetComponent(type);
                    if (comp == null)
                    {
                        throw new ToolException("InvalidInput",
                            $"setProperty: root has no component of type '{type.Name}'.");
                    }
                    using (var so = new SerializedObject(comp))
                    {
                        var p = so.FindProperty(propertyPath);
                        if (p == null)
                        {
                            throw new ToolException("InvalidInput",
                                $"setProperty: property '{propertyPath}' not found on {type.Name}.");
                        }
                        try
                        {
                            PropertyValueCoercion.Apply(p, m["value"]);
                        }
                        catch (PropertyValueCoercion.CoercionUnsupportedException ex)
                        {
                            throw new ToolException("InvalidInput", ex.Message,
                                new JObject { ["unsupportedType"] = ex.UnsupportedType });
                        }
                        catch (ArgumentException ex)
                        {
                            throw new ToolException("InvalidInput", ex.Message);
                        }
                        so.ApplyModifiedPropertiesWithoutUndo();
                    }
                    return;
                }
                default:
                    throw new ToolException("InvalidInput", $"Unknown mutation op '{op}'.");
            }
        }

        private static Type ResolveComponentType(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName))
            {
                throw new ToolException("InvalidInput", "Mutation requires a component 'type'.");
            }
            // Reuse the established resolver (fully-qualified, then short-name across assemblies).
            // It throws ArgumentException on no-match/ambiguous — translate to ToolException so
            // this tool's error contract stays structured (criterion 9).
            try
            {
                return ComponentAddTool.ResolveComponentType(typeName);
            }
            catch (ArgumentException ex)
            {
                throw new ToolException("InvalidInput", ex.Message);
            }
        }
    }
}
