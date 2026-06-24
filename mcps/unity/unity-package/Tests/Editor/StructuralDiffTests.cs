using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityMcp.Editor.Tools.Diff;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Locks in the flat leaf-level delta of <see cref="StructuralDiff"/> (proposal prefab-control,
    /// criterion 8): two serialized JSON trees produce exactly one { path, before, after } entry per
    /// differing leaf, keyed by a fully-qualified dotted/indexed path. Tests the pure DiffTokens
    /// surface — no live scene required.
    /// </summary>
    [TestFixture]
    internal sealed class StructuralDiffTests
    {
        private static JObject DiffByPath(JArray diffs)
        {
            // Re-key the diff array by path for order-independent assertions.
            var byPath = new JObject();
            foreach (var d in diffs)
            {
                byPath[(string)d["path"]] = d;
            }
            return byPath;
        }

        [Test]
        public void IdenticalTrees_ProduceNoDifferences()
        {
            var a = new JObject { ["x"] = 1, ["y"] = new JObject { ["z"] = 2 } };
            var b = new JObject { ["x"] = 1, ["y"] = new JObject { ["z"] = 2 } };
            var diffs = StructuralDiff.DiffTokens(a, b);
            Assert.AreEqual(0, diffs.Count);
        }

        [Test]
        public void ChangedLeaf_ProducesOneEntryWithDottedPath()
        {
            var a = new JObject { ["transform"] = new JObject { ["mass"] = 1.0f } };
            var b = new JObject { ["transform"] = new JObject { ["mass"] = 2.0f } };
            var diffs = StructuralDiff.DiffTokens(a, b);
            Assert.AreEqual(1, diffs.Count);
            Assert.AreEqual("transform.mass", (string)diffs[0]["path"]);
            Assert.AreEqual(1.0f, (float)diffs[0]["before"]);
            Assert.AreEqual(2.0f, (float)diffs[0]["after"]);
        }

        [Test]
        public void NestedLeafInsideArray_IsFlatButFullyPathed()
        {
            // A nested leaf deep inside an array (mirrors an AnimationCurve key) gets a single
            // fully-qualified path — "flat" is lossless, not shallow.
            var a = new JObject { ["keys"] = new JArray(new JObject { ["time"] = 0.0f }) };
            var b = new JObject { ["keys"] = new JArray(new JObject { ["time"] = 0.5f }) };
            var diffs = StructuralDiff.DiffTokens(a, b);
            Assert.AreEqual(1, diffs.Count);
            Assert.AreEqual("keys[0].time", (string)diffs[0]["path"]);
        }

        [Test]
        public void MultipleDivergences_EachLeafIsSeparate()
        {
            var a = new JObject
            {
                ["name"] = "A",
                ["pos"] = new JObject { ["x"] = 0f, ["y"] = 0f },
                ["same"] = true,
            };
            var b = new JObject
            {
                ["name"] = "B",
                ["pos"] = new JObject { ["x"] = 5f, ["y"] = 0f },
                ["same"] = true,
            };
            var diffs = StructuralDiff.DiffTokens(a, b);
            var byPath = DiffByPath(diffs);
            Assert.AreEqual(2, diffs.Count, "only 'name' and 'pos.x' diverge");
            Assert.IsTrue(byPath["name"] != null);
            Assert.IsTrue(byPath["pos.x"] != null);
            Assert.AreEqual(5f, (float)byPath["pos.x"]["after"]);
        }

        [Test]
        public void AddedKey_SurfacesAsBeforeNull()
        {
            var a = new JObject { ["x"] = 1 };
            var b = new JObject { ["x"] = 1, ["extra"] = 9 };
            var diffs = StructuralDiff.DiffTokens(a, b);
            Assert.AreEqual(1, diffs.Count);
            Assert.AreEqual("extra", (string)diffs[0]["path"]);
            Assert.AreEqual(JTokenType.Null, diffs[0]["before"].Type);
            Assert.AreEqual(9, (int)diffs[0]["after"]);
        }

        [Test]
        public void ArrayLengthDifference_SurfacesMissingElement()
        {
            var a = new JObject { ["items"] = new JArray(1, 2) };
            var b = new JObject { ["items"] = new JArray(1) };
            var diffs = StructuralDiff.DiffTokens(a, b);
            Assert.AreEqual(1, diffs.Count);
            Assert.AreEqual("items[1]", (string)diffs[0]["path"]);
            Assert.AreEqual(2, (int)diffs[0]["before"]);
            Assert.AreEqual(JTokenType.Null, diffs[0]["after"].Type);
        }
    }
}
