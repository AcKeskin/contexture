using System;

namespace UnityMcp.Editor.Capabilities
{
    /// <summary>
    /// Sealed identifier for an Editor capability — a package, render-pipeline, or
    /// subsystem that tools can declare a dependency on via
    /// <c>UnityMcpToolAttribute.Requires</c>. Wire format is the lowercase string
    /// returned by <see cref="ToWireString"/>; the enum keeps the C#-side closed.
    /// Public so custom tools can declare <c>Requires = new[] { CapabilityKey.Xri }</c>.
    /// </summary>
    public enum CapabilityKey
    {
        Xri,
        Mrtk,
        Urp,
        Hdrp,
        Builtin,
        TestFramework,
        XriHands,
        XriEyeGaze,
        Ugui,
    }

    internal static class CapabilityKeyExtensions
    {
        public static string ToWireString(this CapabilityKey key)
        {
            switch (key)
            {
                case CapabilityKey.Xri: return "xri";
                case CapabilityKey.Mrtk: return "mrtk";
                case CapabilityKey.Urp: return "urp";
                case CapabilityKey.Hdrp: return "hdrp";
                case CapabilityKey.Builtin: return "builtin";
                case CapabilityKey.TestFramework: return "testFramework";
                case CapabilityKey.XriHands: return "xri.hands";
                case CapabilityKey.XriEyeGaze: return "xri.eyeGaze";
                case CapabilityKey.Ugui: return "ugui";
                default: throw new ArgumentOutOfRangeException(nameof(key), key, "Unknown CapabilityKey");
            }
        }

    }
}
