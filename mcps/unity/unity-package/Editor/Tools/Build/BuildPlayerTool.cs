using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Kicks a player build for the active build target and returns a poll handle immediately —
    /// the build itself runs on a later main-thread tick via <see cref="BuildJobRegistry"/>, so
    /// this call returns in milliseconds rather than holding the MCP wire open for the
    /// multi-minute build. Poll <c>build_status(buildHandle)</c> for the result.
    ///
    /// Builds <see cref="BuildPlayerOptions"/> from the enabled <c>EditorBuildSettings.scenes</c>,
    /// the requested output path, and the active target. Options map: developmentBuild →
    /// <c>BuildOptions.Development</c>, scriptDebugging → <c>BuildOptions.AllowDebugging</c>.
    /// </summary>
    [UnityMcpTool("build_player")]
    internal sealed class BuildPlayerTool : IUnityMcpTool
    {
        public string Name => "build_player";

        public string Description =>
            "Kick a player build for the ACTIVE build target and return a poll handle " +
            "immediately (the build runs async on a later Editor tick — this call does NOT " +
            "block for the build). Required 'outputPath' (project-relative or absolute build " +
            "dir). Optional 'options': { developmentBuild?:bool (default false), " +
            "scriptDebugging?:bool (default false) }. Builds from the ENABLED " +
            "EditorBuildSettings.scenes for the active target. Returns { buildHandle, " +
            "status:'running' }. Poll build_status(buildHandle) for { running|succeeded|failed } " +
            "+ the BuildReport summary. Errors with ToolException('InvalidInput') when " +
            "outputPath is empty or no scene is enabled in the build list.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["outputPath"] = new JObject
                {
                    ["type"] = "string",
                },
                ["options"] = new JObject
                {
                    ["type"] = "object",
                    ["properties"] = new JObject
                    {
                        ["developmentBuild"] = new JObject
                        {
                            ["type"] = "boolean",
                            ["default"] = false,
                        },
                        ["scriptDebugging"] = new JObject
                        {
                            ["type"] = "boolean",
                            ["default"] = false,
                        },
                    },
                    ["additionalProperties"] = false,
                },
            },
            ["required"] = new JArray { "outputPath" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var outputPath = @params.Value<string>("outputPath");
            if (string.IsNullOrWhiteSpace(outputPath))
                throw new ToolException("InvalidInput", "'outputPath' is required.");

            // Resolve to an absolute, canonical path up front. BuildPipeline.BuildPlayer writes
            // wherever this points, so we normalize away traversal tokens ("..", "~") rather than
            // pass an ambiguous relative/escape string straight to a filesystem-write API. We do
            // NOT jail to the project root — builds legitimately target sibling/CI output dirs —
            // but the resolved path is explicit, so a surprising "../../elsewhere" collapses to a
            // concrete location the caller can see in the result instead of an opaque write.
            string resolvedOutputPath;
            try
            {
                resolvedOutputPath = System.IO.Path.GetFullPath(outputPath);
            }
            catch (System.Exception ex)
            {
                throw new ToolException("InvalidInput", $"outputPath is not a valid path: {ex.Message}");
            }
            outputPath = resolvedOutputPath;

            var enabledScenes = new List<string>();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                if (scene.enabled && !string.IsNullOrEmpty(scene.path))
                    enabledScenes.Add(scene.path);
            }
            if (enabledScenes.Count == 0)
                throw new ToolException("InvalidInput",
                    "No enabled scenes in EditorBuildSettings — add at least one enabled scene before building (build_scenes_set).");

            var opts = @params["options"] as JObject ?? new JObject();
            bool developmentBuild = opts.Value<bool?>("developmentBuild") ?? false;
            bool scriptDebugging = opts.Value<bool?>("scriptDebugging") ?? false;

            var buildOptions = BuildOptions.None;
            if (developmentBuild) buildOptions |= BuildOptions.Development;
            if (scriptDebugging) buildOptions |= BuildOptions.AllowDebugging;

            var activeTarget = EditorUserBuildSettings.activeBuildTarget;
            var playerOptions = new BuildPlayerOptions
            {
                scenes = enabledScenes.ToArray(),
                locationPathName = outputPath,
                target = activeTarget,
                targetGroup = BuildPipeline.GetBuildTargetGroup(activeTarget),
                options = buildOptions,
            };

            var handle = BuildJobRegistry.Start(playerOptions);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["buildHandle"] = handle,
                ["status"] = "running",
                ["resolvedOutputPath"] = outputPath,
            }));
        }
    }
}
