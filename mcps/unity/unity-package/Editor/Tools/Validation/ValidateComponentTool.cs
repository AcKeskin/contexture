using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Tools.Mrtk3;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Runs the active set of validation rules against a target component.
    /// Rules are discovered by reflection over the package's Editor assembly —
    /// each implements <see cref="IComponentValidationRule"/> and declares an
    /// <see cref="IComponentValidationRule.AppliesTo"/> short type name. The
    /// validator dispatches to every rule whose AppliesTo matches the
    /// target's type, any base type, or any implemented interface — MRTK 3
    /// types AND Unity engine types alike. The MRTK-only gate from earlier
    /// versions has been removed.
    ///
    /// The corpus is MRTK-heavy today (buttons, hand menus, object
    /// manipulators, bounds controls, sliders, toggle collections, solver
    /// handlers, stateful interactables) and also includes engine-type
    /// rules (worldSpace Canvas scale convention). Future engine-type rules
    /// (RectTransformAnchorsSane, CameraDepthSane, etc.) drop into the same
    /// corpus.
    /// </summary>
    [UnityMcpTool("validate_component")]
    internal sealed class ValidateComponentTool : IUnityMcpTool
    {
        public string Name => "validate_component";

        public string Description =>
            "Run validation rules against any component — MRTK 3 or Unity-engine. " +
            "Returns { componentInstanceId, componentType, rulesEvaluated, findings:[ " +
            "{ severity ('error'|'warning'), message, fixHint, ruleName } ] }. Empty " +
            "findings array means no rule matched OR matched rules emitted no findings. " +
            "Pass any componentInstanceId — the dispatcher fires whichever rules match " +
            "the type chain. Non-MRTK components with no matching rule are a graceful " +
            "no-op (rulesEvaluated=0), not an error.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(ValidationDispatcher.Run(id));
        }
    }

    /// <summary>
    /// Shared dispatcher used by <see cref="ValidateComponentTool"/> and the
    /// deprecated <see cref="Mrtk3.Mrtk3ValidateComponentTool"/> alias. Rule
    /// discovery is reflection-based over the package's Editor assembly,
    /// cached behind a Lazy that re-fires on each domain reload.
    /// </summary>
    internal static class ValidationDispatcher
    {
        private static readonly Lazy<List<IComponentValidationRule>> _rules = new(DiscoverRules);

        public static ToolResult Run(int componentInstanceId)
        {
            var comp = InstanceIdResolver.ComponentOrThrow(componentInstanceId);

            var findings = new JArray();
            int rulesRun = 0;
            foreach (var rule in _rules.Value)
            {
                if (!Matches(comp, rule.AppliesTo)) continue;
                rulesRun++;
                IEnumerable<ValidationFinding> ruleFindings;
                try
                {
                    ruleFindings = rule.Apply(comp);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityMCP] validation rule '{rule.GetType().Name}' threw: {ex.Message}");
                    continue;
                }
                foreach (var f in ruleFindings)
                {
                    findings.Add(new JObject
                    {
                        ["severity"] = f.Severity,
                        ["message"] = f.Message,
                        ["fixHint"] = f.FixHint,
                        ["ruleName"] = f.RuleName,
                    });
                }
            }

            var data = new JObject
            {
                ["componentInstanceId"] = componentInstanceId,
                ["componentType"] = comp.GetType().Name,
                ["rulesEvaluated"] = rulesRun,
                ["findings"] = findings,
            };
            return ToolResult.Json(data);
        }

        private static bool Matches(Component comp, string appliesTo)
        {
            // Walk type chain; match by short or full name.
            for (var t = comp.GetType(); t != null && t != typeof(object); t = t.BaseType)
            {
                if (t.Name == appliesTo || t.FullName == appliesTo) return true;
            }
            // Also try interface matches — rules may target an interface short name.
            foreach (var i in comp.GetType().GetInterfaces())
            {
                if (i.Name == appliesTo || i.FullName == appliesTo) return true;
            }
            return false;
        }

        private static List<IComponentValidationRule> DiscoverRules()
        {
            var rules = new List<IComponentValidationRule>();
            var asm = typeof(ValidationDispatcher).Assembly;
            Type[] types;
            try { types = asm.GetTypes(); }
            catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
            foreach (var t in types)
            {
                if (t == null || t.IsAbstract || t.IsInterface) continue;
                if (!typeof(IComponentValidationRule).IsAssignableFrom(t)) continue;
                try
                {
                    rules.Add((IComponentValidationRule)Activator.CreateInstance(t));
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityMCP] failed to instantiate validation rule {t.FullName}: {ex.Message}");
                }
            }
            return rules;
        }
    }
}
