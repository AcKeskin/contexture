using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Guards against mixing UI Toolkit and UGUI within the same screen hierarchy.
    ///
    /// Unity forbids nesting UGUI content under a UI Toolkit UIDocument, and placing
    /// VisualElements / UIDocument GameObjects under a UGUI Canvas hierarchy produces
    /// undefined, broken behaviour. Both methods walk the full ancestor chain
    /// (inclusive of the target itself) so the check is exhaustive regardless of
    /// how deeply nested the target sits.
    ///
    /// Call <see cref="AssertNotUnderCanvas"/> before adding any UI Toolkit element
    /// (UIDocument host or UITK-managed child). Call <see cref="AssertNotUnderUIDocument"/>
    /// before adding UGUI content (Image, Text, Button, etc.).
    /// </summary>
    internal static class UiSystemGuard
    {
        /// <summary>
        /// Throws <see cref="ToolException"/> if <paramref name="target"/> or any ancestor
        /// in its parent chain carries a <see cref="Canvas"/> or a UGUI <see cref="Graphic"/>
        /// component, which would mean the target is inside a UGUI hierarchy.
        ///
        /// A null <paramref name="target"/> is treated as scene-root placement and passes
        /// without error, because there is nothing to violate.
        /// </summary>
        /// <param name="target">The GameObject that will receive a UI Toolkit element.</param>
        /// <exception cref="ToolException">
        /// Code <c>InvalidInput</c> — a UI Toolkit element cannot be placed under a UGUI Canvas
        /// hierarchy; UITK and UGUI cannot be mixed within one screen.
        /// </exception>
        public static void AssertNotUnderCanvas(GameObject target)
        {
            if (target == null) return;

            if (AncestorHasComponent<Canvas>(target))
            {
                throw new ToolException(
                    "InvalidInput",
                    $"A UI Toolkit element cannot be placed under a UGUI Canvas hierarchy — " +
                    $"UITK and UGUI cannot be mixed within one screen. " +
                    $"GameObject '{target.name}' or one of its ancestors carries a Canvas component.");
            }

            if (AncestorHasComponent<Graphic>(target))
            {
                throw new ToolException(
                    "InvalidInput",
                    $"A UI Toolkit element cannot be placed under a UGUI Canvas hierarchy — " +
                    $"UITK and UGUI cannot be mixed within one screen. " +
                    $"GameObject '{target.name}' or one of its ancestors carries a UGUI Graphic component.");
            }
        }

        /// <summary>
        /// Throws <see cref="ToolException"/> if <paramref name="target"/> or any ancestor
        /// in its parent chain carries a <see cref="UIDocument"/> component, which would
        /// mean UGUI content is being inserted into a UI Toolkit hierarchy.
        ///
        /// A null <paramref name="target"/> is treated as scene-root placement and passes
        /// without error, because there is nothing to violate.
        /// </summary>
        /// <param name="target">The GameObject that will receive UGUI content.</param>
        /// <exception cref="ToolException">
        /// Code <c>InvalidInput</c> — UGUI content cannot be placed under a UI Toolkit
        /// UIDocument; the two systems cannot be mixed within one screen.
        /// </exception>
        public static void AssertNotUnderUIDocument(GameObject target)
        {
            if (target == null) return;

            if (AncestorHasComponent<UIDocument>(target))
            {
                throw new ToolException(
                    "InvalidInput",
                    $"UGUI content cannot be placed under a UI Toolkit UIDocument — " +
                    $"the two systems cannot be mixed within one screen. " +
                    $"GameObject '{target.name}' or one of its ancestors carries a UIDocument component.");
            }
        }

        /// <summary>
        /// Returns <see langword="true"/> if <paramref name="go"/> itself, or any ancestor
        /// reachable via <c>transform.parent</c>, carries a component of type
        /// <typeparamref name="T"/>. Traversal terminates when <c>transform.parent</c>
        /// is null (scene root reached) or when the component is found.
        /// </summary>
        private static bool AncestorHasComponent<T>(GameObject go) where T : Component
        {
            Transform current = go.transform;
            while (current != null)
            {
                if (current.GetComponent<T>() != null)
                    return true;
                current = current.parent;
            }
            return false;
        }
    }
}
