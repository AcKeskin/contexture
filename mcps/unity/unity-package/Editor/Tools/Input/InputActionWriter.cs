using System;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityMcp.Editor.Tools.Scripts;
#if UNITY_MCP_HAS_INPUT_SYSTEM
using UnityEngine;
using UnityEngine.InputSystem;
#endif

namespace UnityMcp.Editor.Tools.InputTools
{
    /// <summary>
    /// Write half of <see cref="ManageInputTool"/>. Kept in its own class so the read
    /// surface stays focused: this file owns the mutation path and nothing else.
    ///
    /// Every mutation builds the asset through the Input System API
    /// (<see cref="InputActionAsset"/>.AddActionMap / AddAction / AddBinding) rather
    /// than editing JSON by hand. The API generates the internal action and binding
    /// GUIDs that Unity owns; we never author those, and we never touch the .meta —
    /// Unity regenerates it when ImportAsset runs. Persisting is uniform: mutate the
    /// in-memory asset, write <see cref="InputActionAsset.ToJson"/> to disk, force a
    /// synchronous import, then re-read via the caller's inspect function so the
    /// response reflects committed state (including Unity-assigned ids).
    ///
    /// Gated by UNITY_MCP_HAS_INPUT_SYSTEM. Without the package the whole file compiles
    /// to throwing stubs so the dispatch switch in ManageInputTool still binds.
    /// </summary>
    internal static class InputActionWriter
    {
#if UNITY_MCP_HAS_INPUT_SYSTEM
        private const string Extension = ".inputactions";

        /// <summary>create_asset — write a new empty InputActionAsset to disk.</summary>
        public static ToolResult CreateAsset(JObject @params)
        {
            var path = @params.Value<string>("assetPath");
            if (string.IsNullOrWhiteSpace(path))
                throw new ToolException("InvalidInput", "'assetPath' is required for action=create_asset.");
            if (!path.EndsWith(Extension, StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput",
                    $"'assetPath' must end in '{Extension}'; got '{path}'.");

            // ResolveForWrite enforces the Assets/-and-allowlisted-packages boundary and
            // rejects absolute / escaping paths. It does NOT gate on extension (that's the
            // script policy's job) — .inputactions is an asset, not a script, so we gate
            // the extension here instead.
            var absolute = ScriptPathPolicy.ResolveForWrite(path);

            bool overwrite = @params.Value<bool?>("overwrite") ?? false;
            if (File.Exists(absolute) && !overwrite)
                throw new ToolException("InvalidInput",
                    $"Asset already exists: '{path}'. Pass overwrite=true to replace it.");

            var asset = ScriptableObject.CreateInstance<InputActionAsset>();
            asset.name = Path.GetFileNameWithoutExtension(path);
            try
            {
                Persist(asset, absolute, path);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(asset);
            }

            return ReadBack(path);
        }

        public static ToolResult AddMap(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var mapName = RequireString(@params, "map", "add_map");

            if (asset.FindActionMap(mapName) != null)
                throw new ToolException("InvalidInput",
                    $"Action map '{mapName}' already exists in '{path}'.");

            asset.AddActionMap(mapName);
            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        public static ToolResult AddAction(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var map = RequireMap(asset, path, RequireString(@params, "map", "add_action"));
            var actionName = RequireString(@params, "actionName", "add_action");

            if (map.FindAction(actionName) != null)
                throw new ToolException("InvalidInput",
                    $"Action '{actionName}' already exists in map '{map.name}'.");

            var type = ParseActionType(@params.Value<string>("type"));
            var controlType = @params.Value<string>("controlType");

            // A live asset cannot be edited while enabled. Maps default to disabled in
            // the editor, but guard anyway — AddAction throws on an enabled map.
            map.Disable();
            map.AddAction(
                actionName,
                type,
                expectedControlLayout: string.IsNullOrWhiteSpace(controlType) ? null : controlType);

            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        public static ToolResult AddBinding(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var map = RequireMap(asset, path, RequireString(@params, "map", "add_binding"));
            var action = RequireAction(map, RequireString(@params, "actionName", "add_binding"));
            var bindingPath = RequireString(@params, "path", "add_binding");

            map.Disable();
            action.AddBinding(
                path: bindingPath,
                interactions: @params.Value<string>("interactions"),
                processors: @params.Value<string>("processors"),
                groups: @params.Value<string>("groups"));

            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        public static ToolResult RemoveMap(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var map = RequireMap(asset, path, RequireString(@params, "map", "remove_map"));

            map.Disable();
            asset.RemoveActionMap(map);

            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        public static ToolResult RemoveAction(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var map = RequireMap(asset, path, RequireString(@params, "map", "remove_action"));
            var actionName = RequireString(@params, "actionName", "remove_action");
            // Confirm existence so we return NotFound rather than a silent no-op.
            RequireAction(map, actionName);

            map.Disable();
            // RemoveAction is an InputActionAsset-level extension keyed by name. When the
            // same action name exists in multiple maps, prefer the map-qualified form so
            // we erase exactly the one the caller named.
            asset.RemoveAction($"{map.name}/{actionName}");

            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        public static ToolResult RemoveBinding(
            JObject @params,
            Func<JObject, InputActionAsset> resolve,
            Func<JObject, ToolResult> inspect)
        {
            var (asset, path) = LoadForWrite(@params, resolve);
            var map = RequireMap(asset, path, RequireString(@params, "map", "remove_binding"));
            var action = RequireAction(map, RequireString(@params, "actionName", "remove_binding"));
            var bindingIdStr = RequireString(@params, "bindingId", "remove_binding");

            if (!Guid.TryParse(bindingIdStr, out var bindingId))
                throw new ToolException("InvalidInput",
                    $"'bindingId' '{bindingIdStr}' is not a valid GUID. Read it from the inspect_asset binding 'id'.");

            int index = action.bindings.IndexOf(b => b.id == bindingId);
            if (index < 0)
                throw new ToolException("NotFound",
                    $"No binding with id '{bindingIdStr}' on action '{action.name}'.");

            map.Disable();
            action.ChangeBinding(index).Erase();

            Persist(asset, ToAbsolute(path), path);
            return inspect(@params);
        }

        // --- shared write helpers --------------------------------------------------

        /// <summary>
        /// Resolve an existing asset for mutation and confirm the on-disk path passes
        /// the write boundary. Returns the loaded asset plus its project-relative path.
        /// </summary>
        private static (InputActionAsset asset, string path) LoadForWrite(
            JObject @params, Func<JObject, InputActionAsset> resolve)
        {
            var asset = resolve(@params);
            var path = AssetDatabase.GetAssetPath(asset);
            if (string.IsNullOrEmpty(path))
                throw new ToolException("ToolError", "Resolved asset has no on-disk path.");
            // Enforce the same write boundary create_asset uses — reject edits to assets
            // outside Assets/ (e.g. a read-only InputActionAsset inside a UPM package).
            ScriptPathPolicy.ResolveForWrite(path);
            return (asset, path);
        }

        // Unity's own serialization of an InputActionAsset with no maps. ToJson()
        // is NOT null-safe on a freshly created asset: its map collection is null
        // (not empty) until the first AddActionMap, and ToJson() -> FromMaps() ->
        // .Count() throws ArgumentNullException. We write this literal for the
        // empty case and let ToJson() handle any asset that actually has maps.
        private const string EmptyAssetJson = "{\n    \"name\": \"\",\n    \"maps\": [],\n    \"controlSchemes\": []\n}";

        /// <summary>
        /// Serialize the asset to its .inputactions JSON, write it, and force a
        /// synchronous import so the .meta and GUIDs are regenerated by Unity.
        /// </summary>
        private static void Persist(InputActionAsset asset, string absolute, string projectRelativePath)
        {
            var dir = Path.GetDirectoryName(absolute);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            // actionMaps is the public accessor (a ReadOnlyArray struct, safe to read
            // on a fresh asset). It is count 0 for an asset with no maps, where ToJson()
            // throws because its internal map collection is null rather than empty.
            // Use the literal for that case; ToJson() for any asset that has maps.
            bool hasMaps;
            try { hasMaps = asset.actionMaps.Count > 0; }
            catch { hasMaps = false; }
            var json = hasMaps ? asset.ToJson() : EmptyAssetJson;
            File.WriteAllText(absolute, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            AssetDatabase.ImportAsset(projectRelativePath, ImportAssetOptions.ForceSynchronousImport);
        }

        private static ToolResult ReadBack(string projectRelativePath)
        {
            var asset = AssetDatabase.LoadAssetAtPath<InputActionAsset>(projectRelativePath);
            if (asset == null)
                throw new ToolException("ToolError",
                    $"Asset written to '{projectRelativePath}' but did not import as an InputActionAsset. " +
                    "The serialized content may be malformed.");
            return ManageInputTool.InspectAssetByPath(projectRelativePath);
        }

        private static string ToAbsolute(string projectRelativePath)
            => ScriptPathPolicy.ResolveForWrite(projectRelativePath);

        private static InputActionMap RequireMap(InputActionAsset asset, string path, string mapName)
        {
            var map = asset.FindActionMap(mapName);
            if (map == null)
                throw new ToolException("NotFound",
                    $"No action map '{mapName}' in '{path}'.");
            return map;
        }

        private static InputAction RequireAction(InputActionMap map, string actionName)
        {
            var action = map.FindAction(actionName);
            if (action == null)
                throw new ToolException("NotFound",
                    $"No action '{actionName}' in map '{map.name}'.");
            return action;
        }

        private static string RequireString(JObject @params, string key, string action)
        {
            var v = @params.Value<string>(key);
            if (string.IsNullOrWhiteSpace(v))
                throw new ToolException("InvalidInput", $"'{key}' is required for action={action}.");
            return v;
        }

        private static InputActionType ParseActionType(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return InputActionType.Button;
            if (Enum.TryParse<InputActionType>(raw, ignoreCase: true, out var t)) return t;
            throw new ToolException("InvalidInput",
                $"'type' must be Button|Value|PassThrough; got '{raw}'.");
        }
#else
        public static ToolResult CreateAsset(JObject @params) => throw NotInstalled();
        public static ToolResult AddMap(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();
        public static ToolResult AddAction(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();
        public static ToolResult AddBinding(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();
        public static ToolResult RemoveMap(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();
        public static ToolResult RemoveAction(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();
        public static ToolResult RemoveBinding(JObject @params, Func<JObject, object> resolve, Func<JObject, ToolResult> inspect) => throw NotInstalled();

        private static ToolException NotInstalled() => new ToolException("InvalidInput",
            "manage_input write actions require com.unity.inputsystem (≥1.0.0).");
#endif
    }
}
