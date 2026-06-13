using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Materials
{
    /// <summary>
    /// Material-specific operations beyond what asset_create + component_set_property
    /// already cover. Five actions:
    ///
    ///   info  — full record for one Material asset (shader, all properties, render
    ///           queue, keywords). Required: path.
    ///   list_properties — list every shader property the material exposes with
    ///           current value + property type. Required: path.
    ///   set_property  — set a single property by name. Required: path, propertyName,
    ///           value. Type inferred from the shader's property descriptor.
    ///   set_shader  — swap the material's shader by name (e.g. "Standard",
    ///           "Universal Render Pipeline/Lit"). Required: path, shaderName.
    ///   set_keyword  — enable / disable a shader keyword. Required: path,
    ///           keyword, enabled.
    ///
    /// Saves through AssetDatabase so changes survive Editor restart.
    /// </summary>
    [UnityMcpTool("manage_material")]
    internal sealed class ManageMaterialTool : IUnityMcpTool
    {
        public string Name => "manage_material";

        public string Description =>
            "Material asset operations. action=info|list_properties|set_property|set_shader|set_keyword. " +
            "All actions require 'path' (Assets/-relative .mat). info: returns shader, properties[], " +
            "renderQueue, enabledKeywords. list_properties: enumerates the shader's exposed properties " +
            "with current values and property kinds (Float|Int|Color|Vector|Texture|TextureScaleOffset). " +
            "set_property: required propertyName + value (number for Float/Int, [r,g,b,a] for Color, " +
            "[x,y,z,w] for Vector, asset path or {$guid}/{$path} for Texture). set_shader: required " +
            "shaderName (e.g. 'Standard'); preserves compatible properties when swapping. set_keyword: " +
            "required keyword + enabled (bool). All write actions persist via AssetDatabase.SaveAssets.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "info", "list_properties", "set_property", "set_shader", "set_keyword" },
                },
                ["path"] = new JObject { ["type"] = "string" },
                ["propertyName"] = new JObject { ["type"] = "string" },
                ["value"] = new JObject { },
                ["shaderName"] = new JObject { ["type"] = "string" },
                ["keyword"] = new JObject { ["type"] = "string" },
                ["enabled"] = new JObject { ["type"] = "boolean" },
            },
            ["required"] = new JArray { "action", "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            var path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
                throw new ToolException("InvalidInput", "'path' is required.");

            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
                throw new ToolException("InvalidInput", $"No Material asset at '{path}'.");

            switch (action)
            {
                case "info":            return Task.FromResult(Info(mat, path));
                case "list_properties": return Task.FromResult(ListProperties(mat, path));
                case "set_property":    return Task.FromResult(SetProperty(mat, path, @params));
                case "set_shader":      return Task.FromResult(SetShader(mat, path, @params.Value<string>("shaderName")));
                case "set_keyword":     return Task.FromResult(SetKeyword(mat, path, @params.Value<string>("keyword"), @params.Value<bool?>("enabled")));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be one of info|list_properties|set_property|set_shader|set_keyword; got '{action}'.");
            }
        }

        private static ToolResult Info(Material mat, string path)
        {
            var data = new JObject
            {
                ["path"] = path,
                ["name"] = mat.name,
                ["shader"] = mat.shader != null ? mat.shader.name : string.Empty,
                ["renderQueue"] = mat.renderQueue,
                ["enabledKeywords"] = SerializeKeywords(mat),
                ["properties"] = SerializeProperties(mat),
            };
            return ToolResult.Json(data);
        }

        private static ToolResult ListProperties(Material mat, string path)
        {
            return ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["shader"] = mat.shader != null ? mat.shader.name : string.Empty,
                ["properties"] = SerializeProperties(mat),
            });
        }

        private static ToolResult SetProperty(Material mat, string path, JObject @params)
        {
            var name = @params.Value<string>("propertyName");
            if (string.IsNullOrWhiteSpace(name))
                throw new ToolException("InvalidInput", "'propertyName' is required for action=set_property.");
            if (mat.shader == null)
                throw new ToolException("ToolError", $"Material '{path}' has no shader assigned.");
            if (!mat.HasProperty(name))
                throw new ToolException("InvalidInput",
                    $"Shader '{mat.shader.name}' has no property '{name}'. Use action=list_properties to see what's available.");

            int propertyIndex = mat.shader.FindPropertyIndex(name);
            var propType = mat.shader.GetPropertyType(propertyIndex);
            var value = @params["value"]
                ?? throw new ToolException("InvalidInput", "'value' is required for action=set_property.");

            ApplyValue(mat, name, propType, value);

            EditorUtility.SetDirty(mat);
            AssetDatabase.SaveAssetIfDirty(mat);
            return ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["propertyName"] = name,
                ["propertyType"] = propType.ToString(),
                ["set"] = true,
            });
        }

        private static ToolResult SetShader(Material mat, string path, string shaderName)
        {
            if (string.IsNullOrWhiteSpace(shaderName))
                throw new ToolException("InvalidInput", "'shaderName' is required for action=set_shader.");

            var shader = Shader.Find(shaderName);
            if (shader == null)
                throw new ToolException("InvalidInput",
                    $"Shader '{shaderName}' not found. Common names: 'Standard', 'Universal Render Pipeline/Lit', 'HDRP/Lit', 'Unlit/Color'.");

            var oldShader = mat.shader != null ? mat.shader.name : "(none)";
            mat.shader = shader;
            EditorUtility.SetDirty(mat);
            AssetDatabase.SaveAssetIfDirty(mat);
            return ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["previousShader"] = oldShader,
                ["shader"] = shader.name,
            });
        }

        private static ToolResult SetKeyword(Material mat, string path, string keyword, bool? enabled)
        {
            if (string.IsNullOrWhiteSpace(keyword))
                throw new ToolException("InvalidInput", "'keyword' is required for action=set_keyword.");
            if (enabled == null)
                throw new ToolException("InvalidInput", "'enabled' is required for action=set_keyword.");

            if (enabled.Value) mat.EnableKeyword(keyword);
            else mat.DisableKeyword(keyword);

            EditorUtility.SetDirty(mat);
            AssetDatabase.SaveAssetIfDirty(mat);
            return ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["keyword"] = keyword,
                ["enabled"] = enabled.Value,
            });
        }

        private static JArray SerializeProperties(Material mat)
        {
            var arr = new JArray();
            var shader = mat.shader;
            if (shader == null) return arr;

            int count = shader.GetPropertyCount();
            for (int i = 0; i < count; i++)
            {
                var name = shader.GetPropertyName(i);
                var type = shader.GetPropertyType(i);
                var entry = new JObject
                {
                    ["name"] = name,
                    ["type"] = type.ToString(),
                };
                switch (type)
                {
                    case UnityEngine.Rendering.ShaderPropertyType.Float:
                    case UnityEngine.Rendering.ShaderPropertyType.Range:
                        entry["value"] = mat.GetFloat(name);
                        break;
                    case UnityEngine.Rendering.ShaderPropertyType.Int:
                        entry["value"] = mat.GetInteger(name);
                        break;
                    case UnityEngine.Rendering.ShaderPropertyType.Color:
                    {
                        var c = mat.GetColor(name);
                        entry["value"] = new JArray { c.r, c.g, c.b, c.a };
                        break;
                    }
                    case UnityEngine.Rendering.ShaderPropertyType.Vector:
                    {
                        var v = mat.GetVector(name);
                        entry["value"] = new JArray { v.x, v.y, v.z, v.w };
                        break;
                    }
                    case UnityEngine.Rendering.ShaderPropertyType.Texture:
                    {
                        var tex = mat.GetTexture(name);
                        if (tex != null)
                        {
                            var texPath = AssetDatabase.GetAssetPath(tex);
                            entry["value"] = new JObject
                            {
                                ["$path"] = texPath,
                                ["$guid"] = AssetDatabase.AssetPathToGUID(texPath),
                            };
                        }
                        else
                        {
                            entry["value"] = JValue.CreateNull();
                        }
                        break;
                    }
                }
                arr.Add(entry);
            }
            return arr;
        }

        private static JArray SerializeKeywords(Material mat)
        {
            var arr = new JArray();
            foreach (var kw in mat.shaderKeywords)
            {
                if (!string.IsNullOrEmpty(kw)) arr.Add(kw);
            }
            return arr;
        }

        private static void ApplyValue(Material mat, string name, UnityEngine.Rendering.ShaderPropertyType type, JToken value)
        {
            switch (type)
            {
                case UnityEngine.Rendering.ShaderPropertyType.Float:
                case UnityEngine.Rendering.ShaderPropertyType.Range:
                {
                    if (value.Type != JTokenType.Float && value.Type != JTokenType.Integer)
                        throw new ToolException("InvalidInput", $"Property '{name}' is Float; value must be a number.");
                    mat.SetFloat(name, value.Value<float>());
                    break;
                }
                case UnityEngine.Rendering.ShaderPropertyType.Int:
                {
                    if (value.Type != JTokenType.Integer)
                        throw new ToolException("InvalidInput", $"Property '{name}' is Int; value must be an integer.");
                    mat.SetInteger(name, value.Value<int>());
                    break;
                }
                case UnityEngine.Rendering.ShaderPropertyType.Color:
                {
                    var c = ParseFloat4(value, name, "Color");
                    mat.SetColor(name, new Color(c[0], c[1], c[2], c[3]));
                    break;
                }
                case UnityEngine.Rendering.ShaderPropertyType.Vector:
                {
                    var v = ParseFloat4(value, name, "Vector");
                    mat.SetVector(name, new Vector4(v[0], v[1], v[2], v[3]));
                    break;
                }
                case UnityEngine.Rendering.ShaderPropertyType.Texture:
                {
                    var tex = ResolveTexture(value, name);
                    mat.SetTexture(name, tex);
                    break;
                }
                default:
                    throw new ToolException("InvalidInput", $"Property '{name}' has unsupported type {type}.");
            }
        }

        private static float[] ParseFloat4(JToken value, string name, string typeLabel)
        {
            if (!(value is JArray arr) || arr.Count != 4)
                throw new ToolException("InvalidInput", $"Property '{name}' is {typeLabel}; value must be a 4-element array [x,y,z,w] or [r,g,b,a].");
            var f = new float[4];
            for (int i = 0; i < 4; i++) f[i] = arr[i].Value<float>();
            return f;
        }

        private static Texture ResolveTexture(JToken value, string name)
        {
            string assetPath = null;
            if (value.Type == JTokenType.String)
            {
                assetPath = value.Value<string>();
            }
            else if (value is JObject obj)
            {
                var byGuid = obj.Value<string>("$guid");
                var byPath = obj.Value<string>("$path");
                if (!string.IsNullOrEmpty(byGuid))
                {
                    assetPath = AssetDatabase.GUIDToAssetPath(byGuid);
                }
                else if (!string.IsNullOrEmpty(byPath))
                {
                    assetPath = byPath;
                }
            }
            else if (value.Type == JTokenType.Null)
            {
                return null;
            }

            if (string.IsNullOrEmpty(assetPath))
                throw new ToolException("InvalidInput",
                    $"Texture property '{name}' value must be an asset path string, {{$guid:...}}, {{$path:...}}, or null.");

            var tex = AssetDatabase.LoadAssetAtPath<Texture>(assetPath);
            if (tex == null)
                throw new ToolException("InvalidInput", $"No Texture asset at '{assetPath}' for property '{name}'.");
            return tex;
        }
    }
}
