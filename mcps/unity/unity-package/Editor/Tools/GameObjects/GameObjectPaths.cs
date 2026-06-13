using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Hierarchy-path utilities. Keeps the "/Root/Child/Leaf" formatting consistent
    /// across go_create / go_find / go_delete / go_serialize.
    /// </summary>
    internal static class GameObjectPaths
    {
        public static string HierarchyPath(GameObject go)
        {
            if (go == null) return string.Empty;
            var t = go.transform;
            var stack = new Stack<string>();
            while (t != null)
            {
                stack.Push(t.name);
                t = t.parent;
            }
            return "/" + string.Join("/", stack);
        }
    }
}
