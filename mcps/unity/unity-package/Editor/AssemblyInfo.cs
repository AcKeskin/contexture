using System.Runtime.CompilerServices;

// The test assembly exercises internal types directly — PropertyValueCoercion,
// InputActionWriter, ManageInputTool — which are internal by design (not part of the
// tool's public surface). Exposing them to the test assembly keeps the production
// types internal while letting unit tests reach them without a public back door.
[assembly: InternalsVisibleTo("UnityMcp.Editor.Tests")]
