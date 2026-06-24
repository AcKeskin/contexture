using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Shared full-fidelity GameObject serializer. Produces the same tree as go_serialize but with
    /// complex types (AnimationCurve / Gradient / ManagedReference / ExposedReference) serialized in
    /// full via SerializedFieldDumper's fullFidelity path. Extracted so go_serialize_full and the
    /// diff engine (StructuralDiff, consumed by prefab_diff / go_diff) share ONE traversal rather
    /// than duplicating it. Cycles broken via a visited-set on instance ID.
    /// </summary>
    internal static class FullDump
    {
        public static JObject SerializeGo(GameObject go, int remainingDepth, bool includeFields = true)
        {
            return SerializeGo(go, remainingDepth, includeFields, new HashSet<int>());
        }

        public static JObject SerializeGo(GameObject go, int remainingDepth, bool includeFields, HashSet<int> visited)
        {
            int id = go.GetInstanceID();
            if (visited.Contains(id))
            {
                return new JObject
                {
                    ["$cycle"] = id,
                    ["name"] = go.name ?? string.Empty,
                };
            }
            visited.Add(id);

            var t = go.transform;
            var components = new JArray();
            foreach (var c in go.GetComponents<Component>())
            {
                if (c == null)
                {
                    components.Add(new JObject { ["type"] = "<missing>", ["instanceId"] = 0 });
                    continue;
                }

                var compEntry = new JObject
                {
                    ["type"] = c.GetType().Name,
                    ["instanceId"] = c.GetInstanceID(),
                };
                if (includeFields)
                {
                    compEntry["fields"] = SerializedFieldDumper.DumpComponent(c, visited, fullFidelity: true);
                }
                else
                {
                    compEntry["fieldCount"] = SerializedFieldDumper.CountFields(c);
                }
                components.Add(compEntry);
            }

            var children = new JArray();
            if (remainingDepth > 0)
            {
                for (int i = 0; i < t.childCount; i++)
                {
                    children.Add(SerializeGo(t.GetChild(i).gameObject, remainingDepth - 1, includeFields, visited));
                }
            }

            return new JObject
            {
                ["instanceId"] = id,
                ["name"] = go.name ?? string.Empty,
                ["path"] = GameObjectPaths.HierarchyPath(go),
                ["activeSelf"] = go.activeSelf,
                ["activeInHierarchy"] = go.activeInHierarchy,
                ["transform"] = new JObject
                {
                    ["localPosition"] = Vector3Json.ToJson(t.localPosition),
                    ["localRotation"] = Vector3Json.ToJson(t.localRotation),
                    ["localScale"] = Vector3Json.ToJson(t.localScale),
                },
                ["components"] = components,
                ["childCount"] = t.childCount,
                ["children"] = children,
                ["depthRemaining"] = remainingDepth,
            };
        }
    }
}
