using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Tools.GameObjects;

namespace UnityMcp.Editor.Tools.Diff
{
    /// <summary>
    /// Computes a flat leaf-level difference between two GameObjects (or any two serialized JSON
    /// dumps) using the full-fidelity serializer. The result is a list of { path, before, after }
    /// entries — one per differing leaf, keyed by a fully-qualified dotted/indexed path. "Flat"
    /// means one entry per leaf, NOT shallow: nested AnimationCurve / Gradient / ManagedReference
    /// leaves each get their own path, so the delta is lossless yet linearly scannable.
    ///
    /// Pure structural delta over serializer output — no Unity API beyond the dumper used to
    /// produce the two trees. Used by prefab_diff (instance vs linked asset) and go_diff (two
    /// arbitrary GameObjects).
    /// </summary>
    internal static class StructuralDiff
    {
        /// <summary>Diffs two GameObjects at full fidelity. 'depth' bounds child expansion,
        /// matching go_serialize_full.</summary>
        public static JArray DiffGameObjects(GameObject a, GameObject b, int depth)
        {
            var dumpA = FullDump.SerializeGo(a, depth);
            var dumpB = FullDump.SerializeGo(b, depth);
            return DiffTokens(dumpA, dumpB);
        }

        /// <summary>Diffs two already-serialized JSON trees. Exposed for unit testing the delta
        /// logic without a live scene.</summary>
        public static JArray DiffTokens(JToken before, JToken after)
        {
            var diffs = new JArray();
            Walk(string.Empty, before, after, diffs);
            return diffs;
        }

        private static void Walk(string path, JToken before, JToken after, JArray diffs)
        {
            // Both objects → recurse over the union of keys.
            if (before is JObject ob && after is JObject oa)
            {
                var keys = new SortedSet<string>();
                foreach (var p in ob.Properties()) keys.Add(p.Name);
                foreach (var p in oa.Properties()) keys.Add(p.Name);
                foreach (var key in keys)
                {
                    var childPath = path.Length == 0 ? key : path + "." + key;
                    Walk(childPath, ob[key], oa[key], diffs);
                }
                return;
            }

            // Both arrays → recurse element-wise; length differences surface as added/removed leaves.
            if (before is JArray ab && after is JArray aa)
            {
                int max = ab.Count > aa.Count ? ab.Count : aa.Count;
                for (int i = 0; i < max; i++)
                {
                    var childPath = $"{path}[{i}]";
                    var bElem = i < ab.Count ? ab[i] : null;
                    var aElem = i < aa.Count ? aa[i] : null;
                    Walk(childPath, bElem, aElem, diffs);
                }
                return;
            }

            // Leaf (or shape mismatch) → compare by JSON value equality.
            if (!JToken.DeepEquals(before, after))
            {
                diffs.Add(new JObject
                {
                    ["path"] = path,
                    ["before"] = before == null ? JValue.CreateNull() : before.DeepClone(),
                    ["after"] = after == null ? JValue.CreateNull() : after.DeepClone(),
                });
            }
        }
    }
}
