using System.Threading;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools;
using UnityMcp.Editor.Tools.Assets;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Covers asset_set_properties: writes to an on-disk ScriptableObject by path and by
    /// instanceId, all-or-nothing rollback, the save-to-disk step, and target rejection.
    /// </summary>
    [TestFixture]
    internal sealed class AssetSetPropertiesToolTests
    {
        private const string AssetPath = "Assets/__unitymcp_asset_set_props_test__.asset";
        private const string RefPath = "Assets/__unitymcp_asset_set_props_ref__.asset";

        private AssetSetPropertiesTool _tool;
        private ToolContext _ctx;
        private AssetSetPropertiesTestAsset _asset;

        [SetUp]
        public void SetUp()
        {
            _tool = new AssetSetPropertiesTool();
            _ctx = new ToolContext("test-correlation", CancellationToken.None);

            _asset = ScriptableObject.CreateInstance<AssetSetPropertiesTestAsset>();
            _asset.items.AddRange(new[] { 1, 2 });
            AssetDatabase.CreateAsset(_asset, AssetPath);
            AssetDatabase.SaveAssets();
        }

        [TearDown]
        public void TearDown()
        {
            AssetDatabase.DeleteAsset(AssetPath);
            AssetDatabase.DeleteAsset(RefPath);
        }

        private JObject Invoke(JObject @params)
        {
            var result = _tool.InvokeAsync(@params, _ctx).GetAwaiter().GetResult();
            Assert.AreEqual("application/json", result.ContentType);
            return (JObject)result.Data;
        }

        private static JObject Write(string path, JToken value) =>
            new JObject { ["propertyPath"] = path, ["value"] = value };

        private static JObject ByPath(params JObject[] writes) =>
            new JObject { ["path"] = AssetPath, ["writes"] = new JArray(writes) };

        [Test]
        public void ByPath_WritesFieldsAndSaves()
        {
            var data = Invoke(ByPath(
                Write("count", 42),
                Write("label", "boss"),
                Write("offset", new JArray(1, 2, 3)),
                Write("mode", "Chase"),
                Write("stats.hp", 300),
                Write("_hidden", true)));

            Assert.AreEqual(6, data.Value<int>("written"));
            Assert.AreEqual(AssetPath, data.Value<string>("path"));
            Assert.AreEqual(42, _asset.count);
            Assert.AreEqual("boss", _asset.label);
            Assert.AreEqual(new Vector3(1, 2, 3), _asset.offset);
            Assert.AreEqual(AssetSetPropertiesTestAsset.Mode.Chase, _asset.mode);
            Assert.AreEqual(300, _asset.stats.hp);
            Assert.IsTrue(_asset.Hidden);
            Assert.IsFalse(EditorUtility.IsDirty(_asset), "asset must be saved, not left dirty");
        }

        [Test]
        public void ByInstanceId_Writes()
        {
            Invoke(new JObject
            {
                ["instanceId"] = _asset.GetInstanceID(),
                ["writes"] = new JArray(Write("count", 7)),
            });
            Assert.AreEqual(7, _asset.count);
        }

        [Test]
        public void ListResizeAndElement_InOneBatch()
        {
            Invoke(ByPath(
                Write("items.Array.size", 3),
                Write("items.Array.data[2]", 9)));
            CollectionAssert.AreEqual(new[] { 1, 2, 9 }, _asset.items);
        }

        [Test]
        public void ObjectRef_ByPath()
        {
            var target = ScriptableObject.CreateInstance<AssetSetPropertiesTestAsset>();
            AssetDatabase.CreateAsset(target, RefPath);

            Invoke(ByPath(Write("reference", new JObject { ["$path"] = RefPath })));
            Assert.AreEqual(target, _asset.reference);
        }

        [Test]
        public void UnknownProperty_CommitsNothing()
        {
            var ex = Assert.Throws<ToolException>(() => Invoke(ByPath(
                Write("count", 99),
                Write("nope", 1))));

            Assert.AreEqual("InvalidInput", ex.Code);
            Assert.AreEqual("nope", ex.Details.Value<string>("failedAt"));
            CollectionAssert.Contains(ex.Details["availableProperties"].ToObject<string[]>(), "count");
            Assert.AreEqual(0, _asset.count, "earlier write in the batch must roll back");
        }

        [Test]
        public void MissingPath_Rejected()
        {
            var ex = Assert.Throws<ToolException>(() => Invoke(new JObject
            {
                ["path"] = "Assets/__does_not_exist__.asset",
                ["writes"] = new JArray(Write("count", 1)),
            }));
            Assert.AreEqual("InvalidInput", ex.Code);
        }

        [Test]
        public void SceneObject_Rejected()
        {
            var go = new GameObject("__unitymcp_scene_obj__");
            try
            {
                var ex = Assert.Throws<ToolException>(() => Invoke(new JObject
                {
                    ["instanceId"] = go.GetInstanceID(),
                    ["writes"] = new JArray(Write("m_Name", "x")),
                }));
                StringAssert.Contains("component_set_properties", ex.Message);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }
    }
}
