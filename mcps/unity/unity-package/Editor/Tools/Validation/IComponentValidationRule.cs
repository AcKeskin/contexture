using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// One rule per MRTK 3 invariant we care to surface to the agent. Discovery
    /// happens in <see cref="Mrtk3ValidateComponentTool"/> via reflection over
    /// the package's Editor assembly — same pattern as ToolRegistry.
    /// </summary>
    internal interface IComponentValidationRule
    {
        /// <summary>Short MRTK 3 type name this rule applies to (e.g. "PressableButton").
        /// The validator dispatches to all rules whose AppliesTo matches the target's
        /// type or any base type / interface.</summary>
        string AppliesTo { get; }

        /// <summary>Run the rule. Returns zero or more findings. Empty == valid.</summary>
        IEnumerable<ValidationFinding> Apply(Component target);
    }

    /// <summary>One emitted by a validation rule.</summary>
    internal readonly struct ValidationFinding
    {
        public string Severity { get; } // "error" | "warning"
        public string Message { get; }
        public string FixHint { get; }
        public string RuleName { get; }

        public ValidationFinding(string severity, string message, string fixHint, string ruleName)
        {
            Severity = severity;
            Message = message;
            FixHint = fixHint;
            RuleName = ruleName;
        }
    }
}
