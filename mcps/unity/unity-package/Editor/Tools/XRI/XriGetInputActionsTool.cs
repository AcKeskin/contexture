using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_INPUT_SYSTEM
using UnityEngine;
using UnityEngine.InputSystem;
#endif
#if UNITY_MCP_HAS_XRI
using UnityMcp.Runtime;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Returns the active InputActionAsset's action maps + bindings, filtered to the
    /// action names + binding paths the agent typically wants. Full InputActionAsset
    /// JSON is too verbose to surface raw.
    /// </summary>
    [UnityMcpTool("xri_get_input_actions", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriGetInputActionsTool : IUnityMcpTool
    {
        public string Name => "xri_get_input_actions";

        public string Description =>
            "Return the current InputActionAsset's action maps + binding paths. " +
            "Filtered to name + path; full asset dump is too verbose for the wire.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["assetPath"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Optional asset path of the InputActionAsset. Defaults to the first one found in the scene.",
                },
            },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_INPUT_SYSTEM
        // Asset name used to detect whether the queried asset is the driver's
        // override source. Kept in sync with the resource at
        // Runtime/Resources/Actions/McpInputActions.inputactions.
        private const string McpInputActionsAssetName = "McpInputActions";

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string assetPath = @params.Value<string>("assetPath");
            InputActionAsset asset;
            if (!string.IsNullOrWhiteSpace(assetPath))
            {
                asset = UnityEditor.AssetDatabase.LoadAssetAtPath<InputActionAsset>(assetPath);
                if (asset == null)
                {
                    throw new ToolException("InvalidInput",
                        $"No InputActionAsset at '{assetPath}'.");
                }
            }
            else
            {
                // Fallback returns whichever InputActionAsset Unity finds first in
                // the loaded asset registry. Order is undefined — multiple assets
                // typically coexist (XRI default, MRTK default, McpInputActions).
                // Pass 'assetPath' for determinism.
                asset = UnityEngine.Object.FindFirstObjectByType<InputActionAsset>();
                if (asset == null)
                {
                    throw new ToolException("InvalidInput",
                        "No InputActionAsset loaded. Pass 'assetPath' to load by path.");
                }
            }

            // overriddenByDriver is per-action: true when the action belongs to
            // the McpInputActions asset (the driver's source of truth). Detected
            // by asset name — Resources.Load resolves to the same instance,
            // and the name is stable.
            bool assetIsMcpOverride = asset.name == McpInputActionsAssetName;

            var maps = new JArray();
            foreach (var map in asset.actionMaps)
            {
                var actions = new JArray();
                foreach (var action in map.actions)
                {
                    var bindings = new JArray();
                    foreach (var b in action.bindings)
                    {
                        bindings.Add(new JObject
                        {
                            ["path"] = b.path ?? string.Empty,
                            ["groups"] = b.groups ?? string.Empty,
                            ["isComposite"] = b.isComposite,
                            ["isPartOfComposite"] = b.isPartOfComposite,
                        });
                    }
                    actions.Add(new JObject
                    {
                        ["name"] = action.name,
                        ["type"] = action.type.ToString(),
                        ["enabled"] = action.enabled,
                        ["overriddenByDriver"] = assetIsMcpOverride,
                        ["bindings"] = bindings,
                    });
                }
                maps.Add(new JObject
                {
                    ["name"] = map.name,
                    ["enabled"] = map.enabled,
                    ["actionCount"] = map.actions.Count,
                    ["actions"] = actions,
                });
            }

#if UNITY_MCP_HAS_XRI
            bool driverActive = UnityEngine.Object.FindFirstObjectByType<McpXriDriver>() != null;
#else
            bool driverActive = false;
#endif

            var data = new JObject
            {
                ["assetName"] = asset.name,
                ["assetPath"] = UnityEditor.AssetDatabase.GetAssetPath(asset) ?? string.Empty,
                ["mapCount"] = asset.actionMaps.Count,
                ["driverActive"] = driverActive,
                ["actionMaps"] = maps,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_get_input_actions requires com.unity.inputsystem (≥1.0.0).");
        }
#endif
    }
}
