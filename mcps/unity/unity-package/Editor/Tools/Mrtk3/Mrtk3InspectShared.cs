using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Shared shape for the mrtk3_inspect_* tools — verify the component is the
    /// expected MRTK type, then return a uniform JSON envelope wrapping its
    /// serialized fields. Keeps each per-component inspector tool to ~30 lines
    /// of schema + dispatch.
    ///
    /// Three layered helpers:
    /// - <see cref="ComponentInstanceIdSchema"/>: the input-schema literal.
    /// - <see cref="ResolveAndBuild"/>: instanceId → Component + envelope JObject.
    ///   Used by tools that need to mutate the envelope (Solver adds resolvedType,
    ///   StateVisualizer adds drivenChildren) before wrapping.
    /// - <see cref="InspectByType"/>: the simple form — wraps ResolveAndBuild
    ///   directly into a ToolResult. Used by inspectors that don't extend the
    ///   envelope.
    /// </summary>
    internal static class Mrtk3InspectShared
    {
        /// <summary>The standard input-schema literal for the mrtk3_inspect_* tools —
        /// a single required componentInstanceId integer. Centralised so adding new
        /// inspectors doesn't keep re-writing the same JObject.</summary>
        public static JObject ComponentInstanceIdSchema() => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "componentInstanceId" },
            ["additionalProperties"] = false,
        };

        /// <summary>
        /// Build the envelope JObject directly from a resolved Component +
        /// declared short type name. Caller can mutate the JObject in place
        /// (add resolvedType / drivenChildren etc.) before wrapping in a
        /// ToolResult. Does NOT type-check the component — the caller has
        /// already done so via <see cref="ResolveAndBuild"/> or by walking
        /// a dispatch table.
        /// </summary>
        public static JObject BuildEnvelopeJson(Component comp, string typeName)
        {
            return new JObject
            {
                ["componentInstanceId"] = comp.GetInstanceID(),
                ["gameObjectInstanceId"] = comp.gameObject.GetInstanceID(),
                ["type"] = typeName,
                ["typeFullName"] = comp.GetType().FullName,
                ["enabled"] = ReadEnabled(comp),
                ["fields"] = SerializedFieldDumper.DumpComponent(comp, new HashSet<int>()),
            };
        }

        /// <summary>
        /// Resolve a componentInstanceId, type-check it, and build the envelope.
        /// Throws ToolException("InvalidInput") on either resolution or type-check
        /// failure — callers don't need to wrap the result.
        /// </summary>
        public static (Component comp, JObject envelope) ResolveAndBuild(int componentInstanceId, string mrtkTypeShortName)
        {
            var comp = InstanceIdResolver.ComponentOrThrow(componentInstanceId);
            if (!Mrtk3Types.IsInstanceOf(comp, mrtkTypeShortName))
            {
                throw new ToolException("InvalidInput",
                    $"componentInstanceId {componentInstanceId} is {comp.GetType().Name}, not a {mrtkTypeShortName}.");
            }
            return (comp, BuildEnvelopeJson(comp, comp.GetType().Name));
        }

        public static ToolResult InspectByType(int componentInstanceId, string mrtkTypeShortName)
        {
            var (_, envelope) = ResolveAndBuild(componentInstanceId, mrtkTypeShortName);
            return ToolResult.Json(envelope);
        }

        /// <summary>
        /// Allowlist for <see cref="Mrtk3InspectStateVisualizerTool"/>'s
        /// drivenChildren walk: components MRTK 3 typically drives via state
        /// changes. Engine types matched by short name (avoids hard refs on
        /// optional packages like UGUI / TMP); MRTK types matched by assembly.
        /// </summary>
        public static bool IsDrivenComponentType(Component comp)
        {
            if (comp == null) return false;
            var name = comp.GetType().Name;
            switch (name)
            {
                case "Animator":
                case "SpriteRenderer":
                case "MeshRenderer":
                case "AudioSource":
                case "Image":          // UnityEngine.UI.Image (UGUI)
                case "RawImage":       // UnityEngine.UI.RawImage
                case "TMP_Text":       // TMPro.TMP_Text base
                case "TextMeshPro":
                case "TextMeshProUGUI":
                    return true;
            }
            return Mrtk3Types.IsMrtkAssembly(comp.GetType().Assembly.GetName().Name);
        }

        private static bool ReadEnabled(Component comp)
        {
            // Behaviour.enabled is the common path; non-Behaviour components don't have it.
            if (comp is Behaviour beh) return beh.enabled;
            return true;
        }
    }
}
