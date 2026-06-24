using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Locks in the full-fidelity read path of <see cref="SerializedFieldDumper"/> (proposal
    /// prefab-control, criterion 7): AnimationCurve, Gradient, and [SerializeReference]/
    /// ManagedReference serialize to structured data — never the "&lt;unsupported: T&gt;" marker —
    /// when fullFidelity is true, AND still render as "&lt;unsupported&gt;" when false (so the cheap
    /// go_serialize path is provably unchanged).
    ///
    /// A SerializedProperty needs a live SerializedObject over a real UnityEngine.Object, so the
    /// fixture hangs a throwaway MonoBehaviour carrying the three field types on a temp GameObject.
    /// </summary>
    [TestFixture]
    internal sealed class SerializedFieldDumperFullFidelityTests
    {
        // Polymorphic base for the [SerializeReference] field.
        [System.Serializable]
        private abstract class Shape { }

        [System.Serializable]
        private sealed class Circle : Shape
        {
            public float radius = 2.5f;
        }

        private sealed class ComplexHolder : MonoBehaviour
        {
            public AnimationCurve curve;
            public Gradient gradient;
            [SerializeReference] public Shape shape;
        }

        private GameObject _go;
        private ComplexHolder _holder;

        [SetUp]
        public void SetUp()
        {
            _go = new GameObject("__unitymcp_dumper_test__");
            _holder = _go.AddComponent<ComplexHolder>();
            _holder.curve = new AnimationCurve(new Keyframe(0f, 0f), new Keyframe(1f, 1f));
            var g = new Gradient();
            g.SetKeys(
                new[] { new GradientColorKey(Color.red, 0f), new GradientColorKey(Color.blue, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.5f, 1f) });
            _holder.gradient = g;
            _holder.shape = new Circle { radius = 3.0f };
        }

        [TearDown]
        public void TearDown()
        {
            if (_go != null) UnityEngine.Object.DestroyImmediate(_go);
        }

        private JObject Dump(bool fullFidelity)
        {
            return SerializedFieldDumper.DumpComponent(_holder, new HashSet<int>(), fullFidelity);
        }

        [Test]
        public void FullFidelity_HasNoUnsupportedMarkers()
        {
            var dump = Dump(fullFidelity: true);
            Assert.IsFalse(dump.ToString().Contains("<unsupported"),
                "full-fidelity dump must contain zero '<unsupported' markers");
        }

        [Test]
        public void FullFidelity_AnimationCurve_IsStructured()
        {
            var dump = Dump(fullFidelity: true);
            var curve = dump["curve"] as JObject;
            Assert.IsNotNull(curve, "curve should be a structured object");
            Assert.AreEqual("AnimationCurve", (string)curve["$type"]);
            var keys = curve["keys"] as JArray;
            Assert.IsNotNull(keys);
            Assert.AreEqual(2, keys.Count, "two keyframes expected");
            Assert.AreEqual(0f, (float)keys[0]["time"]);
            Assert.AreEqual(1f, (float)keys[1]["value"]);
        }

        [Test]
        public void FullFidelity_Gradient_IsStructured()
        {
            var dump = Dump(fullFidelity: true);
            var gradient = dump["gradient"] as JObject;
            Assert.IsNotNull(gradient, "gradient should be a structured object");
            Assert.AreEqual("Gradient", (string)gradient["$type"]);
            Assert.AreEqual(2, (gradient["colorKeys"] as JArray).Count);
            Assert.AreEqual(2, (gradient["alphaKeys"] as JArray).Count);
        }

        [Test]
        public void FullFidelity_ManagedReference_CarriesTypenameAndBody()
        {
            var dump = Dump(fullFidelity: true);
            var shape = dump["shape"] as JObject;
            Assert.IsNotNull(shape, "shape should be a structured ManagedReference object");
            Assert.AreEqual("ManagedReference", (string)shape["$type"]);
            Assert.IsTrue(((string)shape["managedReferenceFullTypename"]).Contains("Circle"),
                "managed reference typename should name the concrete Circle type");
            var value = shape["value"] as JObject;
            Assert.IsNotNull(value, "boxed instance body should be present");
            Assert.AreEqual(3.0f, (float)value["radius"], 0.001f);
        }

        [Test]
        public void Lossy_StillMarksComplexTypesUnsupported()
        {
            var dump = Dump(fullFidelity: false);
            Assert.AreEqual("<unsupported: AnimationCurve>", (string)dump["curve"]);
            Assert.AreEqual("<unsupported: Gradient>", (string)dump["gradient"]);
            Assert.AreEqual("<unsupported: ManagedReference>", (string)dump["shape"]);
        }
    }
}
