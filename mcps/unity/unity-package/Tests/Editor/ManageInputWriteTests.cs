#if UNITY_MCP_HAS_INPUT_SYSTEM
using System.Threading;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityMcp.Editor.Tools;
using UnityMcp.Editor.Tools.InputTools;

namespace UnityMcp.Editor.Tests
{
    /// <summary>
    /// Exercises the manage_input write surface end-to-end through the tool's own dispatch
    /// (create_asset -> add_map -> add_action -> add_binding -> remove_*), so the delegate
    /// wiring between <see cref="ManageInputTool"/> and <see cref="InputActionWriter"/> is
    /// covered, not just the writer in isolation. Each write goes through the real
    /// InputActionAsset API + ToJson + ImportAsset round-trip and is verified against the
    /// re-read inspect tree the tool returns.
    /// </summary>
    [TestFixture]
    internal sealed class ManageInputWriteTests
    {
        private const string AssetPath = "Assets/__unitymcp_input_write_test__.inputactions";

        private ManageInputTool _tool;
        private ToolContext _ctx;

        [SetUp]
        public void SetUp()
        {
            _tool = new ManageInputTool();
            _ctx = new ToolContext("test-correlation", CancellationToken.None);
            if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(AssetPath) != null)
                AssetDatabase.DeleteAsset(AssetPath);
        }

        [TearDown]
        public void TearDown()
        {
            if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(AssetPath) != null)
                AssetDatabase.DeleteAsset(AssetPath);
        }

        private JToken Invoke(JObject @params)
        {
            var result = _tool.InvokeAsync(@params, _ctx).GetAwaiter().GetResult();
            Assert.AreEqual("application/json", result.ContentType);
            return (JToken)result.Data;
        }

        private JObject Action(string action) => new JObject { ["action"] = action };

        [Test]
        public void CreateAsset_WritesValidImportableAsset()
        {
            var p = Action("create_asset");
            p["assetPath"] = AssetPath;
            var tree = Invoke(p);

            // The asset imported as an InputActionAsset and the tool re-read it.
            Assert.AreEqual(AssetPath, tree.Value<string>("assetPath"));
            Assert.AreEqual(0, tree.Value<int>("mapCount"));
            Assert.IsNotNull(AssetDatabase.LoadAssetAtPath<UnityEngine.InputSystem.InputActionAsset>(AssetPath),
                "created file must import as an InputActionAsset");
        }

        [Test]
        public void CreateAsset_RejectsExistingWithoutOverwrite()
        {
            Invoke(WithPath(Action("create_asset")));

            var second = WithPath(Action("create_asset"));
            var ex = Assert.Throws<ToolException>(() => Invoke(second));
            Assert.AreEqual("InvalidInput", ex.Code);
            StringAssert.Contains("overwrite", ex.Message);
        }

        [Test]
        public void CreateAsset_RejectsNonInputActionsExtension()
        {
            var p = Action("create_asset");
            p["assetPath"] = "Assets/wrong.asset";
            var ex = Assert.Throws<ToolException>(() => Invoke(p));
            Assert.AreEqual("InvalidInput", ex.Code);
            StringAssert.Contains(".inputactions", ex.Message);
        }

        [Test]
        public void FullRoundTrip_MapActionBinding_AppearsInTree()
        {
            Invoke(WithPath(Action("create_asset")));

            Invoke(WithPath(Action("add_map"), ("map", "Gameplay")));
            Invoke(WithPath(Action("add_action"), ("map", "Gameplay"), ("actionName", "Press"), ("type", "Button")));
            var tree = Invoke(WithPath(Action("add_binding"),
                ("map", "Gameplay"), ("actionName", "Press"), ("path", "<Pointer>/press")));

            var maps = (JArray)tree["actionMaps"];
            Assert.AreEqual(1, maps.Count);
            var actions = (JArray)maps[0]["actions"];
            Assert.AreEqual("Press", actions[0].Value<string>("name"));
            Assert.AreEqual("Button", actions[0].Value<string>("type"));
            var bindings = (JArray)actions[0]["bindings"];
            Assert.AreEqual(1, bindings.Count);
            Assert.AreEqual("<Pointer>/press", bindings[0].Value<string>("path"));
            Assert.IsFalse(string.IsNullOrEmpty(bindings[0].Value<string>("id")),
                "binding must carry the Unity-generated id for remove_binding");
        }

        [Test]
        public void AddMap_DuplicateRejected()
        {
            Invoke(WithPath(Action("create_asset")));
            Invoke(WithPath(Action("add_map"), ("map", "Gameplay")));
            var ex = Assert.Throws<ToolException>(() => Invoke(WithPath(Action("add_map"), ("map", "Gameplay"))));
            Assert.AreEqual("InvalidInput", ex.Code);
        }

        [Test]
        public void RemoveBinding_ById_RemovesIt()
        {
            Invoke(WithPath(Action("create_asset")));
            Invoke(WithPath(Action("add_map"), ("map", "Gameplay")));
            Invoke(WithPath(Action("add_action"), ("map", "Gameplay"), ("actionName", "Press")));
            var tree = Invoke(WithPath(Action("add_binding"),
                ("map", "Gameplay"), ("actionName", "Press"), ("path", "<Pointer>/press")));

            var bindingId = ((JArray)((JArray)((JArray)tree["actionMaps"])[0]["actions"])[0]["bindings"])[0]
                .Value<string>("id");

            var after = Invoke(WithPath(Action("remove_binding"),
                ("map", "Gameplay"), ("actionName", "Press"), ("bindingId", bindingId)));

            var bindings = (JArray)((JArray)((JArray)after["actionMaps"])[0]["actions"])[0]["bindings"];
            Assert.AreEqual(0, bindings.Count);
        }

        [Test]
        public void RemoveMap_MissingMap_ReturnsNotFound()
        {
            Invoke(WithPath(Action("create_asset")));
            var ex = Assert.Throws<ToolException>(() => Invoke(WithPath(Action("remove_map"), ("map", "Nope"))));
            Assert.AreEqual("NotFound", ex.Code);
        }

        // --- helpers ---------------------------------------------------------------

        private static JObject WithPath(JObject p, params (string key, string val)[] extra)
        {
            p["assetPath"] = AssetPath;
            foreach (var (key, val) in extra) p[key] = val;
            return p;
        }
    }
}
#endif
