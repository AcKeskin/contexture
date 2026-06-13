using System;
using System.Reflection;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// Shared TextMeshPro reflection helpers for the UGUI tools. TMP types are resolved
    /// from the <c>Unity.TextMeshPro</c> assembly at runtime so the package takes no hard
    /// asmdef reference on a package that is technically optional.
    ///
    /// This helper deliberately exposes the *mechanism* (resolve a type, read the default
    /// font, set a member by name) and leaves *policy* to the caller — `ui_create_text`
    /// throws when TMP is absent (it is a TMP-only tool), while `ugui_create_button` falls
    /// back to legacy Text. Both consume these primitives; neither inherits the other's
    /// failure policy. Extracted once a second caller (the button factory) appeared, per the
    /// two-caller rule — it earns its keep across UiCreateTextTool + UguiCreateButtonTool.
    /// </summary>
    internal static class TmpReflection
    {
        public const string TmpAssembly = "Unity.TextMeshPro";

        /// <summary>Resolves a TMP type by short name (e.g. "TextMeshProUGUI", "TMP_Settings",
        /// "TextAlignmentOptions"), or null if TMP is not present.</summary>
        public static Type ResolveType(string shortName)
        {
            return Type.GetType($"TMPro.{shortName}, {TmpAssembly}", throwOnError: false);
        }

        /// <summary>
        /// Reads <c>TMPro.TMP_Settings.defaultFontAsset</c> via reflection. Returns null when
        /// TMP is uninitialized (no default font imported) or the type is unavailable. Caller
        /// decides whether null is fatal (text tool) or a fallback trigger (button tool).
        /// </summary>
        public static UnityEngine.Object GetDefaultFontOrNull()
        {
            var tmpSettings = ResolveType("TMP_Settings");
            if (tmpSettings == null) return null;
            try
            {
                var prop = tmpSettings.GetProperty("defaultFontAsset", BindingFlags.Public | BindingFlags.Static);
                return prop?.GetValue(null) as UnityEngine.Object;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Parses an enum value on a TMP enum type by name (case/dash-insensitive via the
        /// caller's normalization), or null if the type or value can't be resolved.
        /// </summary>
        public static object ParseEnum(string enumShortName, string value)
        {
            var enumType = ResolveType(enumShortName);
            if (enumType == null || string.IsNullOrEmpty(value)) return null;
            try
            {
                return Enum.Parse(enumType, value, ignoreCase: true);
            }
            catch (ArgumentException)
            {
                return null;
            }
        }

        /// <summary>
        /// Sets a public property or field by name on a component via reflection. Used because
        /// TMP components are held as <see cref="Component"/> (resolved by reflection, not a
        /// compile-time type). A missing member logs a warning rather than throwing — a typo on
        /// one property should not abort an otherwise-successful element creation.
        /// </summary>
        public static void SetMember(Component target, string memberName, object value, string toolTag)
        {
            var t = target.GetType();
            var prop = t.GetProperty(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                prop.SetValue(target, value);
                return;
            }
            var field = t.GetField(memberName, BindingFlags.Public | BindingFlags.Instance);
            if (field != null)
            {
                field.SetValue(target, value);
                return;
            }
            Debug.LogWarning($"[{toolTag}] Could not set '{memberName}' on {t.Name} (no public property or field).");
        }
    }
}
