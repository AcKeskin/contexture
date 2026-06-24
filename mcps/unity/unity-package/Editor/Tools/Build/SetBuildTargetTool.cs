using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Switches the active build target among INSTALLED targets (does not install platform
    /// modules — out of scope). Validates the target name parses to a <see cref="BuildTarget"/>
    /// and that the module is installed, then calls
    /// <c>EditorUserBuildSettings.SwitchActiveBuildTarget</c>.
    ///
    /// The switch triggers a domain reload / reimport — the bridge already survives reloads
    /// (port persisted, rebind via ReloadHandler, tools/list_changed emitted), so the connection
    /// is not stranded. The result carries a 'warning' to that effect.
    /// </summary>
    [UnityMcpTool("set_build_target")]
    internal sealed class SetBuildTargetTool : IUnityMcpTool
    {
        public string Name => "set_build_target";

        public string Description =>
            "Switch the active build target among INSTALLED targets. Required 'target' = a " +
            "BuildTarget enum name (e.g. 'StandaloneWindows64', 'Android', 'iOS'). Validates the " +
            "name and that the module is installed (does NOT install modules). Returns " +
            "{ previous, current, switched, warning }. The switch triggers a domain reload / " +
            "reimport (the bridge survives it). Throws ToolException('InvalidInput') for an " +
            "unknown target name or an uninstalled target.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["target"] = new JObject
                {
                    ["type"] = "string",
                },
            },
            ["required"] = new JArray { "target" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var targetName = @params.Value<string>("target");
            if (string.IsNullOrWhiteSpace(targetName))
                throw new ToolException("InvalidInput", "'target' is required.");

            if (!Enum.TryParse<BuildTarget>(targetName, ignoreCase: false, out var target)
                || !Enum.IsDefined(typeof(BuildTarget), target))
            {
                throw new ToolException("InvalidInput",
                    $"unknown build target '{targetName}'. Use a BuildTarget enum name like 'StandaloneWindows64' or 'Android'.");
            }

            var group = BuildPipeline.GetBuildTargetGroup(target);
            if (!BuildPipeline.IsBuildTargetSupported(group, target))
            {
                throw new ToolException("InvalidInput",
                    $"build target not installed: '{targetName}'. Install the platform module via the Unity Hub first (set_build_target does not install modules).");
            }

            var previous = EditorUserBuildSettings.activeBuildTarget;
            if (previous == target)
            {
                return Task.FromResult(ToolResult.Json(new JObject
                {
                    ["previous"] = previous.ToString(),
                    ["current"] = target.ToString(),
                    ["switched"] = false,
                    ["warning"] = "Target already active — no switch performed.",
                }));
            }

            bool switched = EditorUserBuildSettings.SwitchActiveBuildTarget(group, target);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["previous"] = previous.ToString(),
                ["current"] = EditorUserBuildSettings.activeBuildTarget.ToString(),
                ["switched"] = switched,
                ["warning"] = "Switching the active build target triggers a domain reload / asset reimport; the active target may settle on the next editor tick.",
            }));
        }
    }
}
