using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
#if UNITY_MCP_HAS_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace UnityMcp.Editor.Tools.InputTools
{
    /// <summary>
    /// New Input System asset surface. Read actions:
    ///
    ///   list_assets     — every InputActionAsset in the project (path + GUID +
    ///                     map count). Mirrors `asset_find filter:"t:InputActionAsset"`
    ///                     but adds a quick map count + name without a separate load.
    ///   inspect_asset   — full action-map / action / binding tree for one asset
    ///                     (resolved by 'assetPath' or 'guid').
    ///   list_maps       — convenience: just the action maps for one asset
    ///                     (no per-action bindings).
    ///   find_action     — search by action name (case-insensitive) across every
    ///                     InputActionAsset in the project. Returns one row per hit
    ///                     with assetPath, mapName, actionName, bindingCount, type.
    ///   info            — Input System runtime info: package version (if reachable),
    ///                     active update mode, settings asset path.
    ///
    /// Write actions (build the asset through the Input System API so Unity owns the
    /// internal action/binding GUIDs and the .meta — we never hand-author either):
    ///
    ///   create_asset    — create a new empty InputActionAsset at 'assetPath'.
    ///   add_map         — add an action map ('map') to an asset.
    ///   add_action      — add an action ('action', 'type', optional 'controlType')
    ///                     to a map ('map').
    ///   add_binding     — add a binding ('path', optional 'groups'/'interactions'/
    ///                     'processors') to an action ('map' + 'action').
    ///   remove_map      — remove an action map by name.
    ///   remove_action   — remove an action by name from a map.
    ///   remove_binding  — remove a binding by its 'bindingId' from an action.
    ///
    /// Every write resolves the asset, mutates the in-memory InputActionAsset, writes
    /// it back via InputActionAsset.ToJson() + AssetDatabase.ImportAsset, and returns
    /// the re-read tree (same shape as inspect_asset) so the caller sees the committed
    /// state, including any GUIDs Unity generated.
    ///
    /// Out of scope for this slice:
    /// - Composite bindings (2D Vector / 1D Axis with part bindings) — the part-binding
    ///   wiring deserves its own format-aware action once a project needs it.
    /// - Control schemes / device requirements editing — read-only for now.
    /// - Legacy InputManager (ProjectSettings/InputManager.asset axes/keys). New
    ///   projects should use the Input System; legacy support follows on demand.
    ///
    /// The whole tool is gated by the UNITY_MCP_HAS_INPUT_SYSTEM versionDefine
    /// (com.unity.inputsystem ≥ 1.0.0). Without it, every action throws
    /// InvalidInput with a clear message.
    /// </summary>
    [UnityMcpTool("manage_input")]
    internal sealed class ManageInputTool : IUnityMcpTool
    {
        public string Name => "manage_input";

        public string Description =>
            "New Input System asset surface (read + write). " +
            "action=list_assets|inspect_asset|list_maps|find_action|info|" +
            "create_asset|add_map|add_action|add_binding|remove_map|remove_action|remove_binding. " +
            "READS — " +
            "list_assets: returns { count, items: [{ assetPath, guid, name, mapCount }] }. " +
            "inspect_asset: required 'assetPath' or 'guid'; returns the full asset tree " +
            "{ assetPath, name, mapCount, actionMaps: [{ name, enabled, actions: " +
            "[{ name, type, expectedControlType, bindings: [{ id, path, groups, isComposite, " +
            "isPartOfComposite, interactions, processors }] }] }] }. " +
            "list_maps: required 'assetPath' or 'guid'; returns { assetPath, name, " +
            "mapCount, maps: [{ name, enabled, actionCount, bindingCount }] }. " +
            "find_action: required 'name'; optional 'assetPath' to scope; returns " +
            "{ count, hits: [{ assetPath, mapName, actionName, type, bindingCount, " +
            "expectedControlType }] }. Match is case-insensitive substring. " +
            "info: { packageVersion, updateMode, settingsAssetPath, actionAssetCount }. " +
            "WRITES (each returns the re-read inspect_asset tree) — " +
            "create_asset: required 'assetPath' ending in '.inputactions' under Assets/; " +
            "optional 'overwrite' (default false). " +
            "add_map: required 'assetPath'|'guid' + 'map'. " +
            "add_action: required asset + 'map' + 'actionName'; optional 'type' " +
            "(Button|Value|PassThrough, default Button) + 'controlType' (e.g. 'Vector2'). " +
            "add_binding: required asset + 'map' + 'actionName' + 'path' (e.g. '<Pointer>/press'); " +
            "optional 'groups', 'interactions', 'processors'. " +
            "remove_map: required asset + 'map'. remove_action: required asset + 'map' + 'actionName'. " +
            "remove_binding: required asset + 'map' + 'actionName' + 'bindingId'. " +
            "Requires com.unity.inputsystem ≥ 1.0.0.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray
                    {
                        "list_assets", "inspect_asset", "list_maps", "find_action", "info",
                        "create_asset", "add_map", "add_action", "add_binding",
                        "remove_map", "remove_action", "remove_binding",
                    },
                },
                ["assetPath"] = new JObject { ["type"] = "string" },
                ["guid"] = new JObject { ["type"] = "string" },
                ["name"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Action name to search for (find_action only).",
                },
                ["overwrite"] = new JObject
                {
                    ["type"] = "boolean",
                    ["description"] = "create_asset: overwrite an existing asset at the path. Default false.",
                },
                ["map"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Action-map name (add_map/add_action/add_binding/remove_*).",
                },
                ["actionName"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Action name (add_action/add_binding/remove_action/remove_binding). Distinct from the 'action' dispatch verb.",
                },
                ["type"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "Button", "Value", "PassThrough" },
                    ["description"] = "Action type for add_action. Default Button.",
                },
                ["controlType"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Expected control type for add_action, e.g. 'Vector2', 'Axis'. Optional.",
                },
                ["path"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Binding control path for add_binding, e.g. '<Pointer>/press'.",
                },
                ["groups"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Binding group(s) for add_binding (control-scheme names, ';'-separated).",
                },
                ["interactions"] = new JObject { ["type"] = "string" },
                ["processors"] = new JObject { ["type"] = "string" },
                ["bindingId"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Binding GUID for remove_binding (from the inspect_asset tree's binding 'id').",
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_INPUT_SYSTEM
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            switch (action)
            {
                case "list_assets":    return Task.FromResult(ListAssets());
                case "inspect_asset":  return Task.FromResult(InspectAsset(@params));
                case "list_maps":      return Task.FromResult(ListMaps(@params));
                case "find_action":    return Task.FromResult(FindAction(@params));
                case "info":           return Task.FromResult(ReadInfo());
                case "create_asset":   return Task.FromResult(InputActionWriter.CreateAsset(@params));
                case "add_map":        return Task.FromResult(InputActionWriter.AddMap(@params, ResolveAsset, InspectAsset));
                case "add_action":     return Task.FromResult(InputActionWriter.AddAction(@params, ResolveAsset, InspectAsset));
                case "add_binding":    return Task.FromResult(InputActionWriter.AddBinding(@params, ResolveAsset, InspectAsset));
                case "remove_map":     return Task.FromResult(InputActionWriter.RemoveMap(@params, ResolveAsset, InspectAsset));
                case "remove_action":  return Task.FromResult(InputActionWriter.RemoveAction(@params, ResolveAsset, InspectAsset));
                case "remove_binding": return Task.FromResult(InputActionWriter.RemoveBinding(@params, ResolveAsset, InspectAsset));
                default:
                    throw new ToolException("InvalidInput",
                        "action must be one of list_assets|inspect_asset|list_maps|find_action|info|" +
                        $"create_asset|add_map|add_action|add_binding|remove_map|remove_action|remove_binding; got '{action}'.");
            }
        }

        private static string[] FindAllAssetGuids()
        {
            return AssetDatabase.FindAssets("t:InputActionAsset");
        }

        private static InputActionAsset ResolveAsset(JObject @params)
        {
            var assetPath = @params.Value<string>("assetPath");
            var guid = @params.Value<string>("guid");

            if (!string.IsNullOrEmpty(guid))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrEmpty(path))
                    throw new ToolException("NotFound", $"No asset with GUID '{guid}'.");
                assetPath = path;
            }

            if (string.IsNullOrEmpty(assetPath))
                throw new ToolException("InvalidInput",
                    "Either 'assetPath' or 'guid' is required.");

            var asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(assetPath);
            if (asset == null)
                throw new ToolException("NotFound",
                    $"No InputActionAsset at '{assetPath}'.");
            return asset;
        }

        private static ToolResult ListAssets()
        {
            var guids = FindAllAssetGuids();
            var items = new JArray();
            foreach (var g in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(g);
                var asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(path);
                if (asset == null) continue;
                items.Add(new JObject
                {
                    ["assetPath"] = path,
                    ["guid"] = g,
                    ["name"] = asset.name,
                    ["mapCount"] = asset.actionMaps.Count,
                });
            }
            return ToolResult.Json(new JObject
            {
                ["count"] = items.Count,
                ["items"] = items,
            });
        }

        private static ToolResult InspectAsset(JObject @params)
        {
            var asset = ResolveAsset(@params);
            return InspectAssetObject(asset);
        }

        /// <summary>
        /// Inspect by project-relative path. Used by <see cref="InputActionWriter"/>
        /// after create_asset, where there is no pre-resolved asset to pass.
        /// </summary>
        internal static ToolResult InspectAssetByPath(string assetPath)
        {
            var asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(assetPath);
            if (asset == null)
                throw new ToolException("NotFound", $"No InputActionAsset at '{assetPath}'.");
            return InspectAssetObject(asset);
        }

        private static ToolResult InspectAssetObject(InputActionAsset asset)
        {
            var path = AssetDatabase.GetAssetPath(asset);

            var maps = new JArray();
            foreach (var map in asset.actionMaps)
            {
                var actions = new JArray();
                foreach (var act in map.actions)
                {
                    var bindings = new JArray();
                    foreach (var b in act.bindings)
                    {
                        bindings.Add(new JObject
                        {
                            ["id"] = b.id.ToString(),
                            ["path"] = b.path ?? string.Empty,
                            ["groups"] = b.groups ?? string.Empty,
                            ["isComposite"] = b.isComposite,
                            ["isPartOfComposite"] = b.isPartOfComposite,
                            ["interactions"] = b.interactions ?? string.Empty,
                            ["processors"] = b.processors ?? string.Empty,
                        });
                    }
                    actions.Add(new JObject
                    {
                        ["name"] = act.name,
                        ["type"] = act.type.ToString(),
                        ["expectedControlType"] = act.expectedControlType ?? string.Empty,
                        ["bindings"] = bindings,
                    });
                }
                maps.Add(new JObject
                {
                    ["name"] = map.name,
                    ["enabled"] = map.enabled,
                    ["actions"] = actions,
                });
            }

            return ToolResult.Json(new JObject
            {
                ["assetPath"] = path,
                ["name"] = asset.name,
                ["mapCount"] = asset.actionMaps.Count,
                ["actionMaps"] = maps,
            });
        }

        private static ToolResult ListMaps(JObject @params)
        {
            var asset = ResolveAsset(@params);
            var path = AssetDatabase.GetAssetPath(asset);

            var maps = new JArray();
            foreach (var map in asset.actionMaps)
            {
                int bindingCount = 0;
                foreach (var act in map.actions) bindingCount += act.bindings.Count;
                maps.Add(new JObject
                {
                    ["name"] = map.name,
                    ["enabled"] = map.enabled,
                    ["actionCount"] = map.actions.Count,
                    ["bindingCount"] = bindingCount,
                });
            }

            return ToolResult.Json(new JObject
            {
                ["assetPath"] = path,
                ["name"] = asset.name,
                ["mapCount"] = asset.actionMaps.Count,
                ["maps"] = maps,
            });
        }

        private static ToolResult FindAction(JObject @params)
        {
            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required for action=find_action.");

            var scopePath = @params.Value<string>("assetPath");
            var hits = new JArray();
            var needle = name.ToLowerInvariant();

            string[] guids;
            if (!string.IsNullOrEmpty(scopePath))
            {
                var g = AssetDatabase.AssetPathToGUID(scopePath);
                if (string.IsNullOrEmpty(g))
                    throw new ToolException("NotFound", $"No asset at '{scopePath}'.");
                guids = new[] { g };
            }
            else
            {
                guids = FindAllAssetGuids();
            }

            foreach (var g in guids)
            {
                var path = AssetDatabase.GUIDToAssetPath(g);
                var asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(path);
                if (asset == null) continue;
                foreach (var map in asset.actionMaps)
                {
                    foreach (var act in map.actions)
                    {
                        if ((act.name ?? string.Empty).ToLowerInvariant().Contains(needle))
                        {
                            hits.Add(new JObject
                            {
                                ["assetPath"] = path,
                                ["mapName"] = map.name,
                                ["actionName"] = act.name,
                                ["type"] = act.type.ToString(),
                                ["bindingCount"] = act.bindings.Count,
                                ["expectedControlType"] = act.expectedControlType ?? string.Empty,
                            });
                        }
                    }
                }
            }

            return ToolResult.Json(new JObject
            {
                ["count"] = hits.Count,
                ["hits"] = hits,
            });
        }

        private static ToolResult ReadInfo()
        {
            var settingsObj = InputSystem.settings;
            var settingsPath = settingsObj != null
                ? AssetDatabase.GetAssetPath(settingsObj)
                : string.Empty;

            // Package version: read from the InputSystem assembly informational version.
            var asm = typeof(InputSystem).Assembly;
            var verAttr = System.Reflection.CustomAttributeExtensions
                .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(asm);
            var packageVersion = verAttr?.InformationalVersion ?? asm.GetName().Version?.ToString() ?? "unknown";

            return ToolResult.Json(new JObject
            {
                ["packageVersion"] = packageVersion,
                ["updateMode"] = InputSystem.settings?.updateMode.ToString() ?? "unknown",
                ["settingsAssetPath"] = settingsPath,
                ["actionAssetCount"] = FindAllAssetGuids().Length,
            });
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "manage_input requires com.unity.inputsystem (≥1.0.0). Install the Input System package to use this tool.");
        }
#endif
    }
}
