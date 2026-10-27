using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools.Components;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Sets N serialized properties on a Project asset (ScriptableObject, or any other
    /// non-GameObject asset) and saves it to disk. Same transactional semantics as
    /// <see cref="ComponentSetPropertiesTool"/>: one <see cref="SerializedObject"/> for the
    /// batch, <see cref="SerializedObject.ApplyModifiedProperties"/> once at the end, so a
    /// failed write commits nothing and the error carries <c>details.failedAt</c>.
    ///
    /// Scene objects and prefab GameObjects are rejected — those go through
    /// component_set_properties / prefab_edit.
    /// </summary>
    [UnityMcpTool("asset_set_properties")]
    internal sealed class AssetSetPropertiesTool : IUnityMcpTool
    {
        public string Name => "asset_set_properties";

        public string Description =>
            "Set serialized fields on a Project asset (ScriptableObject, etc.) and save it. " +
            "Target by 'path' (e.g. 'Assets/Data/Enemy.asset') or 'instanceId' (from " +
            "asset_find / asset_create). 'writes' is [{ propertyPath, value }]; propertyPath is " +
            "the serialized field name or Unity SerializedProperty syntax ('stats.hp', " +
            "'items.Array.data[0]', 'm_Name'). Values coerce like component_set_property " +
            "(numbers, booleans, strings, arrays for Vector*/Color/Quaternion, enum names, " +
            "{ $guid } / { $path } / instanceId for Object refs, null to clear). All-or-nothing: " +
            "on failure nothing is written and details.failedAt names the path; an unknown path " +
            "also returns details.availableProperties. Undo recorded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["writes"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JObject
                        {
                            ["propertyPath"] = new JObject { ["type"] = "string" },
                            ["value"] = new JObject
                            {
                                ["description"] = "Number, boolean, string, array, enum-name, Object ref, or null.",
                            },
                        },
                        ["required"] = new JArray { "propertyPath" },
                    },
                    ["minItems"] = 1,
                },
            },
            ["required"] = new JArray { "writes" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var writes = @params["writes"] as JArray
                ?? throw new ToolException("InvalidInput", "'writes' is required and must be an array.");
            if (writes.Count == 0)
                throw new ToolException("InvalidInput", "'writes' must contain at least one entry.");

            var asset = ResolveAsset(@params);

            var appliedPaths = new JArray();
            using (var so = new SerializedObject(asset))
            {
                for (int i = 0; i < writes.Count; i++)
                {
                    var write = writes[i] as JObject;
                    if (write == null)
                        throw FailedAt(i.ToString(), $"writes[{i}] is not an object.");

                    var propertyPath = write.Value<string>("propertyPath");
                    if (string.IsNullOrWhiteSpace(propertyPath))
                        throw FailedAt($"writes[{i}].propertyPath",
                            $"writes[{i}] is missing 'propertyPath' or it is empty.");

                    var prop = so.FindProperty(propertyPath);
                    if (prop == null)
                    {
                        throw FailedAt(propertyPath,
                            $"Property '{propertyPath}' not found on {asset.GetType().Name}.",
                            new JObject { ["availableProperties"] = TopLevelProperties(so) });
                    }

                    try
                    {
                        PropertyValueCoercion.Apply(prop, write["value"]);
                    }
                    catch (PropertyValueCoercion.CoercionUnsupportedException ex)
                    {
                        throw FailedAt(propertyPath, ex.Message,
                            new JObject { ["unsupportedType"] = ex.UnsupportedType });
                    }
                    catch (System.ArgumentException ex)
                    {
                        throw FailedAt(propertyPath, ex.Message);
                    }

                    appliedPaths.Add(propertyPath);
                }

                so.ApplyModifiedProperties();
            }

            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssetIfDirty(asset);

            var path = AssetDatabase.GetAssetPath(asset);
            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["guid"] = AssetDatabase.AssetPathToGUID(path),
                ["type"] = asset.GetType().FullName,
                ["written"] = appliedPaths.Count,
                ["propertyPaths"] = appliedPaths,
            }));
        }

        private static Object ResolveAsset(JObject @params)
        {
            string path = @params.Value<string>("path");
            int? id = @params.Value<int?>("instanceId");

            Object asset;
            if (!string.IsNullOrWhiteSpace(path))
            {
                asset = AssetDatabase.LoadMainAssetAtPath(path)
                    ?? throw new ToolException("InvalidInput", $"No asset at path '{path}'.");
            }
            else if (id.HasValue)
            {
                asset = InstanceIdResolver.ObjectOrThrow(id.Value);
            }
            else
            {
                throw new ToolException("InvalidInput", "One of 'path' or 'instanceId' is required.");
            }

            if (!EditorUtility.IsPersistent(asset))
                throw new ToolException("InvalidInput",
                    $"'{asset.name}' is a scene object, not a Project asset. Use component_set_properties.");
            if (asset is GameObject || asset is Component)
                throw new ToolException("InvalidInput",
                    $"'{asset.name}' is a prefab. Use prefab_edit.");

            return asset;
        }

        private static JArray TopLevelProperties(SerializedObject so)
        {
            var names = new JArray();
            var p = so.GetIterator();
            bool enterChildren = true;
            while (p.NextVisible(enterChildren))
            {
                enterChildren = false;
                if (p.name == "m_Script") continue;
                names.Add(p.name);
            }
            return names;
        }

        private static ToolException FailedAt(string propertyPath, string message, JObject extra = null)
        {
            var details = new JObject { ["failedAt"] = propertyPath };
            if (extra != null)
            {
                foreach (var kvp in extra)
                    details[kvp.Key] = kvp.Value;
            }
            return new ToolException("InvalidInput", message, details);
        }
    }
}
