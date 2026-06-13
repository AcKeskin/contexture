using System;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools.Components;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Covers the object-reference coercion path in <see cref="PropertyValueCoercion"/> —
    /// the surface that previously rejected every documented value form because the value
    /// arrived stringified. These tests lock in that integer / { $ref } / { $guid } /
    /// { $path } forms resolve, that their stringified equivalents are recovered, and that
    /// rejection errors report what was actually received.
    ///
    /// A SerializedProperty needs a live SerializedObject over a real UnityEngine.Object, so
    /// the fixture builds a throwaway ScriptableObject with a single object-reference field
    /// and a target asset to point it at.
    /// </summary>
    [TestFixture]
    internal sealed class PropertyValueCoercionTests
    {
        private sealed class RefHolder : ScriptableObject
        {
            public UnityEngine.Object reference;
        }

        private RefHolder _holder;
        private SerializedObject _so;
        private SerializedProperty _refProp;

        // A real on-disk asset to resolve $guid / $path against, plus an in-memory object
        // for instanceId / $ref. Created in Setup, cleaned up in TearDown.
        private RefHolder _targetAsset;
        private string _targetAssetPath;
        private string _targetGuid;

        [SetUp]
        public void SetUp()
        {
            _holder = ScriptableObject.CreateInstance<RefHolder>();
            _so = new SerializedObject(_holder);
            _refProp = _so.FindProperty("reference");
            Assert.IsNotNull(_refProp, "fixture field 'reference' not found");

            _targetAsset = ScriptableObject.CreateInstance<RefHolder>();
            _targetAssetPath = "Assets/__unitymcp_coercion_test__.asset";
            AssetDatabase.CreateAsset(_targetAsset, _targetAssetPath);
            AssetDatabase.SaveAssets();
            _targetGuid = AssetDatabase.AssetPathToGUID(_targetAssetPath);
        }

        [TearDown]
        public void TearDown()
        {
            _so?.Dispose();
            if (_holder != null) UnityEngine.Object.DestroyImmediate(_holder);
            if (!string.IsNullOrEmpty(_targetAssetPath))
                AssetDatabase.DeleteAsset(_targetAssetPath);
        }

        private void Apply(JToken value) => PropertyValueCoercion.Apply(_refProp, value);

        // --- happy paths: object forms ---------------------------------------------

        [Test]
        public void Null_ClearsReference()
        {
            _refProp.objectReferenceValue = _targetAsset;
            Apply(JValue.CreateNull());
            Assert.IsNull(_refProp.objectReferenceValue);
        }

        [Test]
        public void InstanceIdInteger_Resolves()
        {
            int id = _targetAsset.GetInstanceID();
            Apply(new JValue(id));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue);
        }

        [Test]
        public void RefObject_Resolves()
        {
            int id = _targetAsset.GetInstanceID();
            Apply(new JObject { ["$ref"] = id });
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue);
        }

        [Test]
        public void GuidObject_Resolves()
        {
            Apply(new JObject { ["$guid"] = _targetGuid });
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue);
        }

        [Test]
        public void PathObject_Resolves()
        {
            Apply(new JObject { ["$path"] = _targetAssetPath });
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue);
        }

        // --- the regression: stringified forms are recovered ------------------------

        [Test]
        public void StringifiedInstanceId_Resolves()
        {
            int id = _targetAsset.GetInstanceID();
            Apply(new JValue(id.ToString()));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue,
                "a bare numeric string instanceId must resolve like the integer form");
        }

        [Test]
        public void StringifiedGuidObject_Resolves()
        {
            var json = $"{{\"$guid\":\"{_targetGuid}\"}}";
            Apply(new JValue(json));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue,
                "a stringified { $guid } object must be parsed and resolved");
        }

        [Test]
        public void StringifiedPathObject_Resolves()
        {
            var json = $"{{\"$path\":\"{_targetAssetPath}\"}}";
            Apply(new JValue(json));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue);
        }

        [Test]
        public void BareGuidString_ResolvesAsGuid()
        {
            Apply(new JValue(_targetGuid));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue,
                "a bare 32-hex-char string must be treated as an asset $guid");
        }

        [Test]
        public void BarePathString_ResolvesAsPath()
        {
            Apply(new JValue(_targetAssetPath));
            Assert.AreEqual(_targetAsset, _refProp.objectReferenceValue,
                "a string containing '/' or ending in .asset must be treated as a $path");
        }

        [Test]
        public void EmptyString_ClearsReference()
        {
            _refProp.objectReferenceValue = _targetAsset;
            Apply(new JValue("   "));
            Assert.IsNull(_refProp.objectReferenceValue);
        }

        // --- diagnostic errors ------------------------------------------------------

        [Test]
        public void UnresolvableInstanceId_ReportsId()
        {
            var ex = Assert.Throws<ArgumentException>(() => Apply(new JValue(-987654)));
            StringAssert.Contains("-987654", ex.Message);
        }

        [Test]
        public void GarbageString_ErrorReportsReceivedValue()
        {
            var ex = Assert.Throws<ArgumentException>(() => Apply(new JValue("not-an-instance-id-or-path")));
            StringAssert.Contains("not-an-instance-id-or-path", ex.Message,
                "the error must echo what was received so a failure is debuggable in one pass");
        }

        [Test]
        public void MalformedJsonString_ErrorMentionsParseFailure()
        {
            var ex = Assert.Throws<ArgumentException>(() => Apply(new JValue("{ this is not json")));
            StringAssert.Contains("failed to parse", ex.Message);
        }

        [Test]
        public void UnknownObjectKeys_ErrorListsReceivedKeys()
        {
            var ex = Assert.Throws<ArgumentException>(() => Apply(new JObject { ["nope"] = 1 }));
            StringAssert.Contains("nope", ex.Message,
                "the error must list the keys actually received");
        }
    }
}
