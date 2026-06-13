using System;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools
{
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class UnityMcpToolAttribute : Attribute
    {
        public string Name { get; }

        /// <summary>
        /// Capability keys this tool requires to be active before it surfaces in
        /// <c>tools/list</c>. Empty (default) → always surfaces. All keys must be
        /// present in the live <see cref="CapabilitySet"/> for the tool to appear.
        /// </summary>
        public CapabilityKey[] Requires { get; set; } = Array.Empty<CapabilityKey>();

        public UnityMcpToolAttribute(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("Tool name is required.", nameof(name));
            }
            Name = name;
        }
    }
}
