using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Creates a prefab Variant asset whose base is a source prefab. Accepts EXACTLY ONE of
    /// 'basePath' (the base prefab asset path) or 'baseInstanceId' (a scene instance of the base).
    ///
    /// Variant semantics: a variant is produced by instantiating the base prefab into the scene
    /// (a connected prefab instance) and saving THAT instance to a new path with
    /// SaveAsPrefabAsset. Because the source is a connected instance, Unity writes the new asset
    /// as a variant of the base rather than a flattened copy — confirmed as the documented
    /// variant-creation path on the 2021.3 LTS floor. The temporary instance is destroyed after
    /// the save. Registers Undo for the temporary scene object it creates.
    /// </summary>
    [UnityMcpTool("prefab_create_variant")]
    internal sealed class PrefabCreateVariantTool : IUnityMcpTool
    {
        public string Name => "prefab_create_variant";

        public string Description =>
            "Create a prefab Variant asset of a base prefab at 'variantPath'. Provide EXACTLY ONE " +
            "of 'basePath' (base asset path) or 'baseInstanceId' (a scene instance of the base). " +
            "The written asset is a true variant (its base GUID is the source prefab). Returns " +
            "{ path, guid, baseGuid }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["basePath"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["baseInstanceId"] = new JObject { ["type"] = new JArray { "integer", "null" } },
                ["variantPath"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "variantPath" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string variantPath = @params.Value<string>("variantPath");
            if (string.IsNullOrWhiteSpace(variantPath))
            {
                throw new ToolException("InvalidInput", "'variantPath' is required.");
            }

            bool hasPath = @params["basePath"] != null && @params["basePath"].Type != JTokenType.Null;
            bool hasInstance = @params["baseInstanceId"] != null && @params["baseInstanceId"].Type != JTokenType.Null;
            if (hasPath == hasInstance)
            {
                throw new ToolException("InvalidInput",
                    "Provide EXACTLY ONE of 'basePath' or 'baseInstanceId'.");
            }

            // Resolve the base prefab ASSET (the variant's base), regardless of input form.
            GameObject baseAsset;
            if (hasPath)
            {
                string basePath = @params.Value<string>("basePath");
                baseAsset = AssetDatabase.LoadAssetAtPath<GameObject>(basePath);
                if (baseAsset == null)
                {
                    throw new ToolException("InvalidInput", $"No prefab asset at basePath '{basePath}'.");
                }
            }
            else
            {
                int baseId = @params.Value<int>("baseInstanceId");
                var instance = InstanceIdResolver.GameObjectOrThrow(baseId, "baseInstanceId");
                if (!PrefabUtility.IsPartOfPrefabInstance(instance))
                {
                    throw new ToolException("InvalidInput",
                        "baseInstanceId is not a prefab instance; cannot resolve a base asset.");
                }
                var source = PrefabUtility.GetCorrespondingObjectFromSource(instance);
                baseAsset = source != null
                    ? AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GetAssetPath(source))
                    : null;
                if (baseAsset == null)
                {
                    throw new ToolException("InvalidInput",
                        "Could not resolve the base prefab asset behind baseInstanceId.");
                }
            }

            var dir = Path.GetDirectoryName(variantPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
                AssetDatabase.Refresh();
            }

            // Instantiate the base as a connected instance, then save THAT to the new path so
            // Unity records a variant (not a flattened copy). Clean up the temp instance after.
            var temp = (GameObject)PrefabUtility.InstantiatePrefab(baseAsset);
            if (temp == null)
            {
                throw new ToolException("Internal", "PrefabUtility.InstantiatePrefab returned null for the base.");
            }

            GameObject created;
            try
            {
                Undo.RegisterCreatedObjectUndo(temp, "Unity MCP: Create Prefab Variant");
                created = PrefabUtility.SaveAsPrefabAsset(temp, variantPath);
            }
            finally
            {
                // Remove the temporary scene instance; Undo of the variant creation also removes it.
                Undo.DestroyObjectImmediate(temp);
            }

            if (created == null)
            {
                throw new ToolException("Internal",
                    $"PrefabUtility.SaveAsPrefabAsset returned null for variantPath '{variantPath}'.");
            }

            string basePrefabPath = AssetDatabase.GetAssetPath(baseAsset);
            var data = new JObject
            {
                ["path"] = variantPath,
                ["guid"] = AssetDatabase.AssetPathToGUID(variantPath) ?? string.Empty,
                ["baseGuid"] = AssetDatabase.AssetPathToGUID(basePrefabPath) ?? string.Empty,
                ["basePath"] = basePrefabPath ?? string.Empty,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
