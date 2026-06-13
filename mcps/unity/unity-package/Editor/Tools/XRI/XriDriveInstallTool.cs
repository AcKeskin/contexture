using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Runtime;
#if UNITY_MCP_HAS_XR_MGMT
using UnityEngine.XR.Management;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Installs the McpXriDriver MonoBehaviour onto the MRTK InputSimulator
    /// GameObject so MCP-driven pose / trigger / grip state takes over the
    /// sim's per-hand action references — install snapshots the originals,
    /// swaps them to the McpInputActions asset (bound exclusively to
    /// McpVirtualButtonsDevice), and uninstall restores the snapshot so the
    /// human user can resume manual Space+LMB grab without an Editor restart.
    ///
    /// Idempotent. Hard-fails with structured Details on three documented
    /// failure paths (per spec mrtk-input-simulator-install-uninstall v1):
    ///   - reason: mrtk_input_simulator_not_found
    ///   - reason: action_reference_property_missing
    ///   - reason: xr_loader_active
    ///
    /// Must be called in Play Mode (MRTK simulator only exists at runtime).
    /// </summary>
    /// <remarks>Callers invoke this tool from Play Mode to take over or release MRTK hand input before issuing pose/trigger/grip injection sequences.</remarks>
    [UnityMcpTool("xri_drive_install", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriDriveInstallTool : IUnityMcpTool
    {
        // Reason codes (architectural-rules/universal/no-magic-numbers-strings.md).
        // ReasonActionReferencePropertyMissing is declared on McpXriDriver so the
        // runtime side can populate BindFailureReason with the same constant; the
        // other two are tool-local.
        private const string ReasonMrtkInputSimulatorNotFound = "mrtk_input_simulator_not_found";
        private const string ReasonXrLoaderActive             = "xr_loader_active";

        public string Name => "xri_drive_install";

        public string Description =>
            "Install (or uninstall) the McpXriDriver component on the MRTK " +
            "InputSimulator GameObject. Install snapshots the sim's per-hand " +
            "trigger/grip/track/toggle InputActionReferences and swaps them to " +
            "the McpInputActions asset (bound exclusively to McpVirtualButtonsDevice), " +
            "so the driver becomes the sole writer for those actions. Uninstall " +
            "restores the originals. Play Mode only. Idempotent. " +
            "Returns { gameObject, installed, alreadyPresent, installedAt, " +
            "driverVersion, sessionId }. Errors carry structured Details: " +
            "{ reason: mrtk_input_simulator_not_found | action_reference_property_missing | xr_loader_active }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["install"] = new JObject { ["type"] = "boolean" },
            },
            ["required"] = new JArray { "install" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!Application.isPlaying)
            {
                throw new ToolException("InvalidInput",
                    "xri_drive_install requires play mode.");
            }

            bool install = @params.Value<bool>("install");

            // Resolve sim type + instance. Both missing-cases surface via the
            // mrtk_input_simulator_not_found reason code (the type can be loaded
            // but no instance present, or the type itself isn't loaded).
            var simType = System.Type.GetType(
                "MixedReality.Toolkit.Input.Simulation.InputSimulator, MixedReality.Toolkit.Input"
            ) ?? FindTypeByName("MixedReality.Toolkit.Input.Simulation.InputSimulator");

            if (simType == null)
            {
                throw new ToolException("NotFound",
                    "MRTK InputSimulator type not loaded.",
                    new JObject
                    {
                        ["reason"] = ReasonMrtkInputSimulatorNotFound,
                        ["expected"] = "MixedReality.Toolkit.Input.Simulation.InputSimulator on an active GameObject",
                    });
            }

            var simComp = (MonoBehaviour)Object.FindFirstObjectByType(simType);
            if (simComp == null)
            {
                throw new ToolException("NotFound",
                    "No active MRTK InputSimulator MonoBehaviour in any loaded scene.",
                    new JObject
                    {
                        ["reason"] = ReasonMrtkInputSimulatorNotFound,
                        ["expected"] = "MixedReality.Toolkit.Input.Simulation.InputSimulator on an active GameObject",
                    });
            }

            var go = simComp.gameObject;
            var existing = go.GetComponent<McpXriDriver>();

            if (install)
            {
                // XR-loader pre-check: MRTK / XRI input simulator only works when
                // no XR loader is initialized at startup
                // (lessons/unity-input-simulation-vs-xr-loader.md). Skipped when
                // com.unity.xr.management isn't installed — the lesson can't
                // apply if the package isn't there.
#if UNITY_MCP_HAS_XR_MGMT
                var activeLoader = XRGeneralSettings.Instance?.Manager?.activeLoader;
                if (activeLoader != null)
                {
                    throw new ToolException("InvalidInput",
                        "An XR loader is active; the MRTK / XRI input simulator only " +
                        "works when no loader is initialized at startup.",
                        new JObject
                        {
                            ["reason"] = ReasonXrLoaderActive,
                            ["loader"] = activeLoader.GetType().FullName,
                        });
                }
#endif

                if (existing != null)
                {
                    // Re-install on an already-present driver is a no-op on the
                    // swap path (driver guards via _snapshot.Captured). Surface
                    // the existing session's diagnostics.
                    return Task.FromResult(ToolResult.Json(InstallEnvelope(go.name, installed: true, alreadyPresent: true)));
                }

                var driver = go.AddComponent<McpXriDriver>();

                // Force a synchronous bind so we can surface structured Details
                // immediately on reflection failure instead of leaving a no-op
                // component installed.
                if (!driver.TryBindNow())
                {
                    var reason = McpXriDriver.BindFailureReason ?? McpXriDriver.ReasonActionReferencePropertyMissing;
                    var missing = McpXriDriver.BindFailureMissing != null
                        ? new JArray(McpXriDriver.BindFailureMissing)
                        : new JArray();
                    Object.Destroy(driver);
                    throw new ToolException("ToolError",
                        "MRTK reflection bind incomplete — package layout may have changed.",
                        new JObject
                        {
                            ["reason"] = reason,
                            ["missing"] = missing,
                        });
                }

                return Task.FromResult(ToolResult.Json(InstallEnvelope(go.name, installed: true, alreadyPresent: false)));
            }

            // Uninstall
            if (existing == null)
            {
                return Task.FromResult(ToolResult.Json(InstallEnvelope(go.name, installed: false, alreadyPresent: false)));
            }
            // OnDisable runs RestoreSimActionRefs synchronously before the
            // component is torn down — snapshot integrity is preserved.
            Object.Destroy(existing);
            return Task.FromResult(ToolResult.Json(InstallEnvelope(go.name, installed: false, alreadyPresent: true)));
        }

        private static JObject InstallEnvelope(string gameObjectName, bool installed, bool alreadyPresent)
        {
            return new JObject
            {
                ["gameObject"] = gameObjectName,
                ["installed"] = installed,
                ["alreadyPresent"] = alreadyPresent,
                ["installedAt"] = McpXriDriver.InstalledAtFrame,
                ["driverVersion"] = McpXriDriver.DriverVersion,
                ["sessionId"] = McpXriDriver.SessionId,
            };
        }

        private static System.Type FindTypeByName(string fullName)
        {
            foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var t = asm.GetType(fullName, throwOnError: false);
                    if (t != null) return t;
                }
                catch { /* skip */ }
            }
            return null;
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_drive_install requires com.unity.xr.interaction.toolkit (>=2.0.0).");
        }
#endif
    }
}
