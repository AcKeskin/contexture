using System.Text.RegularExpressions;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Holds the USS unsupported-property table and validates USS text against it.
    /// Source of truth: architectural-rules/unity/uitoolkit-uss-limits.md.
    /// The unsupported list is stable across Unity 2022.3 → Unity 6; no automated
    /// reconciliation (accepted at v1).
    /// </summary>
    internal static class UssSupport
    {
        // ---------------------------------------------------------------------------
        // Unsupported-property table
        // Each entry is (pattern, humanReadableProperty, workaround).
        // Patterns are applied case-insensitively against the full USS text after
        // whitespace normalisation. Order matters: more specific entries first so
        // "display: grid" is caught before any generic display check.
        // ---------------------------------------------------------------------------

        private static readonly UssRule[] _rules = new UssRule[]
        {
            // 1. display: grid
            new UssRule(
                @"display\s*:\s*grid\b",
                "display: grid",
                "Flex with flex-direction: row + flex-wrap: wrap and explicit child widths."),

            // 2. box-shadow
            new UssRule(
                @"box-shadow\s*:",
                "box-shadow",
                "Add a child VisualElement behind the content with offset + alpha background."),

            // 3. linear-gradient() / radial-gradient()
            new UssRule(
                @"(linear|radial)-gradient\s*\(",
                "linear-gradient() / radial-gradient()",
                "Use a sliced background image texture."),

            // 4. calc()
            new UssRule(
                @"calc\s*\(",
                "calc()",
                "Compute the value in C# and set the inline style, or use explicit values."),

            // 5. @media
            new UssRule(
                @"@media\b",
                "@media",
                "PanelSettings.scaleMode = ScaleWithScreenSize + reference resolution. Branch in C# if you need device-class behavior."),

            // 6. ::before / ::after  (pseudo-elements)
            new UssRule(
                @"::(before|after)\b",
                "::before / ::after",
                "Add a real child VisualElement with absolute positioning."),

            // 7. z-index
            new UssRule(
                @"z-index\s*:",
                "z-index",
                "Render order is sibling order. Move the element later in the parent's children, or BringToFront() in C#."),

            // 8. display: block / display: inline
            // Must NOT flag display: flex or display: none (supported).
            // Positive match: display followed by block or inline (as whole words).
            new UssRule(
                @"display\s*:\s*(block|inline)\b",
                "display: block / display: inline",
                "Everything is flex. Use display: flex (default) or display: none."),
        };

        // ---------------------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------------------

        /// <summary>
        /// Scans <paramref name="uss"/> for the first unsupported CSS property or
        /// function and returns a <see cref="UssViolation"/> describing it, or
        /// <see langword="null"/> when the content is clean.
        /// </summary>
        /// <param name="uss">Raw USS text to validate.</param>
        /// <returns>
        /// A <see cref="UssViolation"/> containing the offending token and a
        /// recommended workaround, or <see langword="null"/> if no violations are
        /// found.
        /// </returns>
        public static UssViolation Validate(string uss)
        {
            if (string.IsNullOrWhiteSpace(uss))
                return null;

            foreach (var rule in _rules)
            {
                if (rule.CompiledPattern.IsMatch(uss))
                    return new UssViolation(rule.Property, rule.Workaround);
            }

            return null;
        }

        // ---------------------------------------------------------------------------
        // Private helpers
        // ---------------------------------------------------------------------------

        private sealed class UssRule
        {
            internal readonly Regex CompiledPattern;
            internal readonly string Property;
            internal readonly string Workaround;

            internal UssRule(string pattern, string property, string workaround)
            {
                CompiledPattern = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Compiled);
                Property = property;
                Workaround = workaround;
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Result type
    // ---------------------------------------------------------------------------

    /// <summary>
    /// Describes a single USS validation failure: the unsupported property or
    /// function that was detected and the recommended workaround.
    /// </summary>
    internal sealed class UssViolation
    {
        /// <summary>The unsupported CSS property or function token (e.g. "box-shadow").</summary>
        public string Property { get; }

        /// <summary>Human-readable workaround advice sourced from uitoolkit-uss-limits.md.</summary>
        public string Workaround { get; }

        internal UssViolation(string property, string workaround)
        {
            Property = property;
            Workaround = workaround;
        }
    }
}
