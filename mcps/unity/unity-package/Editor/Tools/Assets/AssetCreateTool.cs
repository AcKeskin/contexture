using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Creates a small set of asset types directly from the wire envelope. v2 supports
    /// Material, RenderTexture, and ScriptableObject (named subclass). Other types return
    /// InvalidInput — binary asset import goes through asset_import after the user drops
    /// the file into the project (DESIGN §7).
    /// </summary>
    [UnityMcpTool("asset_create")]
    internal sealed class AssetCreateTool : IUnityMcpTool
    {
        public string Name => "asset_create";

        public string Description =>
            "Create an asset at a path. Supported types: 'Material' (default Standard shader), " +
            "'RenderTexture' (256x256 ARGB32), 'ScriptableObject' (requires 'scriptableObjectType' " +
            "with the fully-qualified type name). Other types return InvalidInput.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["assetType"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "Material", "RenderTexture", "ScriptableObject" },
                },
                ["scriptableObjectType"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Required when assetType=ScriptableObject. Fully-qualified type name.",
                },
            },
            ["required"] = new JArray { "path", "assetType" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            string typeStr = @params.Value<string>("assetType");
            if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(typeStr))
            {
                throw new ArgumentException("'path' and 'assetType' are required.");
            }

            // Make sure the directory exists. AssetDatabase.CreateAsset requires it.
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
                AssetDatabase.Refresh();
            }

            UnityEngine.Object asset;
            string typeName;

            switch (typeStr)
            {
                case "Material":
                {
                    var shader = Shader.Find("Standard") ?? Shader.Find("Universal Render Pipeline/Lit");
                    if (shader == null)
                    {
                        throw new InvalidOperationException(
                            "Cannot create Material — neither 'Standard' nor 'Universal Render Pipeline/Lit' shader is available.");
                    }
                    asset = new Material(shader);
                    typeName = "UnityEngine.Material";
                    break;
                }
                case "RenderTexture":
                {
                    var rt = new RenderTexture(256, 256, 24, RenderTextureFormat.ARGB32);
                    rt.name = Path.GetFileNameWithoutExtension(path);
                    asset = rt;
                    typeName = "UnityEngine.RenderTexture";
                    break;
                }
                case "ScriptableObject":
                {
                    string soTypeName = @params.Value<string>("scriptableObjectType");
                    if (string.IsNullOrWhiteSpace(soTypeName))
                    {
                        throw new ArgumentException(
                            "'scriptableObjectType' is required when assetType=ScriptableObject.");
                    }
                    var soType = ResolveScriptableObjectType(soTypeName);
                    asset = ScriptableObject.CreateInstance(soType);
                    typeName = soType.FullName;
                    break;
                }
                default:
                    throw new ArgumentException($"Unsupported assetType '{typeStr}'.");
            }

            AssetDatabase.CreateAsset(asset, path);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            var data = new JObject
            {
                ["path"] = path,
                ["type"] = typeName,
                ["guid"] = AssetDatabase.AssetPathToGUID(path) ?? string.Empty,
                ["instanceId"] = asset.GetInstanceID(),
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static Type ResolveScriptableObjectType(string typeName)
        {
            var t = Type.GetType(typeName, throwOnError: false, ignoreCase: false);
            if (t != null && typeof(ScriptableObject).IsAssignableFrom(t)) return t;

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (System.Reflection.ReflectionTypeLoadException ex)
                {
                    types = ex.Types;
                }
                foreach (var ty in types)
                {
                    if (ty == null) continue;
                    if (!typeof(ScriptableObject).IsAssignableFrom(ty)) continue;
                    if (ty.IsAbstract) continue;
                    if (ty.FullName == typeName || ty.Name == typeName) return ty;
                }
            }
            throw new ArgumentException(
                $"ScriptableObject type '{typeName}' not found. Try the fully-qualified name.");
        }
    }
}
