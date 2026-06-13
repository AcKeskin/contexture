using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 StateVisualizer plus a one-level walk of
    /// the GameObject's direct children to surface components MRTK typically
    /// drives via state changes — Animator / SpriteRenderer / MeshRenderer /
    /// AudioSource / UGUI Image / TMP_Text / any MRTK type. The output adds a
    /// <c>drivenChildren</c> array whose entries each carry type, instanceId,
    /// gameObjectName.
    ///
    /// Walk depth is exactly one transform level — direct children only, no
    /// grandchildren. This matches the way MRTK's authors typically arrange
    /// StateVisualizer rigs (visualizer at the root, animation targets directly
    /// under it).
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_state_visualizer", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectStateVisualizerTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_state_visualizer";

        public string Description =>
            "Inspect an MRTK 3 StateVisualizer. Returns the standard envelope " +
            "PLUS a 'drivenChildren' array listing components on direct child " +
            "GameObjects that the visualizer typically drives via state changes " +
            "(Animator, SpriteRenderer, MeshRenderer, AudioSource, UGUI Image, " +
            "TMP_Text, plus any MRTK component). Walk depth: exactly one " +
            "transform level — grandchildren are not included.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");

            var (comp, envelope) = Mrtk3InspectShared.ResolveAndBuild(id, "StateVisualizer");

            var drivenChildren = new JArray();
            var t = comp.transform;
            for (int i = 0; i < t.childCount; i++)
            {
                var child = t.GetChild(i);
                foreach (var c in child.GetComponents<Component>())
                {
                    if (!Mrtk3InspectShared.IsDrivenComponentType(c)) continue;
                    drivenChildren.Add(new JObject
                    {
                        ["type"] = c.GetType().Name,
                        ["instanceId"] = c.GetInstanceID(),
                        ["gameObjectName"] = child.name,
                        ["gameObjectInstanceId"] = child.gameObject.GetInstanceID(),
                    });
                }
            }
            envelope["drivenChildren"] = drivenChildren;
            return Task.FromResult(ToolResult.Json(envelope));
        }
    }
}
