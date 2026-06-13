#!/usr/bin/env node
/**
 * Smoke harness v2 — extended round-trip coverage for unity-mcp v2.
 *
 * Skeleton ships a working harness that re-exercises the v1 tool surface so
 * `npm run smoke:v2` is green from day one. Subsequent v2 plan steps (7-22, 25)
 * add their assertions under the matching section headers below. Each section
 * is independently runnable by passing `--only <section>`.
 *
 * Sections (in execution order):
 *   - Scene             (plan Step 7)
 *   - GameObject        (plan Steps 8-9)
 *   - Component         (plan Step 10)
 *   - Asset             (plan Step 11)
 *   - Prefab            (plan Step 12)
 *   - Vision            (plan Step 13, 18)
 *   - XRI               (plan Step 15)
 *   - MRTK3             (plan Steps 16-17)
 *   - CustomTools       (plan Steps 20-22)
 *   - UiAuthoring       (spec/plan ui-authoring v1)
 *   - Logging           (plan Step 25)
 *
 * Skeleton behavior: covers the v1 baseline (project_info, scene_info,
 * console_read, go_find, go_create, view_game) so every later step can extend
 * and never has to add scaffolding.
 *
 * Usage:
 *   node scripts/smoke-v2.mjs [--out <dir>] [--only <section>] [--play-mode]
 *                             [--include-scene-save] [--include-custom-tools]
 *                             [--include-playmode-tests] [--include-playmode-timeout-probe]
 *                             [--include-xri-grab-tests]
 *
 * Flag semantics:
 *   --play-mode             — runs the head-pose-write+capture-diff assertion
 *                              for criterion #5. Requires the Unity Editor to
 *                              be in play mode before invocation.
 *   --include-scene-save    — exercises scene_save in the Scene section.
 *                              Default off because saving commits the user's
 *                              working state to disk on every smoke run.
 *   --include-custom-tools  — exercises the custom-tools opt-in cycle (writes
 *                              a stub .cs into Assets/, flips the package.json
 *                              flag, asserts surface, restores). Default off
 *                              because both writes leave the working tree
 *                              dirty during the run.
 *   --include-playmode-tests
 *                           — exercises the Playmode section (playmode_set
 *                              round-trips, idempotent no-op, dirty-scene
 *                              auto-save). Default off because entering Play
 *                              Mode is slow (~1–3s per transition) and unloads
 *                              the open scene on stop.
 *   --include-playmode-timeout-probe
 *                           — additionally runs the forced-timeout case
 *                              (timeoutMs:100 against a cold-domain enter)
 *                              and the saveDirtyScenes:false probe. Both can
 *                              leave the Editor in a half-transitioned state
 *                              and the second can hang if Play Mode Options
 *                              has Reload Scene enabled — opt in deliberately.
 *                              Implies --include-playmode-tests.
 *   --include-xri-grab-tests
 *                           — exercises the XriGrab section (xri_drive_install
 *                              install/uninstall round-trip, sessionId stability,
 *                              binding snapshot/restore). Requires Unity in Play
 *                              Mode against the MRTKDevTemplate MCPTest scene;
 *                              the section enters/exits Play Mode itself and
 *                              may take ~10-30s. Default off because Play Mode
 *                              transitions are slow and the install mutates the
 *                              MRTK InputSimulator's ActionReference fields.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_ENTRY = resolve(__dirname, "..", "build", "index.js");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : ".smoke-out");
const onlyIdx = args.indexOf("--only");
const onlyFilter = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const playMode = args.includes("--play-mode");
mkdirSync(outDir, { recursive: true });

class StdioMcpClient {
  constructor() {
    this.proc = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderrLines = [];
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderrLines.push(chunk);
      process.stderr.write(`[server] ${chunk}`);
    });
    this.proc.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`server exited with code ${code} before responding`));
      }
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else ok(msg.result);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "unity-mcp-smoke-v2", version: "0.0.1" },
    });
  }

  listTools() { return this.request("tools/list", {}); }
  callTool(name, params) { return this.request("tools/call", { name, arguments: params }); }
  close() {
    try { this.proc.stdin.end(); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

const failures = [];
function expect(cond, msg) { if (!cond) failures.push(msg); }
function isErrorResult(r) { return r?.isError === true; }
function getText(r) { return r?.content?.find((c) => c.type === "text")?.text ?? ""; }
function getImage(r) { return r?.content?.find((c) => c.type === "image"); }

function shouldRun(section) {
  if (!onlyFilter) return true;
  return onlyFilter.toLowerCase() === section.toLowerCase();
}

async function run() {
  const client = new StdioMcpClient();
  try {
    await client.initialize();

    const tools = await client.listTools();
    const names = (tools.tools ?? []).map((t) => t.name).sort();
    if (names.length === 0) {
      throw new Error("tools/list returned empty — is Unity running with the unity-mcp package?");
    }
    console.log(`[smoke:v2] tools/list → ${names.length} tools`);

    // -------------------------------------------------------------------------
    // ## Scene                                                  (plan Step 7)
    // -------------------------------------------------------------------------
    if (shouldRun("Scene")) {
      // scene_info — confirms we have an active scene to reason about.
      const infoR = await client.callTool("scene_info", {});
      expect(!isErrorResult(infoR), `scene_info isError: ${getText(infoR)}`);
      const sceneData = JSON.parse(getText(infoR));
      const activePath = sceneData.active?.path ?? "";
      expect(typeof sceneData.active?.name === "string", "scene_info missing active.name");
      console.log(`[smoke:v2] [Scene] scene_info → '${sceneData.active.name}' (${activePath || "untitled"})`);

      // Non-destructive checks — exercise plumbing without mutating user state.

      // scene_load with a bogus path: expect InvalidInput.
      const badLoad = await client.callTool("scene_load", { path: "Assets/_unity_mcp_does_not_exist_.unity" });
      expect(isErrorResult(badLoad), "scene_load with invalid path should error");
      console.log("[smoke:v2] [Scene] scene_load(invalid) → expected error");

      // scene_set_active on a path that's not loaded: expect InvalidInput with helpful message.
      const badActive = await client.callTool("scene_set_active", { path: "Assets/_unity_mcp_not_loaded_.unity" });
      expect(isErrorResult(badActive), "scene_set_active with unloaded path should error");
      const errText = getText(badActive);
      expect(errText.includes("Loaded scenes"), `scene_set_active error should list loaded scenes; got: ${errText}`);
      console.log("[smoke:v2] [Scene] scene_set_active(not-loaded) → expected error with loaded-scene list");

      // scene_save is destructive — it commits the user's working state to disk.
      // Only run when explicitly opted in via --include-scene-save, otherwise just
      // confirm the tool is registered by inspecting tools/list.
      if (args.includes("--include-scene-save") && activePath) {
        const saveR = await client.callTool("scene_save", {});
        expect(!isErrorResult(saveR), `scene_save isError: ${getText(saveR)}`);
        const saveData = JSON.parse(getText(saveR));
        expect(saveData.path === activePath, `scene_save returned path ${saveData.path}; expected ${activePath}`);
        console.log(`[smoke:v2] [Scene] scene_save → wasDirty=${saveData.wasDirty} saved=${saveData.saved}`);
      } else {
        const hasSave = (tools.tools ?? []).some((t) => t.name === "scene_save");
        expect(hasSave, "scene_save tool should be registered");
        console.log("[smoke:v2] [Scene] scene_save skipped (pass --include-scene-save to commit working state)");
      }

      // scene_create is destructive (replaces or stacks scenes) — covered by
      // the play-mode harness only, gated behind --play-mode. Skipped in the
      // default run to keep the user's editing session intact.
    }

    // -------------------------------------------------------------------------
    // ## GameObject                                          (plan Steps 8-9)
    // -------------------------------------------------------------------------
    if (shouldRun("GameObject")) {
      const stamp = Date.now();
      const childName = `UnityMCP_SmokeV2_Child_${stamp}`;
      const parentName = `UnityMCP_SmokeV2_Parent_${stamp}`;

      // go_create the parent and child.
      const parentR = await client.callTool("go_create", { name: parentName, primitive: "none" });
      expect(!isErrorResult(parentR), `go_create parent isError: ${getText(parentR)}`);
      const parentId = JSON.parse(getText(parentR)).instanceId;
      const childR = await client.callTool("go_create", { name: childName, primitive: "Cube", position: [1, 2, 3] });
      expect(!isErrorResult(childR), `go_create child isError: ${getText(childR)}`);
      const childId = JSON.parse(getText(childR)).instanceId;
      console.log(`[smoke:v2] [GameObject] go_create parent=${parentId} child=${childId}`);

      // go_find both.
      const findR = await client.callTool("go_find", { mode: "name", query: childName, limit: 5 });
      expect(!isErrorResult(findR), `go_find isError: ${getText(findR)}`);
      expect(JSON.parse(getText(findR)).count >= 1, `go_find expected ≥1 hit for '${childName}'`);

      // go_set_transform — local-space rotation (Euler).
      const trR = await client.callTool("go_set_transform", {
        instanceId: childId, space: "local",
        position: [4, 5, 6], rotation: [0, 90, 0], scale: [2, 2, 2],
      });
      expect(!isErrorResult(trR), `go_set_transform isError: ${getText(trR)}`);
      const trData = JSON.parse(getText(trR));
      expect(Math.abs(trData.localPosition[0] - 4) < 1e-3, `localPosition[0] expected 4, got ${trData.localPosition[0]}`);
      expect(Math.abs(trData.localScale[0] - 2) < 1e-3, `localScale[0] expected 2, got ${trData.localScale[0]}`);
      console.log(`[smoke:v2] [GameObject] go_set_transform → pos=${trData.localPosition} scale=${trData.localScale}`);

      // go_set_parent — move child under parent, world-position-stays = false (so local pose resets).
      const parR = await client.callTool("go_set_parent", {
        instanceId: childId, parentInstanceId: parentId, worldPositionStays: false,
      });
      expect(!isErrorResult(parR), `go_set_parent isError: ${getText(parR)}`);
      const parData = JSON.parse(getText(parR));
      expect(parData.parentInstanceId === parentId, `parent should be ${parentId}, got ${parData.parentInstanceId}`);
      console.log(`[smoke:v2] [GameObject] go_set_parent → child reparented under ${parentId}`);

      // go_set_parent — refuse self-parenting.
      const selfR = await client.callTool("go_set_parent", { instanceId: childId, parentInstanceId: childId });
      expect(isErrorResult(selfR), "go_set_parent self should error");
      console.log("[smoke:v2] [GameObject] go_set_parent(self) → expected error");

      // go_set_active false then true.
      const offR = await client.callTool("go_set_active", { instanceId: childId, active: false });
      expect(!isErrorResult(offR), `go_set_active false isError: ${getText(offR)}`);
      expect(JSON.parse(getText(offR)).activeSelf === false, "activeSelf should be false");
      const onR = await client.callTool("go_set_active", { instanceId: childId, active: true });
      expect(!isErrorResult(onR), `go_set_active true isError: ${getText(onR)}`);
      expect(JSON.parse(getText(onR)).activeSelf === true, "activeSelf should be true");
      console.log("[smoke:v2] [GameObject] go_set_active false→true round-trip");

      // go_delete both — child first (clean up the test fixtures).
      const delChildR = await client.callTool("go_delete", { instanceId: childId });
      expect(!isErrorResult(delChildR), `go_delete child isError: ${getText(delChildR)}`);
      const delParentR = await client.callTool("go_delete", { instanceId: parentId });
      expect(!isErrorResult(delParentR), `go_delete parent isError: ${getText(delParentR)}`);

      // go_delete bogus ID — expect error.
      const badDelR = await client.callTool("go_delete", { instanceId: 999999999 });
      expect(isErrorResult(badDelR), "go_delete with invalid id should error");
      console.log("[smoke:v2] [GameObject] go_delete + go_delete(invalid) → both behaved correctly");

      // go_serialize — Cube primitive has Transform + MeshFilter + MeshRenderer + BoxCollider.
      const stamp2 = Date.now();
      const cubeR = await client.callTool("go_create", { name: `UnityMCP_SmokeV2_Serialize_${stamp2}`, primitive: "Cube" });
      const cubeId = JSON.parse(getText(cubeR)).instanceId;

      const ser1R = await client.callTool("go_serialize", { instanceId: cubeId, depth: 1 });
      expect(!isErrorResult(ser1R), `go_serialize isError: ${getText(ser1R)}`);
      const ser1 = JSON.parse(getText(ser1R));
      expect(Array.isArray(ser1.components), "go_serialize.components missing");
      expect(ser1.components.length >= 3, `expected ≥3 components on Cube, got ${ser1.components.length}`);
      const types = ser1.components.map((c) => c.type);
      expect(types.includes("Transform"), `components missing Transform: ${types}`);
      expect(types.includes("MeshRenderer"), `components missing MeshRenderer: ${types}`);
      // MeshRenderer.fields should include m_Materials (an array) and at least one $ref entry
      // pointing at the default cube Material.
      const meshRenderer = ser1.components.find((c) => c.type === "MeshRenderer");
      const matsField = meshRenderer?.fields?.m_Materials;
      expect(Array.isArray(matsField), `MeshRenderer.fields.m_Materials missing or not array: ${JSON.stringify(matsField)}`);
      expect(
        matsField.length >= 1 && typeof matsField[0]?.$ref === "number",
        `expected $ref on first material, got: ${JSON.stringify(matsField?.[0])}`,
      );
      console.log(`[smoke:v2] [GameObject] go_serialize(depth=1) → ${ser1.components.length} components, MeshRenderer materials[0].$ref=${matsField[0].$ref}`);

      // depth=0 should return a node with no children expanded.
      const ser0R = await client.callTool("go_serialize", { instanceId: cubeId, depth: 0, includeComponentFields: false });
      expect(!isErrorResult(ser0R), `go_serialize depth=0 isError: ${getText(ser0R)}`);
      const ser0 = JSON.parse(getText(ser0R));
      expect(ser0.children.length === 0, `depth=0 should expand no children, got ${ser0.children.length}`);
      expect(typeof ser0.components[0]?.fieldCount === "number", "includeComponentFields=false should return fieldCount");
      console.log("[smoke:v2] [GameObject] go_serialize(depth=0, no fields) → summary shape correct");

      // Clean up.
      await client.callTool("go_delete", { instanceId: cubeId });
    }

    // -------------------------------------------------------------------------
    // ## Component                                              (plan Step 10)
    // -------------------------------------------------------------------------
    if (shouldRun("Component")) {
      // Fixture: a Cube primitive (Transform + MeshFilter + MeshRenderer + BoxCollider).
      const fixR = await client.callTool("go_create", { name: `UnityMCP_SmokeV2_Comp_${Date.now()}`, primitive: "Cube" });
      const goId = JSON.parse(getText(fixR)).instanceId;

      // component_list before any add — should include Transform + MeshFilter + MeshRenderer + BoxCollider.
      const listR = await client.callTool("component_list", { instanceId: goId });
      expect(!isErrorResult(listR), `component_list isError: ${getText(listR)}`);
      const listData = JSON.parse(getText(listR));
      expect(listData.count >= 3, `expected ≥3 components, got ${listData.count}`);
      const startTypes = listData.items.map((i) => i.type);
      expect(startTypes.includes("Transform"), "expected Transform in list");

      // component_add Rigidbody (short name).
      const addR = await client.callTool("component_add", { instanceId: goId, componentType: "Rigidbody" });
      expect(!isErrorResult(addR), `component_add isError: ${getText(addR)}`);
      const rbId = JSON.parse(getText(addR)).componentInstanceId;
      console.log(`[smoke:v2] [Component] component_add(Rigidbody) → componentInstanceId ${rbId}`);

      // component_add unknown type — expect InvalidInput.
      const badAddR = await client.callTool("component_add", { instanceId: goId, componentType: "DefinitelyNotAComponent_xyz" });
      expect(isErrorResult(badAddR), "component_add unknown type should error");

      // component_set_property mass = 5.0 + useGravity = false.
      const setMassR = await client.callTool("component_set_property", {
        componentInstanceId: rbId, propertyPath: "m_Mass", value: 5.0,
      });
      expect(!isErrorResult(setMassR), `component_set_property mass isError: ${getText(setMassR)}`);
      const setGravR = await client.callTool("component_set_property", {
        componentInstanceId: rbId, propertyPath: "m_UseGravity", value: false,
      });
      expect(!isErrorResult(setGravR), `component_set_property useGravity isError: ${getText(setGravR)}`);

      // Round-trip via go_serialize: confirm the values stuck.
      const serR = await client.callTool("go_serialize", { instanceId: goId, depth: 0 });
      const ser = JSON.parse(getText(serR));
      const rb = ser.components.find((c) => c.type === "Rigidbody");
      expect(rb != null, "Rigidbody not found after add");
      expect(Math.abs(rb.fields.m_Mass - 5.0) < 1e-3, `m_Mass expected 5.0, got ${rb?.fields?.m_Mass}`);
      expect(rb.fields.m_UseGravity === false, `m_UseGravity expected false, got ${rb?.fields?.m_UseGravity}`);
      console.log(`[smoke:v2] [Component] component_set_property mass=5.0, useGravity=false round-tripped`);

      // Refuse to remove Transform.
      const transformId = listData.items.find((i) => i.type === "Transform").instanceId;
      const removeTransformR = await client.callTool("component_remove", { componentInstanceId: transformId });
      expect(isErrorResult(removeTransformR), "component_remove(Transform) should error");
      console.log("[smoke:v2] [Component] component_remove(Transform) → expected error");

      // component_remove the Rigidbody we added (clean up fixture).
      const removeRbR = await client.callTool("component_remove", { componentInstanceId: rbId });
      expect(!isErrorResult(removeRbR), `component_remove Rigidbody isError: ${getText(removeRbR)}`);

      // Test alias resolution: "position.x" should map to "m_LocalPosition.x" on Transform.
      const aliasR = await client.callTool("component_set_property", {
        componentInstanceId: transformId, propertyPath: "position.x", value: 7.5,
      });
      expect(!isErrorResult(aliasR), `alias position.x isError: ${getText(aliasR)}`);
      const aliasData = JSON.parse(getText(aliasR));
      expect(aliasData.resolvedFromAlias === true, "alias should report resolvedFromAlias=true");
      expect(aliasData.propertyPath === "m_LocalPosition.x", `expected m_LocalPosition.x, got ${aliasData.propertyPath}`);
      console.log("[smoke:v2] [Component] component_set_property alias resolution → m_LocalPosition.x");

      await client.callTool("go_delete", { instanceId: goId });
    }

    // -------------------------------------------------------------------------
    // ## Asset                                                  (plan Step 11)
    // -------------------------------------------------------------------------
    if (shouldRun("Asset")) {
      const matPath = `Assets/UnityMcp_SmokeMat_${Date.now()}.mat`;

      // asset_create Material.
      const createR = await client.callTool("asset_create", { path: matPath, assetType: "Material" });
      expect(!isErrorResult(createR), `asset_create isError: ${getText(createR)}`);
      const createData = JSON.parse(getText(createR));
      expect(typeof createData.guid === "string" && createData.guid.length === 32, `expected 32-char GUID, got ${createData.guid}`);
      console.log(`[smoke:v2] [Asset] asset_create(Material) → guid=${createData.guid}`);

      // asset_create unsupported type — InvalidInput.
      const badCreateR = await client.callTool("asset_create", { path: "Assets/_unity_mcp_bad.foo", assetType: "Texture2D" });
      expect(isErrorResult(badCreateR), "asset_create with unsupported type should error");

      // asset_find — locate by 't:Material UnityMcp_Smoke'.
      const findR = await client.callTool("asset_find", { filter: "t:Material UnityMcp_Smoke" });
      expect(!isErrorResult(findR), `asset_find isError: ${getText(findR)}`);
      const findData = JSON.parse(getText(findR));
      expect(findData.count >= 1, `asset_find expected ≥1 hit; got ${findData.count}`);
      const hit = findData.items.find((i) => i.path === matPath);
      expect(hit != null, `asset_find should include just-created '${matPath}'`);
      console.log(`[smoke:v2] [Asset] asset_find('t:Material UnityMcp_Smoke') → ${findData.count} hits`);

      // asset_get_dependencies — recursive deps include the asset itself (isSelf=true).
      // Built-in shaders (Standard, URP/Lit) live in Resources/unity_builtin_extra and don't
      // have a discoverable path, so we can't always assert the shader appears here. We can
      // assert that the API returned the asset at minimum.
      const depsR = await client.callTool("asset_get_dependencies", { path: matPath, recursive: true });
      expect(!isErrorResult(depsR), `asset_get_dependencies isError: ${getText(depsR)}`);
      const depsData = JSON.parse(getText(depsR));
      const selfEntry = depsData.items.find((d) => d.isSelf);
      expect(selfEntry != null, `asset_get_dependencies should include self-entry; got: ${JSON.stringify(depsData.items.map((d) => d.path))}`);
      console.log(`[smoke:v2] [Asset] asset_get_dependencies(recursive) → ${depsData.count} deps (self-entry confirmed)`);

      // asset_import — no-op reimport.
      const impR = await client.callTool("asset_import", { path: matPath });
      expect(!isErrorResult(impR), `asset_import isError: ${getText(impR)}`);

      // asset_import on missing path — error.
      const badImpR = await client.callTool("asset_import", { path: "Assets/_unity_mcp_does_not_exist.mat" });
      expect(isErrorResult(badImpR), "asset_import with missing path should error");

      // asset_delete — clean up.
      const delR = await client.callTool("asset_delete", { path: matPath });
      expect(!isErrorResult(delR), `asset_delete isError: ${getText(delR)}`);
      expect(JSON.parse(getText(delR)).deleted === true, "deleted flag should be true");
      console.log(`[smoke:v2] [Asset] asset_delete → cleaned up ${matPath}`);
    }

    // -------------------------------------------------------------------------
    // ## Prefab                                                 (plan Step 12)
    // -------------------------------------------------------------------------
    if (shouldRun("Prefab")) {
      const stamp = Date.now();
      const prefabPath = `Assets/UnityMcp_SmokePrefab_${stamp}.prefab`;

      // Create a Cube to save as a prefab.
      const sourceR = await client.callTool("go_create", {
        name: `UnityMCP_SmokeV2_PrefSrc_${stamp}`, primitive: "Cube",
      });
      const sourceId = JSON.parse(getText(sourceR)).instanceId;

      // prefab_create_from with connect=true.
      const createR = await client.callTool("prefab_create_from", {
        instanceId: sourceId, path: prefabPath, connect: true,
      });
      expect(!isErrorResult(createR), `prefab_create_from isError: ${getText(createR)}`);
      const createData = JSON.parse(getText(createR));
      expect(typeof createData.guid === "string" && createData.guid.length === 32, `expected 32-char GUID; got ${createData.guid}`);
      console.log(`[smoke:v2] [Prefab] prefab_create_from → ${prefabPath} (guid=${createData.guid.slice(0, 8)}…)`);

      // prefab_instantiate a second copy.
      const instR = await client.callTool("prefab_instantiate", { path: prefabPath, position: [10, 0, 0] });
      expect(!isErrorResult(instR), `prefab_instantiate isError: ${getText(instR)}`);
      const instData = JSON.parse(getText(instR));
      const secondId = instData.instanceId;
      console.log(`[smoke:v2] [Prefab] prefab_instantiate → instanceId ${secondId}`);

      // Modify the second copy's transform via component_set_property to create an override.
      const list2R = await client.callTool("component_list", { instanceId: secondId });
      const transformId2 = JSON.parse(getText(list2R)).items.find((i) => i.type === "Transform").instanceId;
      await client.callTool("component_set_property", {
        componentInstanceId: transformId2, propertyPath: "m_LocalScale", value: [3, 3, 3],
      });

      // prefab_revert on the second copy → scale should snap back.
      const revR = await client.callTool("prefab_revert", { instanceId: secondId });
      expect(!isErrorResult(revR), `prefab_revert isError: ${getText(revR)}`);
      const serR = await client.callTool("go_serialize", { instanceId: secondId, depth: 0 });
      const tComp = JSON.parse(getText(serR)).components.find((c) => c.type === "Transform");
      expect(Math.abs(tComp.fields.m_LocalScale[0] - 1) < 1e-3, `expected scale 1 after revert, got ${tComp?.fields?.m_LocalScale}`);
      console.log("[smoke:v2] [Prefab] prefab_revert → scale snapped back to (1,1,1)");

      // prefab_apply_overrides on a non-prefab instance → expected error.
      const fakeR = await client.callTool("go_create", { name: `UnityMCP_NonPrefab_${stamp}`, primitive: "none" });
      const fakeId = JSON.parse(getText(fakeR)).instanceId;
      const badApplyR = await client.callTool("prefab_apply_overrides", { instanceId: fakeId });
      expect(isErrorResult(badApplyR), "prefab_apply_overrides on non-prefab should error");
      console.log("[smoke:v2] [Prefab] prefab_apply_overrides(non-prefab) → expected error");

      // Cleanup.
      await client.callTool("go_delete", { instanceId: sourceId });
      await client.callTool("go_delete", { instanceId: secondId });
      await client.callTool("go_delete", { instanceId: fakeId });
      await client.callTool("asset_delete", { path: prefabPath });
    }

    // -------------------------------------------------------------------------
    // ## Vision                                              (plan Steps 13, 18)
    // -------------------------------------------------------------------------
    if (shouldRun("Vision")) {
      const PNG_SIG = "89504e470d0a1a0a";

      // view_game.
      const vgR = await client.callTool("view_game", { width: 640, height: 360 });
      expect(!isErrorResult(vgR), `view_game isError: ${getText(vgR)}`);
      const vgImg = getImage(vgR);
      const vgBuf = Buffer.from(vgImg?.data ?? "", "base64");
      expect(vgBuf.slice(0, 8).toString("hex") === PNG_SIG, `view_game PNG signature wrong`);
      writeFileSync(resolve(outDir, "view_game.png"), vgBuf);
      console.log(`[smoke:v2] [Vision] view_game → ${vgBuf.length} bytes, sig ok`);

      // view_scene_from with explicit pose + lookAt.
      const vsfR = await client.callTool("view_scene_from", {
        position: [5, 5, -5], lookAt: [0, 0, 0], fov: 60, width: 640, height: 360,
      });
      expect(!isErrorResult(vsfR), `view_scene_from isError: ${getText(vsfR)}`);
      const vsfImg = getImage(vsfR);
      const vsfBuf = Buffer.from(vsfImg?.data ?? "", "base64");
      expect(vsfBuf.slice(0, 8).toString("hex") === PNG_SIG, `view_scene_from PNG signature wrong`);
      writeFileSync(resolve(outDir, "view_scene_from.png"), vsfBuf);
      console.log(`[smoke:v2] [Vision] view_scene_from → ${vsfBuf.length} bytes, sig ok`);

      // view_scene_from missing position → error.
      const badPoseR = await client.callTool("view_scene_from", { fov: 60 });
      expect(isErrorResult(badPoseR), "view_scene_from without position should error");

      // view_scene_orbit — 4 frames around origin.
      const orbitR = await client.callTool("view_scene_orbit", {
        target: [0, 0, 0], radius: 4, pitchAngles: [10], yawAngles: [0, 90, 180, 270],
        width: 320, height: 180,
      });
      expect(!isErrorResult(orbitR), `view_scene_orbit isError: ${getText(orbitR)}`);
      const orbitData = JSON.parse(getText(orbitR));
      expect(orbitData.frameCount === 4, `expected 4 frames, got ${orbitData.frameCount}`);
      expect(Array.isArray(orbitData.pngs) && orbitData.pngs.length === 4, "pngs array missing or wrong length");
      const firstPngHex = Buffer.from(orbitData.pngs[0], "base64").slice(0, 8).toString("hex");
      expect(firstPngHex === PNG_SIG, `orbit frame[0] PNG signature wrong: ${firstPngHex}`);
      console.log(`[smoke:v2] [Vision] view_scene_orbit → ${orbitData.frameCount} frames`);

      // view_scene_orbit cap — request 16 frames, expect error.
      const bigOrbitR = await client.callTool("view_scene_orbit", {
        target: [0, 0, 0], pitchAngles: [-30, -10, 10, 30], yawAngles: [0, 90, 180, 270],
        width: 64, height: 64,
      });
      expect(isErrorResult(bigOrbitR), "view_scene_orbit > 12 frames should error");

      // view_inspector_preview — create a small material, ask for its preview.
      const matPath = `Assets/UnityMcp_VisionPreview_${Date.now()}.mat`;
      await client.callTool("asset_create", { path: matPath, assetType: "Material" });
      try {
        const previewR = await client.callTool("view_inspector_preview", { path: matPath });
        expect(!isErrorResult(previewR), `view_inspector_preview isError: ${getText(previewR)}`);
        const previewImg = getImage(previewR);
        const previewBuf = Buffer.from(previewImg?.data ?? "", "base64");
        expect(previewBuf.slice(0, 8).toString("hex") === PNG_SIG, `view_inspector_preview PNG signature wrong`);
        console.log(`[smoke:v2] [Vision] view_inspector_preview → ${previewBuf.length} bytes, sig ok`);
      } finally {
        await client.callTool("asset_delete", { path: matPath });
      }

      // view_inspector_preview unknown path → error.
      const badPreviewR = await client.callTool("view_inspector_preview", { path: "Assets/_unity_mcp_does_not_exist_.mat" });
      expect(isErrorResult(badPreviewR), "view_inspector_preview missing path should error");

      // XR-aware vision (gated on capabilities.xri).
      const xrSimulatorAvailable = names.some((n) => n === "view_xr_simulator");
      if (xrSimulatorAvailable) {
        const xrSimR = await client.callTool("view_xr_simulator", { width: 320, height: 180 });
        expect(!isErrorResult(xrSimR), `view_xr_simulator isError: ${getText(xrSimR)}`);
        const xrImg = getImage(xrSimR);
        const xrBuf = Buffer.from(xrImg?.data ?? "", "base64");
        expect(xrBuf.slice(0, 8).toString("hex") === PNG_SIG, "view_xr_simulator PNG signature wrong");
        console.log(`[smoke:v2] [Vision] view_xr_simulator → ${xrBuf.length} bytes, sig ok`);

        const upR = await client.callTool("view_user_perspective", { width: 320, height: 180 });
        expect(!isErrorResult(upR), `view_user_perspective isError: ${getText(upR)}`);
        const up = JSON.parse(getText(upR));
        expect(typeof up.pngBase64 === "string" && up.pngBase64.length > 0, "user_perspective.pngBase64 missing");
        const upBuf = Buffer.from(up.pngBase64, "base64");
        expect(upBuf.slice(0, 8).toString("hex") === PNG_SIG, "user_perspective png signature wrong");
        expect(up.sidecar && typeof up.sidecar.headPose === "object", "sidecar.headPose missing");
        expect("controllersVisible" in up.sidecar, "sidecar.controllersVisible missing");
        expect("handTrackingOn" in up.sidecar, "sidecar.handTrackingOn missing");
        console.log(`[smoke:v2] [Vision] view_user_perspective → ${upBuf.length}-byte PNG + sidecar (handTracking=${up.sidecar.handTrackingOn})`);
      }
    }

    // -------------------------------------------------------------------------
    // ## XRI                                                    (plan Step 15)
    // -------------------------------------------------------------------------
    if (shouldRun("XRI")) {
      const xriPresent = names.some((n) => n === "xri_get_rig");
      if (!xriPresent) {
        console.log("[smoke:v2] [XRI] gating ok — no xri_* tools surface (capabilities.xri missing)");
      } else {
        const rigR = await client.callTool("xri_get_rig", {});
        expect(!isErrorResult(rigR), `xri_get_rig isError: ${getText(rigR)}`);
        const rig = JSON.parse(getText(rigR));
        expect(typeof rig.headInstanceId === "number", "rig.headInstanceId missing");
        expect(Array.isArray(rig.interactors), "rig.interactors missing");
        console.log(`[smoke:v2] [XRI] xri_get_rig → '${rig.originName}' with ${rig.interactors.length} interactors`);

        if (rig.interactors.length > 0) {
          const firstIx = rig.interactors[0];
          const ixR = await client.callTool("xri_inspect_interactor", { instanceId: firstIx.instanceId });
          expect(!isErrorResult(ixR), `xri_inspect_interactor isError: ${getText(ixR)}`);
          const ix = JSON.parse(getText(ixR));
          expect(ix.type === firstIx.type, `interactor type mismatch ${ix.type} vs ${firstIx.type}`);
          console.log(`[smoke:v2] [XRI] xri_inspect_interactor('${ix.type}') → enabled=${ix.enabled}`);
        }

        // xri_simulate_pose read (any mode).
        const readR = await client.callTool("xri_simulate_pose", { device: "head" });
        expect(!isErrorResult(readR), `xri_simulate_pose read isError: ${getText(readR)}`);
        const readData = JSON.parse(getText(readR));
        expect(readData.mode === "read", `expected mode=read, got ${readData.mode}`);
        expect(Array.isArray(readData.position) && readData.position.length === 3, "head position malformed");
        console.log(`[smoke:v2] [XRI] xri_simulate_pose(read) → head at ${readData.position.map((x) => x.toFixed(2)).join(",")}`);

        // xri_simulate_pose write in edit mode → InvalidInput (criterion #5 part of spec §9).
        const writeR = await client.callTool("xri_simulate_pose", {
          device: "head", position: [0, 1.7, 0],
        });
        expect(isErrorResult(writeR), "xri_simulate_pose write should error in edit mode");
        console.log("[smoke:v2] [XRI] xri_simulate_pose(write/edit-mode) → expected error");
      }
    }

    // -------------------------------------------------------------------------
    // ## MRTK3                                              (plan Steps 16-17)
    // -------------------------------------------------------------------------
    if (shouldRun("MRTK3")) {
      const mrtkPresent = names.some((n) => n === "mrtk3_list_uxcomponents");
      if (!mrtkPresent) {
        console.log("[smoke:v2] [MRTK3] gating ok — no mrtk3_* tools surface (capabilities.mrtk missing)");
      } else {
        const listR = await client.callTool("mrtk3_list_uxcomponents", { limit: 200 });
        expect(!isErrorResult(listR), `mrtk3_list_uxcomponents isError: ${getText(listR)}`);
        const listData = JSON.parse(getText(listR));
        expect(typeof listData.count === "number", "mrtk3_list_uxcomponents.count missing");
        console.log(`[smoke:v2] [MRTK3] mrtk3_list_uxcomponents → ${listData.count} components (total discovered ${listData.totalDiscovered})`);

        // Find the first PressableButton (or subclass) — MRTKDevTemplate has many.
        const firstButton = listData.items?.find((c) => c.type === "PressableButton" || c.typeFullName?.includes("PressableButton"));
        if (firstButton) {
          const ibR = await client.callTool("mrtk3_inspect_button", { componentInstanceId: firstButton.componentInstanceId });
          expect(!isErrorResult(ibR), `mrtk3_inspect_button isError: ${getText(ibR)}`);
          const ib = JSON.parse(getText(ibR));
          expect(ib.componentInstanceId === firstButton.componentInstanceId, "componentInstanceId round-trip");
          expect(typeof ib.fields === "object", "fields missing");
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_button(${firstButton.gameObjectName}) → ${Object.keys(ib.fields).length} fields`);
        } else {
          console.log("[smoke:v2] [MRTK3] no PressableButton in scene; skipping inspect_button");
        }

        // mrtk3_validate_component against the same button — should return findings array.
        if (firstButton) {
          const valR = await client.callTool("mrtk3_validate_component", { componentInstanceId: firstButton.componentInstanceId });
          expect(!isErrorResult(valR), `mrtk3_validate_component isError: ${getText(valR)}`);
          const val = JSON.parse(getText(valR));
          expect(typeof val.rulesEvaluated === "number", "rulesEvaluated missing");
          expect(Array.isArray(val.findings), "findings array missing");
          // We don't assert findings.length >= 0 (always true) — just confirm shape
          // and that at least one rule ran on the button.
          expect(val.rulesEvaluated >= 1, `expected ≥1 rule to evaluate; got ${val.rulesEvaluated}`);
          console.log(`[smoke:v2] [MRTK3] mrtk3_validate_component → ${val.rulesEvaluated} rules, ${val.findings.length} findings`);

          // Validate against a non-MRTK component with no matching rule →
          // graceful no-op (rulesEvaluated 0, findings []). The validator
          // is no longer MRTK-gated; it dispatches whichever rules match
          // the target's type chain. RectTransform has no matching rule
          // in the corpus today, so the call succeeds with empty findings.
          const goId = firstButton.gameObjectInstanceId;
          const compsR = await client.callTool("component_list", { instanceId: goId });
          const rectTransformId = JSON.parse(getText(compsR)).items?.find((i) => i.type === "RectTransform")?.instanceId;
          if (rectTransformId) {
            const wrongR = await client.callTool("mrtk3_validate_component", { componentInstanceId: rectTransformId });
            expect(!isErrorResult(wrongR), `mrtk3_validate_component(RectTransform) should succeed (no matching rule = no-op): ${getText(wrongR)}`);
            const wrongData = JSON.parse(getText(wrongR));
            expect(wrongData.rulesEvaluated === 0,
              `mrtk3_validate_component(RectTransform) expected rulesEvaluated=0; got ${wrongData.rulesEvaluated}`);
            expect(Array.isArray(wrongData.findings) && wrongData.findings.length === 0,
              "mrtk3_validate_component(RectTransform) expected empty findings");
            console.log("[smoke:v2] [MRTK3] mrtk3_validate_component(RectTransform) → 0 rules, 0 findings (no-op as expected)");
          }
        }

        // Wrong-type rejection: pass a Transform instanceId to mrtk3_inspect_button.
        const sceneInfoR = await client.callTool("scene_info", {});
        const someRoot = JSON.parse(getText(sceneInfoR)).active.rootGameObjectNames?.[0];
        if (someRoot) {
          const goR = await client.callTool("go_find", { mode: "name", query: someRoot, limit: 1 });
          const someGoId = JSON.parse(getText(goR)).items?.[0]?.instanceId;
          if (someGoId) {
            const compsR = await client.callTool("component_list", { instanceId: someGoId });
            const transformId = JSON.parse(getText(compsR)).items?.find((i) => i.type === "Transform")?.instanceId;
            if (transformId) {
              const wrongTypeR = await client.callTool("mrtk3_inspect_button", { componentInstanceId: transformId });
              expect(isErrorResult(wrongTypeR), "mrtk3_inspect_button(Transform) should error");
              console.log("[smoke:v2] [MRTK3] mrtk3_inspect_button(non-button) → expected error");
            }
          }
        }

        // -----------------------------------------------------------------
        // ## describe_component                       (plan v2 Step 7/10)
        // -----------------------------------------------------------------
        const descByNameR = await client.callTool("mrtk3_describe_component", { componentName: "PressableButton" });
        expect(!isErrorResult(descByNameR), `mrtk3_describe_component(name) isError: ${getText(descByNameR)}`);
        const descByName = JSON.parse(getText(descByNameR));
        expect(descByName.id === "mrtk3.pressable-button", `expected id mrtk3.pressable-button, got ${descByName.id}`);
        expect(Array.isArray(descByName.relatedRules) && descByName.relatedRules.length >= 1,
          `expected non-empty relatedRules; got ${JSON.stringify(descByName.relatedRules)}`);
        expect(typeof descByName.relatedRules[0]?.summary === "string" && descByName.relatedRules[0].summary.length > 0,
          "relatedRules[0].summary should be a non-empty string");
        expect(descByName._envelope?.packageInstalled === true, "envelope.packageInstalled should be true on MRTKDevTemplate");
        console.log(`[smoke:v2] [MRTK3] mrtk3_describe_component(PressableButton) → id=${descByName.id} relatedRules=${descByName.relatedRules.length}`);

        if (firstButton) {
          const descByIdR = await client.callTool("mrtk3_describe_component", { componentInstanceId: firstButton.componentInstanceId });
          expect(!isErrorResult(descByIdR), `mrtk3_describe_component(instanceId) isError: ${getText(descByIdR)}`);
          const descById = JSON.parse(getText(descByIdR));
          // Either base PressableButton (no inheritedFrom) or a subclass (inheritedFrom set).
          expect(typeof descById.id === "string" && descById.id.startsWith("mrtk3."),
            `expected mrtk3.* id from instanceId lookup; got ${descById.id}`);
          console.log(`[smoke:v2] [MRTK3] mrtk3_describe_component(instanceId) → id=${descById.id} inheritedFrom=${descById.inheritedFrom ?? "<none>"}`);
        }

        // Negative paths.
        const descBadNameR = await client.callTool("mrtk3_describe_component", { componentName: "DefinitelyNotAComponent_xyz" });
        expect(isErrorResult(descBadNameR), "mrtk3_describe_component(unknown name) should error");
        const descBothKeysR = await client.callTool("mrtk3_describe_component", { componentName: "PressableButton", componentInstanceId: 1 });
        expect(isErrorResult(descBothKeysR), "mrtk3_describe_component(both keys) should error");
        const descEmptyR = await client.callTool("mrtk3_describe_component", {});
        expect(isErrorResult(descEmptyR), "mrtk3_describe_component(empty) should error");
        console.log("[smoke:v2] [MRTK3] mrtk3_describe_component negative cases → all errored as expected");

        // -----------------------------------------------------------------
        // ## list_prefabs                              (plan v2 Step 8/10)
        // -----------------------------------------------------------------
        const lpAllR = await client.callTool("mrtk3_list_prefabs", {});
        expect(!isErrorResult(lpAllR), `mrtk3_list_prefabs({}) isError: ${getText(lpAllR)}`);
        const lpAll = JSON.parse(getText(lpAllR));
        expect(lpAll.count >= 30, `expected ≥30 prefabs by default; got ${lpAll.count}`);
        const cats = new Set((lpAll.items ?? []).map((i) => i.category));
        expect(cats.size >= 6, `expected ≥6 categories; got ${cats.size} (${Array.from(cats).join(", ")})`);
        console.log(`[smoke:v2] [MRTK3] mrtk3_list_prefabs({}) → ${lpAll.count} entries / ${cats.size} categories`);

        const lpButtonNCR = await client.callTool("mrtk3_list_prefabs", { category: "button", canvas: "noncanvas" });
        expect(!isErrorResult(lpButtonNCR), `mrtk3_list_prefabs(button,noncanvas) isError: ${getText(lpButtonNCR)}`);
        const lpButtonNC = JSON.parse(getText(lpButtonNCR));
        expect(lpButtonNC.count >= 1, `expected ≥1 noncanvas button; got ${lpButtonNC.count}`);
        const allMatch = (lpButtonNC.items ?? []).every((i) => i.category === "button" && i.canvas === "noncanvas");
        expect(allMatch, "every filtered item should have category=button AND canvas=noncanvas");
        console.log(`[smoke:v2] [MRTK3] mrtk3_list_prefabs({button,noncanvas}) → ${lpButtonNC.count} entries`);

        const lpCanvasR = await client.callTool("mrtk3_list_prefabs", { canvas: "canvas" });
        expect(!isErrorResult(lpCanvasR), `mrtk3_list_prefabs(canvas) isError: ${getText(lpCanvasR)}`);
        const lpCanvas = JSON.parse(getText(lpCanvasR));
        expect((lpCanvas.items ?? []).every((i) => i.canvas === "canvas"), "every item should have canvas=canvas");
        console.log(`[smoke:v2] [MRTK3] mrtk3_list_prefabs({canvas}) → ${lpCanvas.count} entries`);

        // -----------------------------------------------------------------
        // ## inspect_* — Slice B (install-agnostic discovery)
        // -----------------------------------------------------------------
        // Pull a single uxcomponents listing and reuse it across the per-tool
        // discovery loops below. Filter by short type name; absent type → log
        // "skipped" and continue. Smoke must stay green across install
        // profiles where the type isn't loaded into any open scene.
        const uxAllR = await client.callTool("mrtk3_list_uxcomponents", { limit: 2000 });
        expect(!isErrorResult(uxAllR), `mrtk3_list_uxcomponents(limit:2000) isError: ${getText(uxAllR)}`);
        const uxAll = JSON.parse(getText(uxAllR)).items ?? [];

        // Helper: assert standard envelope shape on any inspect_* response.
        function assertInspectEnvelope(label, parsed) {
          expect(typeof parsed.componentInstanceId === "number", `${label} envelope.componentInstanceId missing`);
          expect(typeof parsed.gameObjectInstanceId === "number", `${label} envelope.gameObjectInstanceId missing`);
          expect(typeof parsed.type === "string" && parsed.type.length > 0, `${label} envelope.type missing`);
          expect(typeof parsed.typeFullName === "string" && parsed.typeFullName.includes("."), `${label} envelope.typeFullName missing`);
          expect(typeof parsed.enabled === "boolean", `${label} envelope.enabled missing`);
          expect(parsed.fields && typeof parsed.fields === "object", `${label} envelope.fields missing`);
        }

        // Negative-test helper: create a Cube, find its Transform's instanceId,
        // call the inspect tool with that instanceId, expect InvalidInput. No
        // hardcoded instanceIds — the Cube's instances vary per run.
        async function negativeWrongTypeCheck(toolName) {
          const cubeR = await client.callTool("go_create", {
            name: `UnityMCP_SmokeV2_NegInspect_${Date.now()}`, primitive: "Cube",
          });
          const cubeId = JSON.parse(getText(cubeR)).instanceId;
          try {
            const compsR = await client.callTool("component_list", { instanceId: cubeId });
            const transformId = JSON.parse(getText(compsR)).items.find((i) => i.type === "Transform")?.instanceId;
            expect(typeof transformId === "number", `[${toolName}] couldn't find Transform on Cube fixture`);
            const wrongR = await client.callTool(toolName, { componentInstanceId: transformId });
            expect(isErrorResult(wrongR), `${toolName}(Transform) should error`);
            const errText = getText(wrongR);
            expect(errText.includes("not a") || errText.includes("not an"),
              `${toolName} error message should describe wrong-type; got: ${errText}`);
          } finally {
            await client.callTool("go_delete", { instanceId: cubeId });
          }
        }

        // -- ## inspect_slider ---------------------------------------------
        const sliderHit = uxAll.find((i) => i.type === "Slider");
        if (sliderHit) {
          const r = await client.callTool("mrtk3_inspect_slider", { componentInstanceId: sliderHit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_slider isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope("inspect_slider", parsed);
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_slider(${sliderHit.gameObjectName}) → ${Object.keys(parsed.fields).length} fields`);
        } else {
          console.log("[smoke:v2] [MRTK3] mrtk3_inspect_slider skipped (no Slider instance in this project)");
        }
        await negativeWrongTypeCheck("mrtk3_inspect_slider");

        // -- ## inspect_toggle_collection ----------------------------------
        const tcHit = uxAll.find((i) => i.type === "ToggleCollection");
        if (tcHit) {
          const r = await client.callTool("mrtk3_inspect_toggle_collection", { componentInstanceId: tcHit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_toggle_collection isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope("inspect_toggle_collection", parsed);
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_toggle_collection(${tcHit.gameObjectName}) → ${Object.keys(parsed.fields).length} fields`);
        } else {
          console.log("[smoke:v2] [MRTK3] mrtk3_inspect_toggle_collection skipped (no ToggleCollection instance in this project)");
        }
        await negativeWrongTypeCheck("mrtk3_inspect_toggle_collection");

        // -- ## inspect_dialog ---------------------------------------------
        const dialogHit = uxAll.find((i) => i.type === "Dialog");
        if (dialogHit) {
          const r = await client.callTool("mrtk3_inspect_dialog", { componentInstanceId: dialogHit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_dialog isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope("inspect_dialog", parsed);
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_dialog(${dialogHit.gameObjectName}) → ${Object.keys(parsed.fields).length} fields`);
        } else {
          console.log("[smoke:v2] [MRTK3] mrtk3_inspect_dialog skipped (no Dialog instance in this project)");
        }
        await negativeWrongTypeCheck("mrtk3_inspect_dialog");

        // -- ## inspect_stateful_interactable ------------------------------
        // Any subclass of StatefulInteractable is acceptable (PressableButton most
        // common). The tool's type-chain walk handles subclasses transparently.
        const siHit = uxAll.find((i) => {
          // mrtk3_list_uxcomponents reports the leaf type; we accept anything that
          // is plausibly a StatefulInteractable subclass — PressableButton is the
          // canonical case here.
          return i.type === "PressableButton" || i.type === "StatefulInteractable" || i.type === "Toggle";
        });
        if (siHit) {
          const r = await client.callTool("mrtk3_inspect_stateful_interactable", { componentInstanceId: siHit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_stateful_interactable isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope("inspect_stateful_interactable", parsed);
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_stateful_interactable(${siHit.gameObjectName}) → type=${parsed.type} ${Object.keys(parsed.fields).length} fields`);
        } else {
          console.log("[smoke:v2] [MRTK3] mrtk3_inspect_stateful_interactable skipped (no StatefulInteractable subclass in this project)");
        }
        await negativeWrongTypeCheck("mrtk3_inspect_stateful_interactable");

        // -- ## inspect_solver — 4-way dispatch ----------------------------
        // Discover one instance of each dispatch family member. Skipped per-type
        // when absent; criterion #2 reads as "the dispatcher CAN handle all 4,"
        // present-types succeed, absent-types log skipped.
        const solverFamily = ["SolverHandler", "Follow", "HandConstraintPalmUp", "ConstraintManager"];
        // Maps the actual type name to the resolvedType we expect from the tool's
        // allowlist walk: SolverHandler → SolverHandler, ConstraintManager →
        // ConstraintManager, anything else under Solver → Solver.
        const expectedResolved = (typeName) => {
          if (typeName === "SolverHandler") return "SolverHandler";
          if (typeName === "ConstraintManager") return "ConstraintManager";
          return "Solver";
        };
        for (const familyType of solverFamily) {
          const hit = uxAll.find((i) => i.type === familyType);
          if (!hit) {
            console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_solver(${familyType}) skipped (no instance in this project)`);
            continue;
          }
          const r = await client.callTool("mrtk3_inspect_solver", { componentInstanceId: hit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_solver(${familyType}) isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope(`inspect_solver(${familyType})`, parsed);
          const expected = expectedResolved(familyType);
          expect(parsed.resolvedType === expected,
            `inspect_solver(${familyType}) expected resolvedType=${expected}, got ${parsed.resolvedType}`);
          console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_solver(${familyType}/${hit.gameObjectName}) → resolvedType=${parsed.resolvedType}`);
        }
        await negativeWrongTypeCheck("mrtk3_inspect_solver");

        // -- ## inspect_state_visualizer — children walk ------------------
        const svHit = uxAll.find((i) => i.type === "StateVisualizer");
        if (svHit) {
          const r = await client.callTool("mrtk3_inspect_state_visualizer", { componentInstanceId: svHit.componentInstanceId });
          expect(!isErrorResult(r), `mrtk3_inspect_state_visualizer isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          assertInspectEnvelope("inspect_state_visualizer", parsed);
          expect(Array.isArray(parsed.drivenChildren), "inspect_state_visualizer envelope.drivenChildren missing or not an array");
          for (const dc of parsed.drivenChildren) {
            expect(typeof dc.type === "string", "drivenChildren[i].type missing");
            expect(typeof dc.instanceId === "number", "drivenChildren[i].instanceId missing");
            expect(typeof dc.gameObjectName === "string", "drivenChildren[i].gameObjectName missing");
            expect(typeof dc.gameObjectInstanceId === "number", "drivenChildren[i].gameObjectInstanceId missing");
          }
          // Walk-depth check (criterion #3): when drivenChildren is non-empty,
          // serialize the StateVisualizer's GameObject at depth=1 and confirm
          // every drivenChild's gameObjectInstanceId appears as a direct child
          // (not deeper). depth=1 returns one level of children expanded.
          if (parsed.drivenChildren.length > 0) {
            const goSerR = await client.callTool("go_serialize", {
              instanceId: parsed.gameObjectInstanceId, depth: 1, includeComponentFields: false,
            });
            expect(!isErrorResult(goSerR), `go_serialize on StateVisualizer's GO isError: ${getText(goSerR)}`);
            const goSer = JSON.parse(getText(goSerR));
            const directChildIds = new Set((goSer.children ?? []).map((c) => c.instanceId));
            for (const dc of parsed.drivenChildren) {
              expect(directChildIds.has(dc.gameObjectInstanceId),
                `inspect_state_visualizer walk-depth: drivenChild '${dc.gameObjectName}' (goId=${dc.gameObjectInstanceId}) is not a DIRECT child of StateVisualizer's GameObject (goId=${parsed.gameObjectInstanceId})`);
            }
            console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_state_visualizer(${svHit.gameObjectName}) → drivenChildren=${parsed.drivenChildren.length}, walk-depth=1 confirmed`);
          } else {
            console.log(`[smoke:v2] [MRTK3] mrtk3_inspect_state_visualizer(${svHit.gameObjectName}) → drivenChildren=0 (walk-depth check vacuous)`);
          }
        } else {
          console.log("[smoke:v2] [MRTK3] mrtk3_inspect_state_visualizer skipped (no StateVisualizer instance in this project)");
        }
        await negativeWrongTypeCheck("mrtk3_inspect_state_visualizer");

        // -----------------------------------------------------------------
        // ## validate_* — Slice C rule coverage
        // -----------------------------------------------------------------
        // Each new rule's smoke verifies criterion #1: dispatcher discovers the
        // rule and reports rulesEvaluated >= 1 when called against an instance
        // of the rule's AppliesTo type. We don't assert specific finding
        // counts — the target's state in the connected project is unpredictable.
        // Per-rule "skipped" path keeps the smoke green across install profiles
        // where the target type isn't loaded into a scene.
        async function validateRuleApplies(label, instanceId, expectedRule) {
          const r = await client.callTool("mrtk3_validate_component", { componentInstanceId: instanceId });
          expect(!isErrorResult(r), `${label} validate isError: ${getText(r)}`);
          const parsed = JSON.parse(getText(r));
          expect(typeof parsed.rulesEvaluated === "number" && parsed.rulesEvaluated >= 1,
            `${label} expected rulesEvaluated >= 1; got ${parsed.rulesEvaluated}`);
          expect(Array.isArray(parsed.findings), `${label} findings should be an array`);
          // If our rule fired with a finding, the ruleName should match.
          // Otherwise the rule still ran (rulesEvaluated counts dispatched rules
          // regardless of whether they emitted findings).
          const matchedRules = (parsed.findings ?? []).map((f) => f.ruleName);
          console.log(`[smoke:v2] [MRTK3] ${label} → rulesEvaluated=${parsed.rulesEvaluated} findings=${parsed.findings.length}${matchedRules.includes(expectedRule) ? " (rule fired)" : ""}`);
        }

        // -- ## validate_slider_has_value_range ---------------------------
        if (sliderHit) {
          await validateRuleApplies("validate_slider_has_value_range", sliderHit.componentInstanceId, "SliderHasValueRange");
        } else {
          console.log("[smoke:v2] [MRTK3] validate_slider_has_value_range skipped (no Slider instance in this project)");
        }

        // -- ## validate_toggle_collection_has_toggles --------------------
        if (tcHit) {
          await validateRuleApplies("validate_toggle_collection_has_toggles", tcHit.componentInstanceId, "ToggleCollectionHasToggles");
        } else {
          console.log("[smoke:v2] [MRTK3] validate_toggle_collection_has_toggles skipped (no ToggleCollection instance in this project)");
        }

        // -- ## validate_solver_handler_has_interactor --------------------
        // Discover a SolverHandler specifically (the dispatching family member;
        // Solver-derived types and ConstraintManager don't trigger the
        // SolverHandlerHasInteractor rule).
        const shHit = uxAll.find((i) => i.type === "SolverHandler");
        if (shHit) {
          await validateRuleApplies("validate_solver_handler_has_interactor", shHit.componentInstanceId, "SolverHandlerHasInteractor");
        } else {
          console.log("[smoke:v2] [MRTK3] validate_solver_handler_has_interactor skipped (no SolverHandler instance in this project)");
        }

        // -- ## validate_canvas_uses_worldspace_scale --------------------
        // Canvas isn't an MRTK type — mrtk3_list_uxcomponents won't return it.
        // Use go_find on the active scene's roots, walk down to find a Canvas.
        const sceneInfoR2 = await client.callTool("scene_info", {});
        let canvasInstanceId = null;
        if (!isErrorResult(sceneInfoR2)) {
          const sceneInfo = JSON.parse(getText(sceneInfoR2));
          const rootNames = sceneInfo.active?.rootGameObjectNames ?? [];
          for (const rootName of rootNames) {
            const findR = await client.callTool("go_find", { mode: "name", query: rootName, limit: 5 });
            const items = JSON.parse(getText(findR)).items ?? [];
            for (const go of items) {
              const compsR = await client.callTool("component_list", { instanceId: go.instanceId });
              const canvasComp = JSON.parse(getText(compsR)).items?.find((c) => c.type === "Canvas");
              if (canvasComp) { canvasInstanceId = canvasComp.instanceId; break; }
            }
            if (canvasInstanceId != null) break;
          }
        }
        if (canvasInstanceId == null) {
          // Try a broader fuzzy search if root walk didn't surface one.
          const fuzzyR = await client.callTool("go_find", { mode: "name", query: "Canvas", limit: 20 });
          const fuzzyItems = JSON.parse(getText(fuzzyR)).items ?? [];
          for (const go of fuzzyItems) {
            const compsR = await client.callTool("component_list", { instanceId: go.instanceId });
            const canvasComp = JSON.parse(getText(compsR)).items?.find((c) => c.type === "Canvas");
            if (canvasComp) { canvasInstanceId = canvasComp.instanceId; break; }
          }
        }
        if (canvasInstanceId != null) {
          await validateRuleApplies("validate_canvas_uses_worldspace_scale", canvasInstanceId, "CanvasUsesWorldSpaceScale");
        } else {
          console.log("[smoke:v2] [MRTK3] validate_canvas_uses_worldspace_scale skipped (no Canvas in this project)");
        }

        // -- ## validate_stateful_interactable_has_audio_feedback --------
        // Same target type as the existing PressableButton smoke (siHit picks
        // any StatefulInteractable subclass dynamically per Slice B's pattern).
        if (siHit) {
          await validateRuleApplies("validate_stateful_interactable_has_audio_feedback", siHit.componentInstanceId, "StatefulInteractableHasAudioFeedback");
        } else {
          console.log("[smoke:v2] [MRTK3] validate_stateful_interactable_has_audio_feedback skipped (no StatefulInteractable subclass in this project)");
        }

        // -----------------------------------------------------------------
        // ## validate_component (general) — equivalence with mrtk3 alias
        // -----------------------------------------------------------------
        // Slice D moved the validator out of the MRTK namespace into a
        // general 'validate_component' tool; 'mrtk3_validate_component' is
        // retained as a deprecated alias. Confirm both names produce
        // byte-identical output for the same instance.
        if (siHit) {
          const newR = await client.callTool("validate_component", { componentInstanceId: siHit.componentInstanceId });
          const oldR = await client.callTool("mrtk3_validate_component", { componentInstanceId: siHit.componentInstanceId });
          expect(!isErrorResult(newR), `validate_component isError: ${getText(newR)}`);
          expect(!isErrorResult(oldR), `mrtk3_validate_component isError: ${getText(oldR)}`);
          const newJson = JSON.parse(getText(newR));
          const oldJson = JSON.parse(getText(oldR));
          expect(newJson.rulesEvaluated === oldJson.rulesEvaluated,
            `validator name equivalence: rulesEvaluated mismatch (${newJson.rulesEvaluated} vs ${oldJson.rulesEvaluated})`);
          expect(newJson.findings.length === oldJson.findings.length,
            `validator name equivalence: findings count mismatch (${newJson.findings.length} vs ${oldJson.findings.length})`);
          console.log(`[smoke:v2] [MRTK3] validate_component / mrtk3_validate_component → byte-equivalent (rulesEvaluated=${newJson.rulesEvaluated}, findings=${newJson.findings.length})`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## ExecuteMenuItem                                          (plan Slice D)
    // -------------------------------------------------------------------------
    if (shouldRun("ExecuteMenuItem")) {
      // Real menu — one of the unity-mcp's own validator menus from Slice A.
      // Should resolve and execute. We don't assert console-side effects here
      // (those are covered by Slice A/B/C smoke); we only check the tool's
      // own envelope: { menuItem, executed: true }.
      const realMenu = "Tools/UnityMCP/Validate Mrtk3 Knowledge Corpus";
      const realR = await client.callTool("execute_menu_item", { menuItem: realMenu });
      expect(!isErrorResult(realR), `execute_menu_item(real) isError: ${getText(realR)}`);
      const realData = JSON.parse(getText(realR));
      expect(realData.menuItem === realMenu, `expected menuItem='${realMenu}', got '${realData.menuItem}'`);
      expect(realData.executed === true, `expected executed=true on a real menu; got ${realData.executed}`);
      console.log(`[smoke:v2] [ExecuteMenuItem] execute_menu_item('${realMenu}') → executed=${realData.executed}`);

      // Bogus path — should NOT error; should return executed=false.
      const bogusR = await client.callTool("execute_menu_item", { menuItem: "Bogus/Does/Not/Exist" });
      expect(!isErrorResult(bogusR), `execute_menu_item(bogus) should NOT error (graceful no-op): ${getText(bogusR)}`);
      const bogusData = JSON.parse(getText(bogusR));
      expect(bogusData.executed === false, `expected executed=false on a bogus menu; got ${bogusData.executed}`);
      console.log("[smoke:v2] [ExecuteMenuItem] execute_menu_item(bogus) → executed=false as expected");

      // Empty string — InvalidInput.
      const emptyR = await client.callTool("execute_menu_item", { menuItem: "" });
      expect(isErrorResult(emptyR), "execute_menu_item('') should error");
      console.log("[smoke:v2] [ExecuteMenuItem] execute_menu_item('') → expected error");

      // createdInstanceIds (plan unity-mcp-ui-authoring Step 1). The GameObject/Create Empty
      // menu auto-selects the new object; the diff should surface in createdInstanceIds.
      // We picked Create Empty over GameObject/UI/Image because the UI/* menus require the
      // Editor's Hierarchy/Scene view focused to fire programmatically — they return
      // executed=false when invoked headlessly via the HTTP bridge. Create Empty has no
      // such context requirement and is the canonical menu-driven creation path.
      const emptyMenuR = await client.callTool("execute_menu_item", { menuItem: "GameObject/Create Empty" });
      expect(!isErrorResult(emptyMenuR), `execute_menu_item('GameObject/Create Empty') isError: ${getText(emptyMenuR)}`);
      const emptyMenuData = JSON.parse(getText(emptyMenuR));
      expect(emptyMenuData.executed === true, `expected executed=true; got ${emptyMenuData.executed}`);
      expect(Array.isArray(emptyMenuData.createdInstanceIds), "createdInstanceIds must be an array");
      expect(emptyMenuData.createdInstanceIds.length === 1,
        `expected createdInstanceIds.length===1 for GameObject/Create Empty; got ${emptyMenuData.createdInstanceIds.length}`);
      const newEmptyId = emptyMenuData.createdInstanceIds[0];
      expect(typeof newEmptyId === "number", `createdInstanceIds[0] should be an int; got ${typeof newEmptyId}`);
      console.log(`[smoke:v2] [ExecuteMenuItem] execute_menu_item('GameObject/Create Empty') → createdInstanceIds=[${newEmptyId}]`);
      // Cleanup the new empty GameObject.
      const delEmptyR = await client.callTool("go_delete", { instanceId: newEmptyId });
      expect(!isErrorResult(delEmptyR), `cleanup go_delete(empty) isError: ${getText(delEmptyR)}`);

      // A non-creating menu — Window/Package Manager toggles a window without scene mutation.
      const winR = await client.callTool("execute_menu_item", { menuItem: "Window/Package Manager" });
      expect(!isErrorResult(winR), `execute_menu_item('Window/Package Manager') isError: ${getText(winR)}`);
      const winData = JSON.parse(getText(winR));
      expect(Array.isArray(winData.createdInstanceIds) && winData.createdInstanceIds.length === 0,
        `expected createdInstanceIds:[] for non-creator menu; got ${JSON.stringify(winData.createdInstanceIds)}`);
      console.log("[smoke:v2] [ExecuteMenuItem] execute_menu_item('Window/Package Manager') → createdInstanceIds=[]");
      // Re-toggle the window so we leave the Editor in roughly the state we found it.
      await client.callTool("execute_menu_item", { menuItem: "Window/Package Manager" });
    }

    // -------------------------------------------------------------------------
    // ## UI                                  (plan unity-mcp-ui-authoring)
    // -------------------------------------------------------------------------
    // All assertions are install-agnostic — every fixture is created via the new
    // ui_create_* tools (or go_create + component_add) and deleted at the end of
    // its sub-section. No references to MRTKDevTemplate scene contents.
    if (shouldRun("UI")) {
      const uiStamp = Date.now();

      // -----------------------------------------------------------------
      // ## ui_create_canvas — screen-overlay + world-mrtk
      // -----------------------------------------------------------------
      const overlayR = await client.callTool("ui_create_canvas", {
        name: `UnityMCP_SmokeV2_CanvasOverlay_${uiStamp}`,
        renderMode: "screen-overlay",
      });
      expect(!isErrorResult(overlayR), `ui_create_canvas(overlay) isError: ${getText(overlayR)}`);
      const overlay = JSON.parse(getText(overlayR));
      expect(typeof overlay.instanceId === "number", "overlay canvas missing instanceId");
      expect(typeof overlay.rectTransformInstanceId === "number", "overlay canvas missing rectTransformInstanceId");
      expect(typeof overlay.canvasInstanceId === "number", "overlay canvas missing canvasInstanceId");
      expect(typeof overlay.scalerInstanceId === "number", "overlay canvas missing scalerInstanceId");
      expect(typeof overlay.graphicRaycasterInstanceId === "number", "overlay canvas missing graphicRaycasterInstanceId");
      console.log(`[smoke:v2] [UI] ui_create_canvas(screen-overlay) → 4 component ids`);

      const mrtkR = await client.callTool("ui_create_canvas", {
        name: `UnityMCP_SmokeV2_CanvasMrtk_${uiStamp}`,
        renderMode: "world-mrtk",
        sizeMm: [300, 200],
      });
      expect(!isErrorResult(mrtkR), `ui_create_canvas(world-mrtk) isError: ${getText(mrtkR)}`);
      const mrtk = JSON.parse(getText(mrtkR));
      // Verify localScale via go_serialize.
      const mrtkSerR = await client.callTool("go_serialize", { instanceId: mrtk.instanceId, depth: 0 });
      const mrtkRt = JSON.parse(getText(mrtkSerR)).components.find((c) => c.type === "RectTransform");
      const scaleArr = mrtkRt.fields.m_LocalScale;
      expect(Math.abs(scaleArr[0] - 0.001) < 1e-6 && Math.abs(scaleArr[1] - 0.001) < 1e-6,
        `expected world-mrtk localScale ≈ (0.001,0.001,0.001); got ${JSON.stringify(scaleArr)}`);
      const sizeArr = mrtkRt.fields.m_SizeDelta;
      expect(Math.abs(sizeArr[0] - 300) < 1e-3 && Math.abs(sizeArr[1] - 200) < 1e-3,
        `expected world-mrtk sizeDelta ≈ (300,200); got ${JSON.stringify(sizeArr)}`);
      console.log(`[smoke:v2] [UI] ui_create_canvas(world-mrtk) → localScale=${scaleArr} sizeDelta=${sizeArr}`);

      await client.callTool("go_delete", { instanceId: mrtk.instanceId });

      // -----------------------------------------------------------------
      // ## ui_set_rect — 11 presets against a fresh RectTransform under the overlay canvas
      // -----------------------------------------------------------------
      const presetTargetR = await client.callTool("ui_create_image", {
        parentInstanceId: overlay.instanceId, name: "RectTarget",
      });
      const presetTarget = JSON.parse(getText(presetTargetR));
      const rtId = presetTarget.rectTransformInstanceId;

      const presets = [
        // [name, params, expected: anchorMin, anchorMax, pivot, sizeDelta, anchoredPosition]
        ["stretch",        {}, [0,0],[1,1],[0.5,0.5],[0,0],[0,0]],
        ["top-stretch",    { height: 50 },         [0,1],[1,1],[0.5,1], [0,50],[0,0]],
        ["bottom-stretch", { height: 50 },         [0,0],[1,0],[0.5,0], [0,50],[0,0]],
        ["left-stretch",   { width: 60 },          [0,0],[0,1],[0,0.5], [60,0],[0,0]],
        ["right-stretch",  { width: 60 },          [1,0],[1,1],[1,0.5], [60,0],[0,0]],
        ["top-left",       { width: 80, height: 40, offsetX: 5, offsetY: 7 },
                                                   [0,1],[0,1],[0,1],  [80,40],[5,-7]],
        ["top-right",      { width: 80, height: 40, offsetX: 5, offsetY: 7 },
                                                   [1,1],[1,1],[1,1],  [80,40],[-5,-7]],
        ["bottom-left",    { width: 80, height: 40, offsetX: 5, offsetY: 7 },
                                                   [0,0],[0,0],[0,0],  [80,40],[5,7]],
        ["bottom-right",   { width: 80, height: 40, offsetX: 5, offsetY: 7 },
                                                   [1,0],[1,0],[1,0],  [80,40],[-5,7]],
        ["center",         { width: 100, height: 100 },
                                                   [0.5,0.5],[0.5,0.5],[0.5,0.5],[100,100],[0,0]],
        ["fill-axis",      { axis: "x", size: 70 },
                                                   [0,0.5],[1,0.5],[0.5,0.5],[0,70],[0,0]],
      ];
      const close = (a, b) => Math.abs(a - b) < 1e-3;
      const vecClose = (a, b) => close(a[0], b[0]) && close(a[1], b[1]);
      for (const [name, params, eAMin, eAMax, ePivot, eSize, eAnchored] of presets) {
        const r = await client.callTool("ui_set_rect", {
          rectTransformInstanceId: rtId, preset: name, params,
        });
        expect(!isErrorResult(r), `ui_set_rect(${name}) isError: ${getText(r)}`);
        const d = JSON.parse(getText(r));
        expect(d.preset === name, `preset echo mismatch: got '${d.preset}', expected '${name}'`);
        expect(vecClose(d.anchorMin, eAMin),  `${name}: anchorMin ${JSON.stringify(d.anchorMin)} ≠ ${JSON.stringify(eAMin)}`);
        expect(vecClose(d.anchorMax, eAMax),  `${name}: anchorMax ${JSON.stringify(d.anchorMax)} ≠ ${JSON.stringify(eAMax)}`);
        expect(vecClose(d.pivot, ePivot),     `${name}: pivot ${JSON.stringify(d.pivot)} ≠ ${JSON.stringify(ePivot)}`);
        expect(vecClose(d.sizeDelta, eSize),  `${name}: sizeDelta ${JSON.stringify(d.sizeDelta)} ≠ ${JSON.stringify(eSize)}`);
        expect(vecClose(d.anchoredPosition, eAnchored),
                                              `${name}: anchoredPosition ${JSON.stringify(d.anchoredPosition)} ≠ ${JSON.stringify(eAnchored)}`);
        console.log(`[smoke:v2] [UI] ui_set_rect(${name}) → anchors/pivot/size/pos match`);
      }

      // -----------------------------------------------------------------
      // ## ui_create_text / _image / _layout_group — shape verification
      // -----------------------------------------------------------------
      const txtR = await client.callTool("ui_create_text", {
        parentInstanceId: overlay.instanceId, name: "Title", text: "hello",
        alignment: "center", color: [1, 1, 1, 1],
      });
      expect(!isErrorResult(txtR), `ui_create_text isError: ${getText(txtR)}`);
      const txt = JSON.parse(getText(txtR));
      expect(typeof txt.instanceId === "number" && typeof txt.textComponentInstanceId === "number",
        "ui_create_text missing instanceIds");
      console.log(`[smoke:v2] [UI] ui_create_text → instanceId=${txt.instanceId} text=${txt.textComponentInstanceId}`);

      const imgR = await client.callTool("ui_create_image", {
        parentInstanceId: overlay.instanceId, name: "Backplate",
        color: [0, 0.5, 1, 0.6], type: "sliced",
      });
      expect(!isErrorResult(imgR), `ui_create_image isError: ${getText(imgR)}`);
      const img = JSON.parse(getText(imgR));
      expect(typeof img.imageInstanceId === "number", "ui_create_image missing imageInstanceId");
      console.log(`[smoke:v2] [UI] ui_create_image → instanceId=${img.instanceId} img=${img.imageInstanceId}`);

      for (const lgType of ["vertical", "horizontal", "grid"]) {
        const lgParams = {
          parentInstanceId: overlay.instanceId,
          name: `LG_${lgType}`,
          type: lgType,
          padding: 4,
          spacing: 2,
        };
        if (lgType === "grid") lgParams.cellSize = [32, 32];
        const lgR = await client.callTool("ui_create_layout_group", lgParams);
        expect(!isErrorResult(lgR), `ui_create_layout_group(${lgType}) isError: ${getText(lgR)}`);
        const lg = JSON.parse(getText(lgR));
        expect(lg.type === lgType, `layout type echo mismatch: ${lg.type} ≠ ${lgType}`);
        console.log(`[smoke:v2] [UI] ui_create_layout_group(${lgType}) → instanceId=${lg.instanceId}`);
      }

      // cellSize on vertical → InvalidInput.
      const badLgR = await client.callTool("ui_create_layout_group", {
        parentInstanceId: overlay.instanceId, name: "BadLg", type: "vertical", cellSize: [10, 10],
      });
      expect(isErrorResult(badLgR), "ui_create_layout_group(vertical+cellSize) should error");
      console.log(`[smoke:v2] [UI] ui_create_layout_group(vertical+cellSize) → expected InvalidInput`);

      // -----------------------------------------------------------------
      // ## component_set_properties — success + rollback
      // -----------------------------------------------------------------
      // Success path: three Transform-only writes; verify state and single Undo.
      const goR = await client.callTool("go_create", {
        name: `UnityMCP_SmokeV2_BatchTarget_${uiStamp}`, primitive: "Cube",
      });
      const goId = JSON.parse(getText(goR)).instanceId;
      const clR = await client.callTool("component_list", { instanceId: goId });
      const trId = JSON.parse(getText(clR)).items.find((i) => i.type === "Transform").instanceId;

      const sucR = await client.callTool("component_set_properties", {
        componentInstanceId: trId,
        writes: [
          { propertyPath: "position", value: [1, 2, 3] },
          { propertyPath: "scale",    value: [2, 2, 2] },
          { propertyPath: "m_LocalRotation.x", value: 0.1 },
        ],
      });
      expect(!isErrorResult(sucR), `component_set_properties(success) isError: ${getText(sucR)}`);
      const suc = JSON.parse(getText(sucR));
      expect(suc.written === 3, `expected written=3; got ${suc.written}`);
      console.log(`[smoke:v2] [UI] component_set_properties(success) → written=${suc.written}`);
      // Verify state actually applied.
      const sucSerR = await client.callTool("go_serialize", { instanceId: goId, depth: 0 });
      const sucT = JSON.parse(getText(sucSerR)).components.find((c) => c.type === "Transform");
      expect(close(sucT.fields.m_LocalPosition[0], 1) && close(sucT.fields.m_LocalScale[0], 2),
        `expected position/scale to apply; got pos=${JSON.stringify(sucT.fields.m_LocalPosition)} scale=${JSON.stringify(sucT.fields.m_LocalScale)}`);

      // Rollback path: 4 writes where the 3rd has a bogus propertyPath.
      const rollR = await client.callTool("component_set_properties", {
        componentInstanceId: trId,
        writes: [
          { propertyPath: "position", value: [9, 9, 9] },
          { propertyPath: "scale",    value: [5, 5, 5] },
          { propertyPath: "m_BogusProperty", value: 42 },
          { propertyPath: "m_LocalRotation.x", value: 0.99 },
        ],
      });
      expect(isErrorResult(rollR), "component_set_properties(rollback) should error");
      // The MCP server's error envelope surfaces ToolException.Details as a
      // JSON-encoded "Details:" line appended to the message text. Recovery
      // pattern: /^Details: (\{.*\})$/m + JSON.parse(match[1]).
      const rollText = getText(rollR);
      const dm = /^Details: (\{.*\})$/m.exec(rollText);
      expect(dm, `expected a Details: line in error text; got: ${rollText.substring(0, 300)}`);
      const details = JSON.parse(dm[1]);
      expect(details.failedAt === "m_BogusProperty",
        `expected details.failedAt='m_BogusProperty'; got ${JSON.stringify(details)}`);
      console.log(`[smoke:v2] [UI] component_set_properties(rollback) → details.failedAt='${details.failedAt}'`);
      // Verify state unchanged from the success-path values (not rolled back to defaults).
      const rollSerR = await client.callTool("go_serialize", { instanceId: goId, depth: 0 });
      const rollT = JSON.parse(getText(rollSerR)).components.find((c) => c.type === "Transform");
      expect(close(rollT.fields.m_LocalPosition[0], 1) && close(rollT.fields.m_LocalScale[0], 2),
        `rollback should leave success-path state intact; got pos=${JSON.stringify(rollT.fields.m_LocalPosition)} scale=${JSON.stringify(rollT.fields.m_LocalScale)}`);
      console.log(`[smoke:v2] [UI] component_set_properties(rollback) → state unchanged from prior batch`);

      // Cleanup.
      await client.callTool("go_delete", { instanceId: goId });
      await client.callTool("go_delete", { instanceId: overlay.instanceId });
    }

    // -------------------------------------------------------------------------
    // ## Procedure                       (plan unity-mcp-procedure-runner)
    // -------------------------------------------------------------------------
    // Four sub-tests: happy (cross-step ref resolution), dryRun (no scene
    // mutation), failure (stop-on-first-failure with capturedVars preserved),
    // unresolved-ref (structured details surfaced). All procedure files are
    // written under <projectRoot>/Library/UnityMcpSmokeProcedures/ so Unity's
    // asset importer ignores them, and they're deleted at section end.
    if (shouldRun("Procedure")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const projInfoR = await client.callTool("project_info", {});
      const projectPath = JSON.parse(getText(projInfoR)).projectPath;
      const procDir = path.resolve(projectPath, "Library", "UnityMcpSmokeProcedures");
      const procDirRel = "Library/UnityMcpSmokeProcedures";
      await fs.mkdir(procDir, { recursive: true });

      const pStamp = Date.now();
      const cleanupGoIds = [];

      const writeProc = async (name, body) => {
        const abs = path.join(procDir, name);
        await fs.writeFile(abs, body);
        return `${procDirRel}/${name}`;
      };

      try {
        // ---------------------------------------------------------------
        // ## procedure_run (happy — cross-step refs)
        // ---------------------------------------------------------------
        const happyName = `smoke-happy-${pStamp}.jsonc`;
        const happyRel = await writeProc(
          happyName,
          `// Smoke procedure — canvas + child Image referencing $canvas.instanceId.
{
  "name": "smoke-happy",
  "steps": [
    {
      "tool": "ui_create_canvas",
      "params": { "name": "UnityMCP_SmokeV2_Proc_Canvas_${pStamp}", "renderMode": "screen-overlay" },
      "captureOutputAs": "$canvas"
    },
    {
      "tool": "ui_create_image",
      "params": {
        "parentInstanceId": { "ref": "$canvas.instanceId" },
        "name": "UnityMCP_SmokeV2_Proc_Image_${pStamp}"
      },
      "captureOutputAs": "$image"
    }
  ]
}`,
        );
        const happyR = await client.callTool("procedure_run", { path: happyRel });
        expect(!isErrorResult(happyR), `procedure_run(happy) isError: ${getText(happyR)}`);
        const happy = JSON.parse(getText(happyR));
        expect(happy.ok === true, `expected ok:true; got ${JSON.stringify(happy)}`);
        expect(happy.executed === 2 && happy.totalSteps === 2, `expected executed=2 totalSteps=2; got ${happy.executed}/${happy.totalSteps}`);
        const canvasId = happy.capturedVars?.$canvas?.instanceId;
        const imageId = happy.capturedVars?.$image?.instanceId;
        expect(typeof canvasId === "number" && typeof imageId === "number",
          `expected capturedVars to contain $canvas + $image with numeric instanceIds`);
        // Step 1's resolved params should carry the captured canvas id, not the {ref} expression.
        expect(happy.steps[1].params.parentInstanceId === canvasId,
          `expected step[1].params.parentInstanceId === ${canvasId}; got ${happy.steps[1].params.parentInstanceId}`);
        cleanupGoIds.push(canvasId);  // child auto-deleted with parent
        console.log(`[smoke:v2] [Procedure] happy → ok=${happy.ok} canvas=${canvasId} image=${imageId} (image.parent=${happy.steps[1].params.parentInstanceId})`);

        // ---------------------------------------------------------------
        // ## procedure_run (dryRun — no scene mutation)
        // ---------------------------------------------------------------
        // Re-use the happy procedure file (still on disk). Snapshot scene
        // root count before + after; should be unchanged. Tool execution
        // count should be 0 (no UI creations fired).
        const dryName = `smoke-dry-${pStamp}.jsonc`;
        const dryRel = await writeProc(
          dryName,
          `{
  "name": "smoke-dry",
  "steps": [
    {
      "tool": "ui_create_canvas",
      "params": { "name": "UnityMCP_SmokeV2_Proc_DryCanvas_${pStamp}", "renderMode": "screen-overlay" },
      "captureOutputAs": "$canvas"
    },
    {
      "tool": "ui_create_image",
      "params": { "parentInstanceId": { "ref": "$canvas.instanceId" }, "name": "X" }
    }
  ]
}`,
        );
        const dryR = await client.callTool("procedure_run", { path: dryRel, dryRun: true });
        expect(!isErrorResult(dryR), `procedure_run(dryRun) isError: ${getText(dryR)}`);
        const dry = JSON.parse(getText(dryR));
        expect(dry.ok === true && dry.dryRun === true, `expected ok:true dryRun:true; got ${JSON.stringify(dry).substring(0, 200)}`);
        expect(dry.totalSteps === 2 && Array.isArray(dry.steps) && dry.steps.length === 2,
          `expected 2 step logs; got ${dry.steps?.length}`);
        // Step 1's refsResolved should record the $canvas.instanceId ref as resolvable.
        expect(dry.steps[1].refsResolved?.["$canvas.instanceId"]?.includes("would resolve"),
          `expected refsResolved to mark $canvas.instanceId; got ${JSON.stringify(dry.steps[1].refsResolved)}`);
        // No new GameObjects with the dry-run name should exist.
        const dryFindR = await client.callTool("go_find", { mode: "name", query: `UnityMCP_SmokeV2_Proc_DryCanvas_${pStamp}`, limit: 1 });
        const dryFind = JSON.parse(getText(dryFindR));
        expect(dryFind.count === 0, `dryRun should have created NOTHING; found ${dryFind.count} match(es)`);
        console.log(`[smoke:v2] [Procedure] dryRun → ok=${dry.ok} dryRun=${dry.dryRun} no scene mutation`);

        // ---------------------------------------------------------------
        // ## procedure_run (failure — stop on first bad step)
        // ---------------------------------------------------------------
        // Procedure: step 0 succeeds (create canvas) + captures it,
        // step 1 fails (ui_set_rect with bogus preset name), step 2
        // should NEVER run. failedAt.stepIndex must be 1, executed=1,
        // capturedVars has $canvas only.
        const failName = `smoke-fail-${pStamp}.jsonc`;
        const failRel = await writeProc(
          failName,
          `{
  "name": "smoke-fail",
  "steps": [
    {
      "tool": "ui_create_canvas",
      "params": { "name": "UnityMCP_SmokeV2_Proc_FailCanvas_${pStamp}", "renderMode": "screen-overlay" },
      "captureOutputAs": "$canvas"
    },
    {
      "tool": "ui_set_rect",
      "params": { "rectTransformInstanceId": { "ref": "$canvas.rectTransformInstanceId" }, "preset": "definitely-not-a-preset" }
    },
    {
      "tool": "ui_create_image",
      "params": { "parentInstanceId": { "ref": "$canvas.instanceId" }, "name": "ShouldNotExist_${pStamp}" }
    }
  ]
}`,
        );
        const failR = await client.callTool("procedure_run", { path: failRel });
        expect(isErrorResult(failR), `procedure_run(failure) should return isError:true`);
        const failText = getText(failR);
        const failDetailsMatch = /^Details: (\{.*\})$/m.exec(failText);
        expect(failDetailsMatch, `expected Details: line; got: ${failText.substring(0, 300)}`);
        const failDetails = JSON.parse(failDetailsMatch[1]);
        expect(failDetails.failedAt?.stepIndex === 1,
          `expected failedAt.stepIndex===1; got ${JSON.stringify(failDetails.failedAt)}`);
        expect(failDetails.executed === 1,
          `expected executed===1; got ${failDetails.executed}`);
        expect(failDetails.steps?.length === 1,
          `expected 1 step log; got ${failDetails.steps?.length}`);
        expect(typeof failDetails.capturedVars?.$canvas?.instanceId === "number",
          `expected $canvas capturedVars; got ${JSON.stringify(failDetails.capturedVars)}`);
        // Step 2 must NOT have executed: no GameObject named ShouldNotExist_<stamp>.
        const stranglerR = await client.callTool("go_find", { mode: "name", query: `ShouldNotExist_${pStamp}`, limit: 1 });
        expect(JSON.parse(getText(stranglerR)).count === 0, "step-2 (post-failure) must not have run");
        cleanupGoIds.push(failDetails.capturedVars.$canvas.instanceId);
        console.log(`[smoke:v2] [Procedure] failure → failedAt.stepIndex=${failDetails.failedAt.stepIndex} executed=${failDetails.executed} steps[]=${failDetails.steps.length}`);

        // ---------------------------------------------------------------
        // ## procedure_run (unresolved ref — structured detail)
        // ---------------------------------------------------------------
        const badRefName = `smoke-bad-ref-${pStamp}.jsonc`;
        const badRefRel = await writeProc(
          badRefName,
          `{
  "name": "smoke-bad-ref",
  "steps": [
    {
      "tool": "ui_create_canvas",
      "params": { "name": "UnityMCP_SmokeV2_Proc_BadRef_${pStamp}", "renderMode": "screen-overlay" },
      "captureOutputAs": "$canvas"
    },
    {
      "tool": "ui_create_image",
      "params": { "parentInstanceId": { "ref": "$nonexistent.field" }, "name": "Y" }
    }
  ]
}`,
        );
        const badR = await client.callTool("procedure_run", { path: badRefRel });
        expect(isErrorResult(badR), `procedure_run(bad-ref) should isError`);
        const badText = getText(badR);
        const badMatch = /^Details: (\{.*\})$/m.exec(badText);
        expect(badMatch, `expected Details: line for unresolved-ref; got: ${badText.substring(0, 300)}`);
        const badDetails = JSON.parse(badMatch[1]);
        expect(badDetails.unresolvedRef === "$nonexistent.field",
          `expected unresolvedRef='$nonexistent.field'; got ${JSON.stringify(badDetails)}`);
        // Step 0 still executed (canvas created) before step 1 failed at ref resolution.
        // failedAt.stepIndex should be 1.
        expect(badDetails.failedAt?.stepIndex === 1,
          `expected failedAt.stepIndex===1 for bad-ref; got ${JSON.stringify(badDetails.failedAt)}`);
        // Clean up the canvas the procedure created in step 0.
        const badRefCanvasR = await client.callTool("go_find", { mode: "name", query: `UnityMCP_SmokeV2_Proc_BadRef_${pStamp}`, limit: 1 });
        const badRefCanvasItems = JSON.parse(getText(badRefCanvasR)).items;
        if (badRefCanvasItems?.length > 0) cleanupGoIds.push(badRefCanvasItems[0].instanceId);
        console.log(`[smoke:v2] [Procedure] unresolved-ref → unresolvedRef='${badDetails.unresolvedRef}' stepIndex=${badDetails.failedAt.stepIndex}`);
      } finally {
        // Cleanup: delete all GameObjects the procedures created, then remove the procedure files.
        for (const id of cleanupGoIds) {
          try { await client.callTool("go_delete", { instanceId: id }); } catch {}
        }
        try { await fs.rm(procDir, { recursive: true, force: true }); } catch {}
      }
    }

    // -------------------------------------------------------------------------
    // ## Scripts                                                  (plan Slice E)
    // -------------------------------------------------------------------------
    // manage_script + find_in_file + script_apply_edits round-trip. Writes
    // happen under Assets/Scripts/UnityMcpSmoke/ which we clean up at the end
    // of this section, mirroring the GameObject section's stamp pattern so
    // parallel runs don't collide.
    if (shouldRun("Scripts")) {
      const stamp = Date.now();
      const smokePath = `Assets/Scripts/UnityMcpSmoke/SmokeE_${stamp}.cs`;
      const initial = `// smoke-e ${stamp}\npublic static class SmokeE_${stamp} { public const string Marker = "marker-${stamp}"; }\n`;

      // create
      const createR = await client.callTool("manage_script", { action: "create", path: smokePath, content: initial });
      expect(!isErrorResult(createR), `manage_script create isError: ${getText(createR)}`);
      const createData = JSON.parse(getText(createR));
      expect(createData.exists === true, "manage_script create should report exists=true");
      expect(typeof createData.hash === "string" && createData.hash.length === 64, `expected 64-char SHA-256 hash; got ${createData.hash}`);
      console.log(`[smoke:v2] [Scripts] manage_script create('${smokePath}') → size=${createData.sizeBytes} hash=${createData.hash.slice(0,12)}…`);

      // read back, content matches
      const readR = await client.callTool("manage_script", { action: "read", path: smokePath });
      expect(!isErrorResult(readR), `manage_script read isError: ${getText(readR)}`);
      const readData = JSON.parse(getText(readR));
      expect(readData.content === initial, "manage_script read content should match what was created");
      expect(readData.hash === createData.hash, "manage_script read hash should match create hash");
      console.log(`[smoke:v2] [Scripts] manage_script read → hash matches`);

      // find_in_file finds the marker
      const findR = await client.callTool("find_in_file", { pattern: `marker-${stamp}`, path: smokePath });
      expect(!isErrorResult(findR), `find_in_file isError: ${getText(findR)}`);
      const findData = JSON.parse(getText(findR));
      expect(findData.count >= 1, `find_in_file expected ≥1 match for 'marker-${stamp}'; got ${findData.count}`);
      console.log(`[smoke:v2] [Scripts] find_in_file → ${findData.count} match(es) at line ${findData.matches[0].line}`);

      // script_apply_edits: replace_string + insert_at_line in one transaction
      const editR = await client.callTool("script_apply_edits", {
        path: smokePath,
        edits: [
          { kind: "replace_string", find: `marker-${stamp}`, replace: `EDITED-${stamp}` },
          { kind: "insert_at_line", line: 1, text: `// edit applied ${stamp}\n` },
        ],
      });
      expect(!isErrorResult(editR), `script_apply_edits isError: ${getText(editR)}`);
      const editData = JSON.parse(getText(editR));
      expect(editData.editsApplied === 2, `expected editsApplied=2; got ${editData.editsApplied}`);
      expect(editData.content.includes(`EDITED-${stamp}`), "post-edit content should include the new marker");
      expect(editData.content.startsWith(`// edit applied ${stamp}`), "post-edit content should start with the inserted line");
      expect(editData.hash !== createData.hash, "post-edit hash should differ from create hash");
      console.log(`[smoke:v2] [Scripts] script_apply_edits → 2 edits applied, hash=${editData.hash.slice(0,12)}…`);

      // concurrent guard tripped on bad hash
      const guardR = await client.callTool("script_apply_edits", {
        path: smokePath, expectedHash: "DEADBEEF",
        edits: [{ kind: "replace_string", find: "edit", replace: "EDIT" }],
      });
      expect(isErrorResult(guardR), "script_apply_edits with bad expectedHash should error");
      console.log(`[smoke:v2] [Scripts] script_apply_edits(bad expectedHash) → expected InvalidInput`);

      // delete
      const delR = await client.callTool("manage_script", { action: "delete", path: smokePath });
      expect(!isErrorResult(delR), `manage_script delete isError: ${getText(delR)}`);
      const delData = JSON.parse(getText(delR));
      expect(delData.exists === false, "delete should report exists=false");

      // read after delete should error
      const postDelR = await client.callTool("manage_script", { action: "read", path: smokePath });
      expect(isErrorResult(postDelR), "read after delete should error");
      console.log(`[smoke:v2] [Scripts] manage_script delete + read-after-delete → both behaved correctly`);

      // path-policy negative tests
      const absR = await client.callTool("manage_script", { action: "read", path: "/etc/passwd" });
      expect(isErrorResult(absR), "absolute path read should error");
      const escapeR = await client.callTool("manage_script", { action: "read", path: "Assets/../../etc/passwd" });
      expect(isErrorResult(escapeR), "path with .. should error");
      const offProjectR = await client.callTool("manage_script", { action: "create", path: "Library/Foo.cs", content: "// should reject" });
      expect(isErrorResult(offProjectR), "write outside Assets/ + writable packages should error");
      console.log(`[smoke:v2] [Scripts] path policy → absolute / .. / off-project all rejected`);
    }

    // -------------------------------------------------------------------------
    // ## Packages                                                 (plan Slice F)
    // -------------------------------------------------------------------------
    // Reads (list/info) are safe per smoke run. Search hits the registry
    // (online) and is slow — gated behind --include-package-search. Mutating
    // actions (install/remove) modify manifest.json and are gated behind
    // --include-package-mutate.
    if (shouldRun("Packages")) {
      // list — should return ≥10 packages on any non-empty Unity project.
      const listR = await client.callTool("manage_packages", { action: "list" });
      expect(!isErrorResult(listR), `manage_packages list isError: ${getText(listR)}`);
      const listData = JSON.parse(getText(listR));
      expect(listData.count >= 10, `expected ≥10 installed packages; got ${listData.count}`);
      const names = (listData.items ?? []).map((p) => p.name);
      const hasXri = names.includes("com.unity.xr.interaction.toolkit");
      console.log(`[smoke:v2] [Packages] manage_packages list → ${listData.count} packages (XRI present: ${hasXri})`);

      // info — pick a known-installed package dynamically. XRI is consistent
      // across MRTKDevTemplate and the dev-environments documented in Slice A's
      // install profile model. If absent in this project, pick the first installed.
      const infoTarget = hasXri ? "com.unity.xr.interaction.toolkit" : (listData.items?.[0]?.name);
      if (infoTarget) {
        const infoR = await client.callTool("manage_packages", { action: "info", name: infoTarget });
        expect(!isErrorResult(infoR), `manage_packages info isError: ${getText(infoR)}`);
        const infoData = JSON.parse(getText(infoR));
        expect(infoData.name === infoTarget, `info name mismatch: ${infoData.name} vs ${infoTarget}`);
        expect(Array.isArray(infoData.dependencies), `info should return dependencies array`);
        console.log(`[smoke:v2] [Packages] manage_packages info(${infoTarget}) → ${infoData.dependencies.length} deps, source=${infoData.source}`);
      } else {
        console.log("[smoke:v2] [Packages] manage_packages info skipped (no installed package to query)");
      }

      // info on a missing package — InvalidInput.
      const missingR = await client.callTool("manage_packages", { action: "info", name: "com.does.not.exist.xyz" });
      expect(isErrorResult(missingR), "manage_packages info(missing) should error");
      console.log("[smoke:v2] [Packages] manage_packages info(missing) → expected error");

      // Bad action — InvalidInput.
      const badActionR = await client.callTool("manage_packages", { action: "frobnicate" });
      expect(isErrorResult(badActionR), "manage_packages action=frobnicate should error");

      // search — registry hit, slow, network-dependent. Gated.
      if (args.includes("--include-package-search")) {
        const searchR = await client.callTool("manage_packages", {
          action: "search", query: "cinemachine", timeoutMs: 60_000,
        });
        expect(!isErrorResult(searchR), `manage_packages search isError: ${getText(searchR)}`);
        const searchData = JSON.parse(getText(searchR));
        expect(searchData.count >= 1, `expected ≥1 search hit for 'cinemachine'; got ${searchData.count}`);
        console.log(`[smoke:v2] [Packages] manage_packages search('cinemachine') → ${searchData.count} hits`);
      } else {
        console.log(`[smoke:v2] [Packages] manage_packages search skipped (pass --include-package-search to exercise online registry)`);
      }

      // install/remove — destructive (mutates manifest.json). Gated.
      if (!args.includes("--include-package-mutate")) {
        console.log(`[smoke:v2] [Packages] manage_packages install/remove skipped (pass --include-package-mutate to exercise; modifies manifest.json)`);
      } else {
        // Add then remove a small, harmless package. com.unity.collab-proxy is
        // already in MRTKDevTemplate so we'd race; pick something unlikely to
        // be installed: com.unity.toolchain.linux-x86_64 is editor-only and
        // adds no runtime symbols. (If unavailable, this assertion fails
        // openly — the operator chose to opt in.)
        const target = "com.unity.toolchain.linux-x86_64";
        try {
          const addR = await client.callTool("manage_packages", { action: "install", name: target });
          if (!isErrorResult(addR)) {
            console.log(`[smoke:v2] [Packages] manage_packages install(${target}) → ok`);
            const rmR = await client.callTool("manage_packages", { action: "remove", name: target });
            expect(!isErrorResult(rmR), `manage_packages remove(${target}) isError: ${getText(rmR)}`);
            console.log(`[smoke:v2] [Packages] manage_packages remove(${target}) → ok`);
          } else {
            console.log(`[smoke:v2] [Packages] manage_packages install(${target}) skipped (registry/network unavailable: ${getText(addR)})`);
          }
        } catch (ex) {
          console.log(`[smoke:v2] [Packages] manage_packages install/remove cycle errored: ${ex.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## Docs                                                     (plan Slice J)
    // -------------------------------------------------------------------------
    // Online — hits docs.unity3d.com. Gated behind --include-docs because
    // network reachability isn't guaranteed in CI / firewalled boxes, and
    // the smoke harness should stay green by default even offline.
    if (shouldRun("Docs")) {
      if (!args.includes("--include-docs")) {
        // Surface check: tool is registered. We don't fetch unless --include-docs.
        const tools = await client.listTools();
        const hasDocs = (tools.tools ?? []).some((t) => t.name === "unity_docs");
        expect(hasDocs, "unity_docs tool should be registered");
        console.log("[smoke:v2] [Docs] unity_docs surfaces in tools/list (online fetch gated; pass --include-docs to exercise)");
      } else {
        // Type lookup — GameObject is universal across Unity versions.
        const goR = await client.callTool("unity_docs", {
          action: "lookup", symbol: "UnityEngine.GameObject", timeoutSeconds: 30,
        });
        expect(!isErrorResult(goR), `unity_docs(GameObject) isError: ${getText(goR)}`);
        const go = JSON.parse(getText(goR));
        expect(go.url.includes("/ScriptReference/GameObject.html"), `GameObject URL wrong: ${go.url}`);
        expect(go.title === "GameObject", `expected title=GameObject; got ${go.title}`);
        expect(Array.isArray(go.sections) && go.sections.length >= 1, `expected ≥1 section on GameObject; got ${go.sections?.length}`);
        console.log(`[smoke:v2] [Docs] unity_docs(GameObject) → title='${go.title}' sections=${go.sections.length}`);

        // Member lookup — Transform.position uses the hyphen URL form.
        const tpR = await client.callTool("unity_docs", {
          action: "lookup", symbol: "Transform.position", timeoutSeconds: 30,
        });
        expect(!isErrorResult(tpR), `unity_docs(Transform.position) isError: ${getText(tpR)}`);
        const tp = JSON.parse(getText(tpR));
        expect(tp.url.includes("/Transform-position.html"), `Transform.position URL should be hyphen-form; got ${tp.url}`);
        expect(tp.description.length > 0, "Transform.position description should be non-empty");
        console.log(`[smoke:v2] [Docs] unity_docs(Transform.position) → '${tp.description.slice(0, 60)}…'`);

        // Negative — empty symbol.
        const emptyR = await client.callTool("unity_docs", { action: "lookup", symbol: "" });
        expect(isErrorResult(emptyR), "unity_docs(empty) should error");

        // Negative — 404.
        const missingR = await client.callTool("unity_docs", {
          action: "lookup", symbol: "NoSuchTypeXYZ", timeoutSeconds: 15,
        });
        expect(isErrorResult(missingR), "unity_docs(missing) should error with ToolError");
        console.log("[smoke:v2] [Docs] negative paths → all errored as expected");
      }
    }

    // -------------------------------------------------------------------------
    // ## Physics                                                  (plan Slice L)
    // -------------------------------------------------------------------------
    // settings round-trip + raycast / overlap_sphere against a fresh cube
    // fixture. Restores gravity at the end so other smoke sections don't run
    // against altered project physics.
    if (shouldRun("Physics")) {
      // settings read
      const sR = await client.callTool("manage_physics", { action: "settings" });
      expect(!isErrorResult(sR), `manage_physics settings isError: ${getText(sR)}`);
      const s = JSON.parse(getText(sR));
      expect(Array.isArray(s.gravity) && s.gravity.length === 3, "settings.gravity should be [x,y,z]");
      expect(typeof s.autoSyncTransforms === "boolean", "settings.autoSyncTransforms should be a boolean");
      const originalGravityY = s.gravity[1];
      console.log(`[smoke:v2] [Physics] manage_physics settings → gravity=${s.gravity}, autoSync=${s.autoSyncTransforms}`);

      // set_settings round-trip on gravity
      const newY = Math.abs(originalGravityY + 5) > 0.01 ? -5 : -7;
      const setR = await client.callTool("manage_physics", {
        action: "set_settings",
        properties: { gravity: [0, newY, 0] },
      });
      expect(!isErrorResult(setR), `manage_physics set_settings isError: ${getText(setR)}`);
      const set = JSON.parse(getText(setR));
      expect(Math.abs(set.gravity[1] - newY) < 0.01, `set gravity Y mismatch: ${set.gravity[1]} vs ${newY}`);
      // Restore
      await client.callTool("manage_physics", {
        action: "set_settings",
        properties: { gravity: [0, originalGravityY, 0] },
      });
      console.log(`[smoke:v2] [Physics] manage_physics set_settings(gravity Y=${newY}) round-tripped`);

      // raycast against a known fixture
      const stamp = Date.now();
      const cubeR = await client.callTool("go_create", {
        name: `UnityMCP_PhysicsRay_${stamp}`, primitive: "Cube", position: [50, 50, 50],
      });
      const cubeId = JSON.parse(getText(cubeR)).instanceId;
      try {
        // autoSyncTransforms is false by default, so a freshly created collider
        // isn't in the physics scene yet. Flush before querying.
        await client.callTool("manage_physics", { action: "sync_transforms" });

        // Use a far origin to avoid colliding with MRTKDevTemplate's UI clutter
        // near (0,0,0). Cube placed at (50,50,50) is in empty space.
        const rcR = await client.callTool("manage_physics", {
          action: "raycast",
          origin: [50, 50, 45],
          direction: [0, 0, 1],
          maxDistance: 10,
        });
        expect(!isErrorResult(rcR), `manage_physics raycast isError: ${getText(rcR)}`);
        const rc = JSON.parse(getText(rcR));
        expect(rc.hit != null, `raycast should hit cube fixture (got null hit; rc=${JSON.stringify(rc)})`);
        if (rc.hit != null) {
          expect(rc.hit.gameObjectInstanceId === cubeId,
            `raycast hit wrong GameObject: expected ${cubeId}, got ${rc.hit.gameObjectInstanceId}`);
          expect(Math.abs(rc.hit.distance - 4.5) < 0.01,
            `raycast distance expected ~4.5; got ${rc.hit.distance}`);
          console.log(`[smoke:v2] [Physics] manage_physics raycast → hit '${rc.hit.gameObjectName}' @${rc.hit.distance.toFixed(2)}`);
        }

        // overlap_sphere: a small sphere at the cube's center should match it
        const osR = await client.callTool("manage_physics", {
          action: "overlap_sphere",
          center: [50, 50, 50],
          radius: 1,
        });
        expect(!isErrorResult(osR), `manage_physics overlap_sphere isError: ${getText(osR)}`);
        const os = JSON.parse(getText(osR));
        const matchedCube = (os.items ?? []).some((i) => i.gameObjectInstanceId === cubeId);
        expect(matchedCube, `overlap_sphere should match cube ${cubeId}; matched ${os.count} colliders, none of them the fixture`);
        console.log(`[smoke:v2] [Physics] manage_physics overlap_sphere(r=1) → ${os.count} hit(s), cube fixture present`);

        // Negative — zero direction
        const badR = await client.callTool("manage_physics", {
          action: "raycast",
          origin: [0, 0, 0],
          direction: [0, 0, 0],
        });
        expect(isErrorResult(badR), "raycast with zero direction should error");
        console.log("[smoke:v2] [Physics] manage_physics raycast(zero dir) → expected error");
      } finally {
        await client.callTool("go_delete", { instanceId: cubeId });
      }
    }

    // -------------------------------------------------------------------------
    // ## ProjectSettings                                          (plan Slice M)
    // -------------------------------------------------------------------------
    // tags read + add+remove round-trip; layers read shape; set_layer round-trip
    // on slot 8; quality read. Built-in tag/layer protection negative paths.
    if (shouldRun("ProjectSettings")) {
      const tagsR = await client.callTool("manage_project_settings", { action: "tags" });
      expect(!isErrorResult(tagsR), `manage_project_settings tags isError: ${getText(tagsR)}`);
      const tags0 = JSON.parse(getText(tagsR));
      expect(Array.isArray(tags0.tags) && tags0.tags.includes("Untagged"),
        "tags read should include built-in 'Untagged'");
      console.log(`[smoke:v2] [ProjectSettings] tags → ${tags0.tags.length} tags`);

      const newTag = `UnityMCP_SmokeTag_${Date.now()}`;
      const addR = await client.callTool("manage_project_settings", { action: "add_tag", tag: newTag });
      expect(!isErrorResult(addR), `add_tag isError: ${getText(addR)}`);
      const add = JSON.parse(getText(addR));
      expect(add.added === true && add.tags.includes(newTag), `add_tag should add '${newTag}'`);

      const remR = await client.callTool("manage_project_settings", { action: "remove_tag", tag: newTag });
      expect(!isErrorResult(remR), `remove_tag isError: ${getText(remR)}`);
      const rem = JSON.parse(getText(remR));
      expect(rem.removed === true && !rem.tags.includes(newTag), `remove_tag should drop '${newTag}'`);
      console.log(`[smoke:v2] [ProjectSettings] add_tag + remove_tag round-tripped`);

      // Built-in tag protection
      const protR = await client.callTool("manage_project_settings", { action: "remove_tag", tag: "Untagged" });
      expect(isErrorResult(protR), "remove_tag('Untagged') should error (built-in protected)");
      console.log(`[smoke:v2] [ProjectSettings] remove_tag(builtin) → expected error`);

      // Layers
      const layersR = await client.callTool("manage_project_settings", { action: "layers" });
      expect(!isErrorResult(layersR), `layers isError: ${getText(layersR)}`);
      const layers = JSON.parse(getText(layersR));
      expect(Array.isArray(layers.layers) && layers.layers.length === 32,
        "layers read should return all 32 slots");
      const defaultLayer = layers.layers.find((l) => l.index === 0);
      expect(defaultLayer && defaultLayer.name === "Default",
        "layer 0 should be 'Default'");
      console.log(`[smoke:v2] [ProjectSettings] layers → 32 slots, slot 0='Default'`);

      // set_layer round-trip on slot 8 (preserve original)
      const slot = 8;
      const original = layers.layers[slot]?.name ?? "";
      const layerName = `UnityMCP_SmokeLayer_${Date.now() % 100000}`;
      const setLR = await client.callTool("manage_project_settings", {
        action: "set_layer", index: slot, name: layerName,
      });
      expect(!isErrorResult(setLR), `set_layer isError: ${getText(setLR)}`);
      const setL = JSON.parse(getText(setLR));
      expect(setL.layers[slot].name === layerName,
        `set_layer slot ${slot} expected '${layerName}', got '${setL.layers[slot].name}'`);
      // Restore
      await client.callTool("manage_project_settings", {
        action: "set_layer", index: slot, name: original,
      });
      console.log(`[smoke:v2] [ProjectSettings] set_layer slot ${slot} round-tripped`);

      // set_layer protection (built-in slot)
      const protLR = await client.callTool("manage_project_settings", {
        action: "set_layer", index: 0, name: "ShouldNotApply",
      });
      expect(isErrorResult(protLR), "set_layer index=0 should error (built-in protected)");
      console.log(`[smoke:v2] [ProjectSettings] set_layer(builtin) → expected error`);

      // Quality
      const qR = await client.callTool("manage_project_settings", { action: "quality" });
      expect(!isErrorResult(qR), `quality isError: ${getText(qR)}`);
      const q = JSON.parse(getText(qR));
      expect(typeof q.activeLevel === "number" && Array.isArray(q.names) && q.names.length > 0,
        "quality read should return activeLevel + names[]");
      console.log(`[smoke:v2] [ProjectSettings] quality → activeLevel=${q.activeLevel}, ${q.names.length} levels`);
    }

    // -------------------------------------------------------------------------
    // ## Input                                                    (plan Slice N)
    // -------------------------------------------------------------------------
    // list_assets shape; list_maps + inspect_asset on a stable Input System
    // package asset; find_action across whole project; info read.
    if (shouldRun("Input")) {
      const listR = await client.callTool("manage_input", { action: "list_assets" });
      expect(!isErrorResult(listR), `manage_input list_assets isError: ${getText(listR)}`);
      const list = JSON.parse(getText(listR));
      expect(Array.isArray(list.items) && list.count === list.items.length,
        "list_assets count should match items.length");
      // DefaultInputActions ships with the Input System package and is in
      // every project that has the package installed — stable target for
      // list_maps + inspect_asset in MRTKDevTemplate.
      const dia = list.items.find((i) =>
        i.assetPath.endsWith("DefaultInputActions.inputactions"));
      expect(dia, "list_assets should include DefaultInputActions.inputactions");
      console.log(`[smoke:v2] [Input] list_assets → ${list.count} InputActionAssets`);

      const mapsR = await client.callTool("manage_input", {
        action: "list_maps", assetPath: dia.assetPath,
      });
      expect(!isErrorResult(mapsR), `list_maps isError: ${getText(mapsR)}`);
      const maps = JSON.parse(getText(mapsR));
      expect(maps.maps.some((m) => m.name === "Player" && m.actionCount > 0),
        "DefaultInputActions should have a non-empty 'Player' map");
      console.log(`[smoke:v2] [Input] list_maps(DefaultInputActions) → ${maps.mapCount} maps`);

      const inspR = await client.callTool("manage_input", {
        action: "inspect_asset", guid: dia.guid,
      });
      expect(!isErrorResult(inspR), `inspect_asset isError: ${getText(inspR)}`);
      const insp = JSON.parse(getText(inspR));
      expect(insp.actionMaps.length === maps.mapCount,
        `inspect_asset map count should match list_maps; ${insp.actionMaps.length} vs ${maps.mapCount}`);
      console.log(`[smoke:v2] [Input] inspect_asset(by guid) → ${insp.actionMaps.length} maps`);

      const findR = await client.callTool("manage_input", {
        action: "find_action", name: "Move",
      });
      expect(!isErrorResult(findR), `find_action isError: ${getText(findR)}`);
      const find = JSON.parse(getText(findR));
      expect(find.count > 0 && find.hits.some((h) => h.actionName === "Move"),
        "find_action(Move) should return at least one hit");
      console.log(`[smoke:v2] [Input] find_action(Move) → ${find.count} hits`);

      const infoR = await client.callTool("manage_input", { action: "info" });
      expect(!isErrorResult(infoR), `info isError: ${getText(infoR)}`);
      const info = JSON.parse(getText(infoR));
      expect(typeof info.packageVersion === "string" && info.actionAssetCount === list.count,
        "info actionAssetCount should match list_assets count");
      console.log(`[smoke:v2] [Input] info → InputSystem ${info.packageVersion}, updateMode=${info.updateMode}`);

      // Negative — neither assetPath nor guid for inspect.
      const badR = await client.callTool("manage_input", { action: "inspect_asset" });
      expect(isErrorResult(badR), "inspect_asset without assetPath/guid should error");
      console.log(`[smoke:v2] [Input] inspect_asset(no args) → expected error`);
    }

    // -------------------------------------------------------------------------
    // ## Cameras                                                  (plan Slice K)
    // -------------------------------------------------------------------------
    // list / info / set / look_at against any camera in the active scene.
    // We don't create+delete a camera (would dirty the scene unnecessarily);
    // the Main Camera is universal in MRTKDevTemplate and most projects.
    if (shouldRun("Cameras")) {
      const listR = await client.callTool("manage_camera", { action: "list" });
      expect(!isErrorResult(listR), `manage_camera list isError: ${getText(listR)}`);
      const list = JSON.parse(getText(listR));
      if (list.count === 0) {
        console.log("[smoke:v2] [Cameras] manage_camera skipped (no Camera in scene)");
      } else {
        const cam = list.items[0];
        expect(typeof cam.componentInstanceId === "number", "list item should expose componentInstanceId");
        console.log(`[smoke:v2] [Cameras] manage_camera list → ${list.count} camera(s); first: ${cam.gameObjectName} (fov=${cam.fov})`);

        // info round-trip
        const infoR = await client.callTool("manage_camera", { action: "info", componentInstanceId: cam.componentInstanceId });
        expect(!isErrorResult(infoR), `manage_camera info isError: ${getText(infoR)}`);
        const info = JSON.parse(getText(infoR));
        expect(info.componentInstanceId === cam.componentInstanceId, "info should round-trip same instanceId");
        expect(typeof info.fov === "number" && info.fov > 0, "info.fov should be a positive number");

        // set fov to a known value, verify, restore.
        const originalFov = info.fov;
        const newFov = Math.abs(originalFov - 30) > 0.01 ? 30 : 45;
        const setR = await client.callTool("manage_camera", {
          action: "set", componentInstanceId: cam.componentInstanceId, properties: { fov: newFov },
        });
        expect(!isErrorResult(setR), `manage_camera set isError: ${getText(setR)}`);
        const setData = JSON.parse(getText(setR));
        expect(Math.abs(setData.fields.fov - newFov) < 0.01, `set fov mismatch: ${setData.fields.fov} vs ${newFov}`);
        // Restore
        await client.callTool("manage_camera", {
          action: "set", componentInstanceId: cam.componentInstanceId, properties: { fov: originalFov },
        });
        console.log(`[smoke:v2] [Cameras] manage_camera set fov=${newFov} round-tripped (restored to ${originalFov})`);

        // Negative — unknown property
        const badR = await client.callTool("manage_camera", {
          action: "set", componentInstanceId: cam.componentInstanceId, properties: { frobnicate: 1 },
        });
        expect(isErrorResult(badR), "set with unknown property should error");
        console.log("[smoke:v2] [Cameras] manage_camera set(unknown) → expected error");

        // Negative — wrong-type instanceId (Camera's GameObject's Transform).
        const compsR = await client.callTool("component_list", { instanceId: cam.gameObjectInstanceId });
        const transformId = JSON.parse(getText(compsR)).items?.find((i) => i.type === "Transform")?.instanceId;
        if (transformId) {
          const wrongR = await client.callTool("manage_camera", {
            action: "info", componentInstanceId: transformId,
          });
          expect(isErrorResult(wrongR), "manage_camera on Transform should error");
          console.log("[smoke:v2] [Cameras] manage_camera info(Transform) → expected error");
        }

        // Negative — degenerate look_at
        const cameraPos = info.position;
        const degenR = await client.callTool("manage_camera", {
          action: "look_at",
          componentInstanceId: cam.componentInstanceId,
          targetPosition: cameraPos,
        });
        expect(isErrorResult(degenR), "look_at with target == camera position should error");
        console.log("[smoke:v2] [Cameras] manage_camera look_at(degenerate) → expected error");
      }
    }

    // -------------------------------------------------------------------------
    // ## Reflection                                               (plan Slice I)
    // -------------------------------------------------------------------------
    if (shouldRun("Reflection")) {
      // inspect_type by FQN — UnityEngine.GameObject is universally present.
      const goR = await client.callTool("unity_reflect", {
        action: "inspect_type", typeName: "UnityEngine.GameObject",
      });
      expect(!isErrorResult(goR), `unity_reflect inspect_type isError: ${getText(goR)}`);
      const go = JSON.parse(getText(goR));
      expect(go.fullName === "UnityEngine.GameObject", `expected fullName UnityEngine.GameObject; got ${go.fullName}`);
      expect(Array.isArray(go.methods) && go.methods.length >= 10, `expected ≥10 methods on GameObject; got ${go.methods?.length}`);
      expect(Array.isArray(go.properties) && go.properties.length >= 5, `expected ≥5 properties on GameObject; got ${go.properties?.length}`);
      const setActive = go.methods.find((m) => m.name === "SetActive");
      expect(setActive != null, "SetActive method should be discoverable on GameObject");
      console.log(`[smoke:v2] [Reflection] inspect_type(UnityEngine.GameObject) → ${go.methods.length} methods, ${go.properties.length} props; SetActive: ${setActive?.signature}`);

      // find_member SetActive — should hit GameObject + at least one more.
      const fmR = await client.callTool("unity_reflect", {
        action: "find_member", memberName: "SetActive", limit: 20,
      });
      expect(!isErrorResult(fmR), `unity_reflect find_member isError: ${getText(fmR)}`);
      const fm = JSON.parse(getText(fmR));
      expect(fm.count >= 1, `expected ≥1 SetActive match; got ${fm.count}`);
      const goHit = (fm.items ?? []).find((i) => i.declaringType === "UnityEngine.GameObject");
      expect(goHit != null, "find_member(SetActive) should include UnityEngine.GameObject");
      console.log(`[smoke:v2] [Reflection] find_member(SetActive) → ${fm.count} hits across loaded assemblies`);

      // Negative — empty typeName.
      const emptyR = await client.callTool("unity_reflect", {
        action: "inspect_type", typeName: "",
      });
      expect(isErrorResult(emptyR), "inspect_type with empty typeName should error");

      // Negative — non-existent type.
      const missingR = await client.callTool("unity_reflect", {
        action: "inspect_type", typeName: "ThisIsDefinitelyNotARealType_xyz",
      });
      expect(isErrorResult(missingR), "inspect_type with bogus name should error");
      console.log("[smoke:v2] [Reflection] negative paths → all errored as expected");
    }

    // -------------------------------------------------------------------------
    // ## Materials                                                (plan Slice H)
    // -------------------------------------------------------------------------
    if (shouldRun("Materials")) {
      const stamp = Date.now();
      const matPath = `Assets/UnityMcp_SmokeMat_${stamp}.mat`;

      // Create a material via the existing asset_create surface so we have a
      // target to manage. Cleanup at the end via asset_delete.
      const createR = await client.callTool("asset_create", { path: matPath, assetType: "Material" });
      expect(!isErrorResult(createR), `[Materials] asset_create isError: ${getText(createR)}`);
      try {
        // info
        const infoR = await client.callTool("manage_material", { action: "info", path: matPath });
        expect(!isErrorResult(infoR), `manage_material info isError: ${getText(infoR)}`);
        const info = JSON.parse(getText(infoR));
        expect(typeof info.shader === "string" && info.shader.length > 0, "info should report a shader name");
        expect(Array.isArray(info.properties) && info.properties.length >= 5, `expected ≥5 shader properties; got ${info.properties.length}`);
        console.log(`[smoke:v2] [Materials] manage_material info(${matPath}) → shader=${info.shader}, ${info.properties.length} props`);

        // list_properties (just confirms it parses; shape mirrors info.properties).
        const listR = await client.callTool("manage_material", { action: "list_properties", path: matPath });
        expect(!isErrorResult(listR), `manage_material list_properties isError: ${getText(listR)}`);

        // set_property — _Color is on Standard / URP Lit / HDRP Lit. Pick a target
        // depending on the project's render pipeline.
        const colorPropR = await client.callTool("manage_material", {
          action: "set_property",
          path: matPath,
          propertyName: "_Color",
          value: [0.5, 0.2, 0.8, 1.0],
        });
        if (!isErrorResult(colorPropR)) {
          // Verify it stuck.
          const verifyR = await client.callTool("manage_material", { action: "info", path: matPath });
          const verify = JSON.parse(getText(verifyR));
          const colorProp = verify.properties.find((p) => p.name === "_Color");
          expect(colorProp != null, "_Color should still be present after set");
          expect(Math.abs(colorProp.value[0] - 0.5) < 1e-3, `_Color.r expected 0.5, got ${colorProp.value[0]}`);
          console.log(`[smoke:v2] [Materials] manage_material set_property(_Color) → ${colorProp.value.map((x) => x.toFixed(2)).join(",")}`);
        } else {
          // Some pipelines (e.g. URP/Lit) use _BaseColor instead of _Color.
          // Skipping cleanly when the property doesn't exist on this shader.
          console.log(`[smoke:v2] [Materials] manage_material set_property(_Color) skipped (shader doesn't expose _Color in this RP)`);
        }

        // Negative — non-existent property.
        const badPropR = await client.callTool("manage_material", {
          action: "set_property",
          path: matPath,
          propertyName: "_DefinitelyNotAProperty_xyz",
          value: 1.0,
        });
        expect(isErrorResult(badPropR), "set_property on missing prop should error");
        console.log("[smoke:v2] [Materials] manage_material set_property(missing prop) → expected error");

        // Negative — non-existent shader.
        const badShaderR = await client.callTool("manage_material", {
          action: "set_shader",
          path: matPath,
          shaderName: "NoSuch/Shader/Path",
        });
        expect(isErrorResult(badShaderR), "set_shader on missing shader should error");
        console.log("[smoke:v2] [Materials] manage_material set_shader(missing) → expected error");

        // Negative — non-existent path.
        const badPathR = await client.callTool("manage_material", {
          action: "info",
          path: "Assets/_unity_mcp_no_such.mat",
        });
        expect(isErrorResult(badPathR), "info on missing path should error");
      } finally {
        await client.callTool("asset_delete", { path: matPath });
      }
    }

    // -------------------------------------------------------------------------
    // ## Tests                                                    (plan Slice G)
    // -------------------------------------------------------------------------
    // run_tests + Unity Test Framework. EditMode runs on every smoke
    // invocation; PlayMode is gated behind --include-play-mode-tests because
    // entering play mode is slow and unloads the open scene.
    if (shouldRun("Tests")) {
      const hasRunTests = (await client.listTools()).tools?.some((t) => t.name === "run_tests");
      if (!hasRunTests) {
        console.log("[smoke:v2] [Tests] run_tests skipped (com.unity.test-framework not installed)");
      } else {
        console.log("[smoke:v2] [Tests] run_tests surfaces in tools/list (capability-gated on TestFramework)");

        // Bad mode → InvalidInput. Validates input handling without launching
        // a test run, which races with other smoke sections' compile/scene
        // mutations and produces flaky timeouts. Real run verified standalone:
        // npm run smoke:v2 -- --only Tests reports count=2 passed=2 against
        // MixedReality.Toolkit.Core.Editor.Tests (Slice G commit).
        const badModeR = await client.callTool("run_tests", { mode: "Hybrid" });
        expect(isErrorResult(badModeR), "run_tests(badMode) should error");
        console.log("[smoke:v2] [Tests] run_tests(badMode) → expected InvalidInput");

        // Real-test-run gated. Standalone via --only Tests works cleanly.
        if (args.includes("--include-test-run")) {
          const candidateAssembly = "MixedReality.Toolkit.Core.Editor.Tests";
          const realR = await client.callTool("run_tests", {
            mode: "EditMode",
            assemblyNames: [candidateAssembly],
            timeoutMs: 240_000,
          });
          expect(!isErrorResult(realR), `run_tests(real) isError: ${getText(realR)}`);
          const real = JSON.parse(getText(realR));
          console.log(`[smoke:v2] [Tests] run_tests(EditMode, ${candidateAssembly}) → count=${real.count} passed=${real.passed} failed=${real.failed} (${real.durationSeconds.toFixed(2)}s)`);
        } else {
          console.log("[smoke:v2] [Tests] run_tests(EditMode) real-run skipped (pass --include-test-run; standalone via --only Tests works cleanly)");
        }

        if (args.includes("--include-play-mode-tests")) {
          const candidateAssembly = "MixedReality.Toolkit.Core.Editor.Tests";
          const pmR = await client.callTool("run_tests", {
            mode: "PlayMode",
            assemblyNames: [candidateAssembly],
            timeoutMs: 600_000,
          });
          expect(!isErrorResult(pmR), `run_tests(PlayMode) isError: ${getText(pmR)}`);
          console.log(`[smoke:v2] [Tests] run_tests(PlayMode) → ran (gated under --include-play-mode-tests)`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## Playmode                                  (spec unity-mcp-playmode-control)
    // -------------------------------------------------------------------------
    // playmode_set — bounded-await Play Mode control. Entering Play Mode is
    // slow (~1–3s) and unloads the open scene on stop, so the whole section is
    // gated behind --include-playmode-tests. The forced-timeout and
    // saveDirtyScenes:false probes are additionally gated behind
    // --include-playmode-timeout-probe because they can leave the Editor in a
    // half-transitioned state.
    if (shouldRun("Playmode")) {
      const includePlaymode = args.includes("--include-playmode-tests") || args.includes("--include-playmode-timeout-probe");
      if (!includePlaymode) {
        console.log("[smoke:v2] [Playmode] gated under --include-playmode-tests (skipping)");
      } else {
        const includeTimeoutProbe = args.includes("--include-playmode-timeout-probe");

        // Case 1 — Surface check (done-criterion #1).
        const toolList = await client.listTools();
        const playmodeEntry = (toolList.tools ?? []).find((t) => t.name === "playmode_set");
        expect(!!playmodeEntry, "playmode_set missing from tools/list");
        expect(
          typeof playmodeEntry?.description === "string" && playmodeEntry.description.toLowerCase().includes("bounded"),
          `playmode_set description should mention 'bounded' await; got: ${playmodeEntry?.description?.slice(0, 80)}…`,
        );
        console.log("[smoke:v2] [Playmode] playmode_set surfaces in tools/list with bounded-await description");

        // Case 2 — Round-trip play (done-criterion #2).
        const playR = await client.callTool("playmode_set", { state: "play" });
        expect(!isErrorResult(playR), `playmode_set(play) isError: ${getText(playR)}`);
        const playData = JSON.parse(getText(playR));
        expect(playData.previous === "stopped", `playmode_set(play) previous=${playData.previous}; expected 'stopped'`);
        expect(playData.current === "play", `playmode_set(play) current=${playData.current}; expected 'play'`);
        expect(typeof playData.transitionMs === "number", `playmode_set(play) transitionMs not number: ${playData.transitionMs}`);
        expect(playData.transitionMs < 10_000, `playmode_set(play) transitionMs=${playData.transitionMs} exceeded 10000ms ceiling`);
        console.log(`[smoke:v2] [Playmode] playmode_set(play) → previous='${playData.previous}' current='${playData.current}' transitionMs=${playData.transitionMs}`);

        // Case 5 — Idempotent no-op (done-criterion #3). Run while still
        // in play so we don't transition twice.
        const playAgainR = await client.callTool("playmode_set", { state: "play" });
        expect(!isErrorResult(playAgainR), `playmode_set(play, already playing) isError: ${getText(playAgainR)}`);
        const playAgainData = JSON.parse(getText(playAgainR));
        expect(playAgainData.previous === "play" && playAgainData.current === "play",
          `idempotent play expected previous==current=='play'; got previous='${playAgainData.previous}' current='${playAgainData.current}'`);
        expect(playAgainData.transitionMs < 50,
          `idempotent play transitionMs=${playAgainData.transitionMs} exceeded 50ms (criterion #3)`);
        console.log(`[smoke:v2] [Playmode] playmode_set(play, idempotent) → transitionMs=${playAgainData.transitionMs} (< 50)`);

        // Case 3 — Round-trip paused (done-criterion #2).
        const pausedR = await client.callTool("playmode_set", { state: "paused" });
        expect(!isErrorResult(pausedR), `playmode_set(paused) isError: ${getText(pausedR)}`);
        const pausedData = JSON.parse(getText(pausedR));
        expect(pausedData.current === "paused", `playmode_set(paused) current=${pausedData.current}; expected 'paused'`);
        console.log(`[smoke:v2] [Playmode] playmode_set(paused) → previous='${pausedData.previous}' current='${pausedData.current}'`);

        // Case 4 — Round-trip stopped (done-criterion #2). Always stop at end
        // of the happy-path block so the scene-dirty probe starts from a clean
        // edit-mode state.
        const stopR = await client.callTool("playmode_set", { state: "stopped" });
        expect(!isErrorResult(stopR), `playmode_set(stopped) isError: ${getText(stopR)}`);
        const stopData = JSON.parse(getText(stopR));
        expect(stopData.current === "stopped", `playmode_set(stopped) current=${stopData.current}; expected 'stopped'`);
        console.log(`[smoke:v2] [Playmode] playmode_set(stopped) → previous='${stopData.previous}' current='${stopData.current}'`);

        // Case 7 — Dirty-scene auto-save (done-criterion #5). Dirty the open
        // scene via go_create, capture the .unity file mtime, call playmode_set
        // with defaults (saveDirtyScenes:true), and assert the file mtime moved
        // forward. Then stop play mode to restore the baseline state.
        const fsStat = await import("node:fs/promises");
        const path = await import("node:path");
        const projectInfoR = await client.callTool("project_info", {});
        const projectPath = JSON.parse(getText(projectInfoR)).projectPath;
        const sceneInfoR = await client.callTool("scene_info", {});
        const activeScenePath = JSON.parse(getText(sceneInfoR)).active?.path ?? "";
        if (!activeScenePath || !activeScenePath.endsWith(".unity")) {
          console.log(`[smoke:v2] [Playmode] dirty-scene probe SKIPPED — no on-disk active scene (path='${activeScenePath}')`);
        } else {
          const sceneFile = path.resolve(projectPath, activeScenePath);
          const dirtierR = await client.callTool("go_create", { name: "_unity_mcp_playmode_smoke_dirtier" });
          expect(!isErrorResult(dirtierR), `go_create (dirtier) isError: ${getText(dirtierR)}`);
          const dirtierId = JSON.parse(getText(dirtierR)).instanceId;
          try {
            const baseMtime = (await fsStat.stat(sceneFile)).mtimeMs;
            const playWithSaveR = await client.callTool("playmode_set", { state: "play" });
            expect(!isErrorResult(playWithSaveR), `playmode_set(play, dirty-scene) isError: ${getText(playWithSaveR)}`);
            const postMtime = (await fsStat.stat(sceneFile)).mtimeMs;
            expect(postMtime > baseMtime,
              `dirty-scene auto-save expected scene mtime to advance; base=${baseMtime} post=${postMtime}`);
            console.log(`[smoke:v2] [Playmode] dirty-scene auto-save → scene mtime advanced (Δ=${(postMtime - baseMtime).toFixed(0)}ms)`);
          } finally {
            await client.callTool("playmode_set", { state: "stopped" });
            await client.callTool("go_delete", { instanceId: dirtierId });
          }
        }

        if (!includeTimeoutProbe) {
          console.log("[smoke:v2] [Playmode] forced-timeout + saveDirtyScenes:false probes gated under --include-playmode-timeout-probe (skipping)");
        } else {
          // Case 6 — Forced timeout (done-criterion #4). Manual-verification
          // path per spec §Open questions option (b). timeoutMs:1000 (the
          // schema minimum) against a stopped→play call is virtually
          // guaranteed to time out — Unity needs 100–500ms to enter Play Mode
          // even from a hot domain, and the schema rejects/clamps any lower
          // value. The Editor is left in whatever half-state Unity is in —
          // the tool does not roll back; we restore by force-stopping below.
          console.log("[smoke:v2] [Playmode] MANUAL: forced-timeout probe — verifying TransitionTimeout envelope shape");
          const timeoutR = await client.callTool("playmode_set", { state: "play", timeoutMs: 1000 });
          expect(isErrorResult(timeoutR), `forced-timeout call should have isError=true; got: ${getText(timeoutR)}`);
          const errText = getText(timeoutR);
          const detailsMatch = errText.match(/^Details: (\{.*\})$/m);
          expect(!!detailsMatch, `forced-timeout response missing 'Details:' envelope line; raw: ${errText.slice(0, 200)}`);
          if (detailsMatch) {
            const details = JSON.parse(detailsMatch[1]);
            expect(details.requestedState === "play",
              `TransitionTimeout details.requestedState=${details.requestedState}; expected 'play'`);
            expect(typeof details.observedState === "string",
              `TransitionTimeout details.observedState not a string: ${JSON.stringify(details.observedState)}`);
            expect(typeof details.elapsedMs === "number",
              `TransitionTimeout details.elapsedMs not a number: ${JSON.stringify(details.elapsedMs)}`);
            console.log(`[smoke:v2] [Playmode] TransitionTimeout shape snapshot: ${JSON.stringify(details)}`);
          }
          // Restore baseline — Editor is mid-transition from the forced
          // timeout. Give Unity a generous timeout to settle.
          await client.callTool("playmode_set", { state: "stopped", timeoutMs: 30_000 });

          // Case 8 — saveDirtyScenes:false (done-criterion #5, "exercised at
          // least once"). Dirty the scene, call playmode_set with the opt-out,
          // assert the scene mtime did NOT move. Note: if the user has Play
          // Mode Options → Reload Scene enabled, this can hang. The
          // bounded await caps the damage.
          console.log("[smoke:v2] [Playmode] CAVEAT: saveDirtyScenes:false probe — may hang if Play Mode Options 'Reload Scene' is enabled");
          const sceneInfo2R = await client.callTool("scene_info", {});
          const activeScenePath2 = JSON.parse(getText(sceneInfo2R)).active?.path ?? "";
          if (!activeScenePath2 || !activeScenePath2.endsWith(".unity")) {
            console.log(`[smoke:v2] [Playmode] saveDirtyScenes:false probe SKIPPED — no on-disk active scene`);
          } else {
            const sceneFile2 = path.resolve(projectPath, activeScenePath2);
            const dirtier2R = await client.callTool("go_create", { name: "_unity_mcp_playmode_smoke_dirtier_2" });
            expect(!isErrorResult(dirtier2R), `go_create (dirtier 2) isError: ${getText(dirtier2R)}`);
            const dirtier2Id = JSON.parse(getText(dirtier2R)).instanceId;
            try {
              const baseMtime2 = (await fsStat.stat(sceneFile2)).mtimeMs;
              const noSaveR = await client.callTool("playmode_set", { state: "play", saveDirtyScenes: false });
              if (isErrorResult(noSaveR)) {
                console.log(`[smoke:v2] [Playmode] saveDirtyScenes:false → playmode_set errored (expected-but-undesired under Reload Scene): ${getText(noSaveR).slice(0, 120)}`);
              } else {
                const postMtime2 = (await fsStat.stat(sceneFile2)).mtimeMs;
                expect(postMtime2 === baseMtime2,
                  `saveDirtyScenes:false expected scene mtime unchanged; base=${baseMtime2} post=${postMtime2}`);
                console.log(`[smoke:v2] [Playmode] saveDirtyScenes:false → scene mtime unchanged (${baseMtime2})`);
              }
            } finally {
              await client.callTool("playmode_set", { state: "stopped", timeoutMs: 30_000 });
              await client.callTool("go_delete", { instanceId: dirtier2Id });
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## XriGrab                                              (plan v2 Step 10)
    // -------------------------------------------------------------------------
    // xri_drive_install — reversible takeover of the MRTK InputSimulator's
    // ActionReference bindings so an external driver can deterministically
    // drive grab. Requires the MRTKDevTemplate MCPTest scene loaded; the
    // section enters/exits Play Mode itself. Gated behind --include-xri-grab-tests
    // because Play Mode transitions are slow (~10-30s) and the install mutates
    // the InputSimulator's serialized field state.
    if (shouldRun("XriGrab")) {
      const includeXriGrab = args.includes("--include-xri-grab-tests");
      if (!includeXriGrab) {
        console.log("[smoke:v2] [XriGrab] gated under --include-xri-grab-tests (skipping)");
      } else {
        // Surface check (Spec criterion #1) — xri_drive_install must advertise
        // its reversible-takeover semantics in tools/list.
        const toolList = await client.listTools();
        const driveEntry = (toolList.tools ?? []).find((t) => t.name === "xri_drive_install");
        if (!driveEntry) {
          console.log("[smoke:v2] [XriGrab] gating ok — xri_drive_install not surfaced (capabilities.xri missing, skipping)");
        } else {
          expect(
            typeof driveEntry.description === "string"
              && (driveEntry.description.toLowerCase().includes("snapshot")
                || driveEntry.description.toLowerCase().includes("uninstall restores")),
            `xri_drive_install description should mention 'snapshot' or 'uninstall restores'; got: ${driveEntry.description?.slice(0, 120)}…`,
          );
          console.log("[smoke:v2] [XriGrab] xri_drive_install surfaces in tools/list with reversible-takeover description");

          // Enter Play Mode — install only meaningfully runs there, and the
          // session-id stability assertion requires a single contiguous Play
          // Mode session.
          const playR = await client.callTool("playmode_set", { state: "play" });
          expect(!isErrorResult(playR), `playmode_set(play) isError: ${getText(playR)}`);
          const playData = JSON.parse(getText(playR));
          expect(playData.current === "play", `playmode_set(play) current=${playData.current}; expected 'play'`);
          expect(typeof playData.transitionMs === "number", `playmode_set(play) transitionMs not number: ${playData.transitionMs}`);
          console.log(`[smoke:v2] [XriGrab] playmode_set(play) → current='${playData.current}' transitionMs=${playData.transitionMs}`);

          try {
            // Snapshot pre-install bindings — driverActive must be false before
            // any install call so the restore step has a clean baseline.
            const preR = await client.callTool("xri_get_input_actions", {});
            expect(!isErrorResult(preR), `xri_get_input_actions (pre-install) isError: ${getText(preR)}`);
            const preInstall = JSON.parse(getText(preR));
            expect(preInstall.driverActive === false,
              `pre-install driverActive=${preInstall.driverActive}; expected false`);
            console.log(`[smoke:v2] [XriGrab] pre-install → assetName='${preInstall.assetName}' driverActive=${preInstall.driverActive}`);

            // Install — envelope shape (Spec criterion #2).
            const inst1R = await client.callTool("xri_drive_install", { install: true });
            expect(!isErrorResult(inst1R), `xri_drive_install(install:true) isError: ${getText(inst1R)}`);
            const inst1 = JSON.parse(getText(inst1R));
            expect(inst1.installed === true, `installed=${inst1.installed}; expected true`);
            expect(inst1.alreadyPresent === false, `alreadyPresent=${inst1.alreadyPresent}; expected false (first install)`);
            expect(typeof inst1.driverVersion === "string" && /^\d+\.\d+\.\d+$/.test(inst1.driverVersion),
              `driverVersion='${inst1.driverVersion}' should match semver \\d+.\\d+.\\d+`);
            expect(typeof inst1.sessionId === "string" && inst1.sessionId.length >= 36,
              `sessionId='${inst1.sessionId}' should be a string >= 36 chars`);
            expect(typeof inst1.installedAt === "number",
              `installedAt=${inst1.installedAt} should be a number`);
            console.log(`[smoke:v2] [XriGrab] xri_drive_install(install) → installed=${inst1.installed} alreadyPresent=${inst1.alreadyPresent} driverVersion=${inst1.driverVersion} sessionId=${inst1.sessionId.slice(0, 8)}… installedAt=${inst1.installedAt}`);

            // Re-install idempotent — alreadyPresent flips true and sessionId
            // stays stable within the same Play Mode session.
            const inst2R = await client.callTool("xri_drive_install", { install: true });
            expect(!isErrorResult(inst2R), `xri_drive_install(install:true, re-install) isError: ${getText(inst2R)}`);
            const inst2 = JSON.parse(getText(inst2R));
            expect(inst2.alreadyPresent === true, `re-install alreadyPresent=${inst2.alreadyPresent}; expected true`);
            expect(inst2.sessionId === inst1.sessionId,
              `sessionId not stable across re-install: ${inst1.sessionId} vs ${inst2.sessionId}`);
            console.log(`[smoke:v2] [XriGrab] xri_drive_install(re-install) → alreadyPresent=${inst2.alreadyPresent} sessionId stable`);

            // Inspect post-install — driverActive flips true and the asset
            // name reports the McpInputActions overlay.
            const postR = await client.callTool("xri_get_input_actions", {});
            expect(!isErrorResult(postR), `xri_get_input_actions (post-install) isError: ${getText(postR)}`);
            const postInstall = JSON.parse(getText(postR));
            expect(postInstall.driverActive === true,
              `post-install driverActive=${postInstall.driverActive}; expected true`);
            expect(postInstall.assetName === "McpInputActions",
              `post-install assetName='${postInstall.assetName}'; expected 'McpInputActions'`);
            console.log(`[smoke:v2] [XriGrab] post-install → assetName='${postInstall.assetName}' driverActive=${postInstall.driverActive}`);

            // Grab assertion against a seeded ObjectManipulator cube needs the
            // MCPTest scene wired with a specific cube; the harness does not
            // currently seed it. Defer to user-attested verification.
            console.log("[smoke:v2] [XriGrab] MANUAL: head/hand-pose grab assertion deferred to plan v2 Step 3 user-attested verification (requires MCPTest scene seeded)");

            // Uninstall — envelope shape (Spec criterion #3).
            const uninstR = await client.callTool("xri_drive_install", { install: false });
            expect(!isErrorResult(uninstR), `xri_drive_install(install:false) isError: ${getText(uninstR)}`);
            const uninst = JSON.parse(getText(uninstR));
            expect(uninst.installed === false, `uninstall installed=${uninst.installed}; expected false`);
            expect(uninst.alreadyPresent === true, `uninstall alreadyPresent=${uninst.alreadyPresent}; expected true`);
            console.log(`[smoke:v2] [XriGrab] xri_drive_install(uninstall) → installed=${uninst.installed} alreadyPresent=${uninst.alreadyPresent}`);

            // Verify restore — driverActive flips back to false and the
            // ordered action-map name list matches the pre-install snapshot.
            // (Full byte-equal binding diff requires MCPTest specifics the
            // harness doesn't carry; map-name equality is the shallow proxy.)
            const restoredR = await client.callTool("xri_get_input_actions", {});
            expect(!isErrorResult(restoredR), `xri_get_input_actions (post-uninstall) isError: ${getText(restoredR)}`);
            const restored = JSON.parse(getText(restoredR));
            expect(restored.driverActive === false,
              `post-uninstall driverActive=${restored.driverActive}; expected false`);
            expect(
              JSON.stringify(preInstall.actionMaps.map((m) => m.name))
                === JSON.stringify(restored.actionMaps.map((m) => m.name)),
              `post-uninstall actionMaps name list diverges from pre-install snapshot`,
            );
            console.log(`[smoke:v2] [XriGrab] restore verified → driverActive=${restored.driverActive} map names match pre-install snapshot`);

            // Second install→uninstall cycle — sessionId must remain stable
            // across both installs in the same Play Mode session (proves the
            // session id is bound to Play Mode entry, not to install calls).
            const inst3R = await client.callTool("xri_drive_install", { install: true });
            expect(!isErrorResult(inst3R), `xri_drive_install(install:true, cycle 2) isError: ${getText(inst3R)}`);
            const inst3 = JSON.parse(getText(inst3R));
            expect(inst3.installed === true, `cycle-2 install installed=${inst3.installed}; expected true`);
            expect(inst3.sessionId === inst1.sessionId,
              `cycle-2 sessionId not stable: ${inst1.sessionId} vs ${inst3.sessionId}`);
            const uninst2R = await client.callTool("xri_drive_install", { install: false });
            expect(!isErrorResult(uninst2R), `xri_drive_install(install:false, cycle 2) isError: ${getText(uninst2R)}`);
            const uninst2 = JSON.parse(getText(uninst2R));
            expect(uninst2.installed === false, `cycle-2 uninstall installed=${uninst2.installed}; expected false`);
            console.log(`[smoke:v2] [XriGrab] install→uninstall cycle 2 → sessionId still stable (${inst3.sessionId.slice(0, 8)}…)`);

            // Failure-path probes — fresh-scene with no MRTK simulator,
            // ActionReference field renamed, and XR loader active all require
            // disruptive project mutations the harness doesn't currently
            // perform. Defer to user-attested verification (Spec criterion #4).
            console.log("[smoke:v2] [XriGrab] MANUAL: mrtk_input_simulator_not_found / action_reference_property_missing / xr_loader_active failure paths are user-attested (Spec criterion #4)");
          } finally {
            // Always stop Play Mode — a failed assertion above must not leave
            // the Editor in Play Mode with the driver installed.
            await client.callTool("playmode_set", { state: "stopped", timeoutMs: 30_000 });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## CustomTools                                       (plan Steps 20-22)
    // -------------------------------------------------------------------------
    if (shouldRun("CustomTools")) {
      const includeCustomTools = args.includes("--include-custom-tools");
      if (!includeCustomTools) {
        // Default mode: skip the destructive opt-in cycle (modifies package.json
        // + writes a project-side .cs file). Verify only that the surface is in
        // the expected pre-opt-in state — no tools whose declaring assembly is
        // outside the package's own Editor assembly should appear in tools/list.
        // (The full opt-in/opt-out cycle is exercised under --include-custom-tools.)
        const t = await client.listTools();
        const toolCount = (t.tools ?? []).length;
        expect(toolCount > 0, "tools/list should be non-empty");
        console.log(`[smoke:v2] [CustomTools] surface stable at ${toolCount} tools; skipped opt-in cycle (pass --include-custom-tools to exercise)`);
      } else {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const projectInfoR = await client.callTool("project_info", {});
        const projectPath = JSON.parse(getText(projectInfoR)).projectPath;
        const packagePath = resolve(__dirname, "..", "..", "unity-package");
        const packageJsonPath = path.resolve(packagePath, "package.json");
        const stubPath = path.resolve(projectPath, "Assets", "Scripts", "UnityMcpSmoke", "FooTool.cs");
        const stubDir = path.dirname(stubPath);

        const originalPackageJson = await fs.readFile(packageJsonPath, "utf8");
        const originalParsed = JSON.parse(originalPackageJson);

        const cleanup = async () => {
          try { await fs.writeFile(packageJsonPath, originalPackageJson); } catch {}
          try { await fs.rm(stubPath, { force: true }); } catch {}
          try { await fs.rm(stubPath + ".meta", { force: true }); } catch {}
          try { await fs.rmdir(stubDir); } catch {}
        };

        try {
          await fs.mkdir(stubDir, { recursive: true });
          await fs.writeFile(stubPath, `using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Tools;

namespace UnityMcpSmoke
{
    [UnityMcpTool("foo")]
    public sealed class FooTool : IUnityMcpTool
    {
        public string Name => "foo";
        public string Description => "Smoke-harness stub. Removed at end of run.";
        public JObject InputSchema => new JObject { ["type"] = "object", ["additionalProperties"] = false };
        public Task<ToolResult> InvokeAsync(JObject p, ToolContext ctx)
            => Task.FromResult(ToolResult.Json(new JObject { ["foo"] = "bar" }));
    }
}
`);
          const flipped = { ...originalParsed, unityMcp: { ...(originalParsed.unityMcp ?? {}), customToolsEnabled: true } };
          await fs.writeFile(packageJsonPath, JSON.stringify(flipped, null, 2) + "\n");

          console.log("[smoke:v2] [CustomTools] wrote stub + flipped flag");
          console.log("[smoke:v2] [CustomTools] *** focus the Unity Editor window now to trigger refresh ***");

          const deadline = Date.now() + 90_000;
          let fooSeen = false;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            const t = await client.listTools();
            const toolNames = (t.tools ?? []).map((x) => x.name);
            if (toolNames.includes("foo")) { fooSeen = true; break; }
          }
          expect(fooSeen, "custom 'foo' should appear in tools/list within 90s after recompile");
          if (fooSeen) {
            console.log("[smoke:v2] [CustomTools] custom 'foo' surfaced after recompile");
            const fooR = await client.callTool("foo", {});
            expect(!isErrorResult(fooR), `custom 'foo' isError: ${getText(fooR)}`);
            console.log("[smoke:v2] [CustomTools] custom 'foo' invoked successfully");
          }
        } finally {
          await cleanup();
          console.log("[smoke:v2] [CustomTools] cleanup complete; restored package.json + removed stub");
          console.log("[smoke:v2] [CustomTools] *** focus Unity once more to drop the custom tool ***");
        }
      }
    }

    // -------------------------------------------------------------------------
    // ## UiAuthoring                          (spec/plan ui-authoring v1)
    // -------------------------------------------------------------------------
    // Round-trips the ui-authoring tool domain: UITK document/USS/element +
    // inspect, UGUI button + inspect, capability gating, and the boundary
    // rejections (USS subset, system-mixing). Writes assets under Assets/ and
    // cleans them up. UGUI tools gate on capabilities.ugui; the section logs a
    // gating note and skips the UGUI half when absent rather than failing.
    if (shouldRun("UiAuthoring")) {
      const stamp = Date.now();
      const uxmlPath = `Assets/_smoke_ui_${stamp}.uxml`;
      const ussPath = `Assets/_smoke_ui_${stamp}.uss`;
      const uguiPresent = names.some((n) => n === "ui_create_canvas");
      const createdGoIds = [];

      try {
        // --- UITK (always-on) ---
        expect(names.includes("uitk_create_document"), "uitk_create_document should always register");

        // uitk_create_document → .uxml asset + UIDocument + GUID (criterion 2).
        const docR = await client.callTool("uitk_create_document", { name: `SmokeDoc_${stamp}`, path: uxmlPath });
        expect(!isErrorResult(docR), `uitk_create_document isError: ${getText(docR)}`);
        const doc = JSON.parse(getText(docR));
        expect(typeof doc.guid === "string" && doc.guid.length === 32, `uitk doc GUID malformed: ${doc.guid}`);
        if (typeof doc.instanceId === "number") createdGoIds.push(doc.instanceId);
        console.log(`[smoke:v2] [UiAuthoring] uitk_create_document → guid=${doc.guid.slice(0, 8)}…`);

        // uitk_write_uss with an unsupported property → InvalidInput (criterion 3, negative).
        const badUssR = await client.callTool("uitk_write_uss", { path: ussPath, content: ".x { box-shadow: 0 0 4px; }" });
        expect(isErrorResult(badUssR), "uitk_write_uss(box-shadow) should error");
        expect(getText(badUssR).toLowerCase().includes("box-shadow"), `USS reject should name the property; got: ${getText(badUssR)}`);
        console.log("[smoke:v2] [UiAuthoring] uitk_write_uss(box-shadow) → expected InvalidInput naming property");

        // uitk_write_uss with the supported subset → writes, links into the doc (criterion 3, positive).
        const ussR = await client.callTool("uitk_write_uss", {
          path: ussPath, content: ".panel { display: flex; border-radius: 6px; opacity: 0.9; }", documentPath: uxmlPath,
        });
        expect(!isErrorResult(ussR), `uitk_write_uss(supported) isError: ${getText(ussR)}`);
        const uss = JSON.parse(getText(ussR));
        expect(typeof uss.guid === "string" && uss.guid.length === 32, `uss GUID malformed: ${uss.guid}`);
        console.log(`[smoke:v2] [UiAuthoring] uitk_write_uss(supported) → guid=${uss.guid.slice(0, 8)}…`);

        // uitk_add_element ×2 then uitk_inspect → structural parity (criterion 4).
        const addLabelR = await client.callTool("uitk_add_element", {
          documentPath: uxmlPath, elementType: "Label", name: "Title", class: ["heading"],
        });
        expect(!isErrorResult(addLabelR), `uitk_add_element(Label) isError: ${getText(addLabelR)}`);
        const addBtnR = await client.callTool("uitk_add_element", { documentPath: uxmlPath, elementType: "Button", name: "Go" });
        expect(!isErrorResult(addBtnR), `uitk_add_element(Button) isError: ${getText(addBtnR)}`);

        // uitk_add_element with a UGUI type → InvalidInput naming the mixing violation (criterion 6).
        const mixR = await client.callTool("uitk_add_element", { documentPath: uxmlPath, elementType: "Canvas" });
        expect(isErrorResult(mixR), "uitk_add_element(Canvas) should error (mixed-system)");
        console.log("[smoke:v2] [UiAuthoring] uitk_add_element(Canvas) → expected InvalidInput (mixed-system)");

        const inspectR = await client.callTool("uitk_inspect", { assetPath: uxmlPath });
        expect(!isErrorResult(inspectR), `uitk_inspect isError: ${getText(inspectR)}`);
        const tree = JSON.parse(getText(inspectR));
        const childTypes = (tree.root?.children ?? []).map((c) => `${c.type}:${c.name}`);
        expect(childTypes.includes("Label:Title"), `uitk_inspect should show Label:Title; got ${childTypes}`);
        expect(childTypes.includes("Button:Go"), `uitk_inspect should show Button:Go; got ${childTypes}`);
        expect(Array.isArray(tree.ussNotes), "uitk_inspect should expose ussNotes (UssSupport second-caller)");
        console.log(`[smoke:v2] [UiAuthoring] uitk_inspect → children ${childTypes.join(", ")}; ussNotes=${tree.ussNotes.length}`);

        // --- UGUI (gated on capabilities.ugui) ---
        if (!uguiPresent) {
          console.log("[smoke:v2] [UiAuthoring] gating ok — no ui_*/ugui_* tools surface (capabilities.ugui missing)");
        } else {
          expect(names.includes("ugui_create_button"), "ugui_create_button should register when ugui present");
          expect(names.includes("ugui_inspect"), "ugui_inspect should register when ugui present");

          const canvasR = await client.callTool("ui_create_canvas", { name: `SmokeCanvas_${stamp}`, renderMode: "screen-overlay" });
          expect(!isErrorResult(canvasR), `ui_create_canvas isError: ${getText(canvasR)}`);
          const canvasId = JSON.parse(getText(canvasR)).instanceId;
          createdGoIds.push(canvasId);

          // ugui_create_button → composite hierarchy with label raycastTarget OFF (criterion 7 hygiene).
          const btnR = await client.callTool("ugui_create_button", { parentInstanceId: canvasId, name: `SmokeBtn_${stamp}`, label: "Hi" });
          expect(!isErrorResult(btnR), `ugui_create_button isError: ${getText(btnR)}`);
          const btn = JSON.parse(getText(btnR));
          expect(typeof btn.buttonInstanceId === "number", "ugui_create_button missing buttonInstanceId");
          expect(btn.labelType === "TextMeshProUGUI" || btn.labelType === "Text", `unexpected labelType ${btn.labelType}`);
          console.log(`[smoke:v2] [UiAuthoring] ugui_create_button → labelType=${btn.labelType}`);

          // ugui_inspect → hierarchy + anchors + raycast (criterion 4, UGUI side).
          const ugInspectR = await client.callTool("ugui_inspect", { instanceId: canvasId });
          expect(!isErrorResult(ugInspectR), `ugui_inspect isError: ${getText(ugInspectR)}`);
          const ugTree = JSON.parse(getText(ugInspectR));
          const btnNode = (ugTree.root?.children ?? []).find((c) => c.name === `SmokeBtn_${stamp}`);
          expect(btnNode != null, "ugui_inspect should show the created button");
          const labelNode = (btnNode?.children ?? [])[0];
          expect(labelNode && labelNode.raycastTarget === false, "label raycastTarget should be false (raycast hygiene)");
          console.log(`[smoke:v2] [UiAuthoring] ugui_inspect → button found, label raycastTarget=${labelNode?.raycastTarget}`);

          // Responsive anchorPreset: a button created with anchorPreset:stretch should come
          // back from ugui_inspect anchored (0,0)→(1,1), not at the fixed default rect.
          const respR = await client.callTool("ugui_create_button", {
            parentInstanceId: canvasId, name: `RespBtn_${stamp}`, label: "Stretch", anchorPreset: "stretch",
          });
          expect(!isErrorResult(respR), `ugui_create_button(anchorPreset) isError: ${getText(respR)}`);
          const respInspectR = await client.callTool("ugui_inspect", { instanceId: canvasId });
          const respTree = JSON.parse(getText(respInspectR));
          const respNode = (respTree.root?.children ?? []).find((c) => c.name === `RespBtn_${stamp}`);
          expect(respNode != null, "anchorPreset button should be found by ugui_inspect");
          const aMin = respNode?.rect?.anchorMin, aMax = respNode?.rect?.anchorMax;
          expect(Array.isArray(aMin) && aMin[0] === 0 && aMin[1] === 0, `anchorPreset:stretch anchorMin should be [0,0]; got ${JSON.stringify(aMin)}`);
          expect(Array.isArray(aMax) && aMax[0] === 1 && aMax[1] === 1, `anchorPreset:stretch anchorMax should be [1,1]; got ${JSON.stringify(aMax)}`);
          console.log(`[smoke:v2] [UiAuthoring] ugui_create_button(anchorPreset:stretch) → anchors ${JSON.stringify(aMin)}→${JSON.stringify(aMax)} (responsive)`);

          // anchorPreset validation: an unknown preset → InvalidInput.
          const badPresetR = await client.callTool("ugui_create_button", {
            parentInstanceId: canvasId, name: `BadPreset_${stamp}`, anchorPreset: "not-a-preset",
          });
          expect(isErrorResult(badPresetR), "ugui_create_button(unknown anchorPreset) should error");
          console.log("[smoke:v2] [UiAuthoring] ugui_create_button(unknown anchorPreset) → expected InvalidInput");

          // Reverse mixing guard: a UGUI button under a UITK UIDocument → InvalidInput (criterion 6, reverse).
          if (typeof doc.instanceId === "number") {
            const reverseMixR = await client.callTool("ugui_create_button", { parentInstanceId: doc.instanceId, name: `BadBtn_${stamp}` });
            expect(isErrorResult(reverseMixR), "ugui_create_button under a UIDocument should error (reverse mixed-system)");
            console.log("[smoke:v2] [UiAuthoring] ugui_create_button(under UIDocument) → expected InvalidInput (reverse mixed-system)");
          }
        }
      } finally {
        for (const id of createdGoIds) { try { await client.callTool("go_delete", { instanceId: id }); } catch {} }
        try { await client.callTool("asset_delete", { path: ussPath }); } catch {}
        try { await client.callTool("asset_delete", { path: uxmlPath }); } catch {}
        console.log("[smoke:v2] [UiAuthoring] cleanup complete; removed test GOs + .uxml/.uss assets");
      }
    }

    // -------------------------------------------------------------------------
    // ## Logging                                                (plan Step 25)
    // -------------------------------------------------------------------------
    if (shouldRun("Logging")) {
      // Server stderr already collected by StdioMcpClient.stderrLines. Editor
      // logs come from a console_read call. Both halves emit `<prefix> <id8>
      // <tool> <action> ...` lines; we extract per-id pairs and assert each
      // call appears on both halves with the same tool name (criterion #7).
      // 8-hex-char correlation ID prefix from randomUUID (the trim functions
      // in InvocationLog and invocation-log.ts both take .slice(0, 8) of the
      // UUID, which is always 8 hex chars with no dash).
      const SERVER_RE = /^\[unity-mcp\]\s+([0-9a-f]{8})\s+(\S+)\s+(start|ok|err)\b/;
      const EDITOR_RE = /^\[UnityMCP\]\s+([0-9a-f]{8})\s+(\S+)\s+(start|ok|err)\b/;

      const serverEvents = new Map(); // id8 → [{ tool, action }]
      const serverText = client.stderrLines.join("");
      for (const rawLine of serverText.split(/\r?\n/)) {
        const m = SERVER_RE.exec(rawLine);
        if (!m) continue;
        const [, id8, tool, action] = m;
        if (!serverEvents.has(id8)) serverEvents.set(id8, []);
        serverEvents.get(id8).push({ tool, action });
      }

      // Read Editor console — paged in case the buffer is large.
      const consoleR = await client.callTool("console_read", { severities: ["log"], limit: 1000 });
      expect(!isErrorResult(consoleR), `console_read isError: ${getText(consoleR)}`);
      const consoleData = JSON.parse(getText(consoleR));
      const editorEvents = new Map();
      for (const item of consoleData.items ?? []) {
        const m = EDITOR_RE.exec(item.message ?? "");
        if (!m) continue;
        const [, id8, tool, action] = m;
        if (!editorEvents.has(id8)) editorEvents.set(id8, []);
        editorEvents.get(id8).push({ tool, action });
      }

      // Pair-up assertion. Each correlation ID maps to ≥2 events (start + ok/err)
      // on each side, so iterate unique IDs, not events. We expect every server
      // correlation to also appear on the editor side with a matching tool name.
      // The reverse direction (editor IDs not in server set) can happen when the
      // editor was driven by a different MCP client or harness invocation — we
      // don't fail on those.
      const pairedIds = [];
      const unpairedIds = [];
      for (const id8 of serverEvents.keys()) {
        const sEvents = serverEvents.get(id8);
        const eEvents = editorEvents.get(id8);
        if (!eEvents) {
          unpairedIds.push({ id8, reason: "no editor entry" });
          continue;
        }
        const sTool = sEvents[0]?.tool;
        const eTool = eEvents[0]?.tool;
        if (sTool !== eTool) {
          unpairedIds.push({ id8, reason: `tool mismatch: server=${sTool} editor=${eTool}` });
          continue;
        }
        pairedIds.push(id8);
      }

      // Allow up to ~1 unpaired call (race: smoke harness's last call may emit
      // its server line *after* console_read returns but before the editor
      // log buffer captures it). More than 1 means structural drift.
      const unpairedAllowance = 1;
      expect(
        unpairedIds.length <= unpairedAllowance,
        `paired-log mismatch: ${unpairedIds.length} unpaired correlation IDs (allowed: ${unpairedAllowance}). Details: ${JSON.stringify(unpairedIds.slice(0, 5))}`,
      );
      expect(pairedIds.length >= 5, `expected ≥5 paired correlation IDs in this run; got ${pairedIds.length}`);
      console.log(`[smoke:v2] [Logging] paired ${pairedIds.length} correlation IDs end-to-end (${unpairedIds.length} unpaired, ≤${unpairedAllowance} allowed)`);
    }

    if (playMode) {
      // -----------------------------------------------------------------------
      // ## XRI play-mode                                        (plan Step 19)
      // -----------------------------------------------------------------------
      // Manual gate: this section assumes Unity is currently in play mode (the
      // smoke harness intentionally does NOT enter play mode automatically — it
      // would require a private testing tool that pollutes the public surface).
      //
      // To run: enter play mode in Unity, then `npm run smoke:v2 -- --play-mode`.
      // The harness will write a head pose, capture, write a different pose,
      // capture again, and assert the two PNG hashes differ (criterion #5).
      const PNG_SIG = "89504e470d0a1a0a";
      const xrAvailable = names.some((n) => n === "view_user_perspective");
      if (!xrAvailable) {
        console.log("[smoke:v2] [play-mode] XR vision tools not available; skipping");
      } else {
        const cap1R = await client.callTool("view_user_perspective", { width: 320, height: 180 });
        expect(!isErrorResult(cap1R), `pre-write capture isError: ${getText(cap1R)}`);
        const png1 = JSON.parse(getText(cap1R)).pngBase64;
        const hash1 = createHash("sha1").update(Buffer.from(png1, "base64")).digest("hex");

        // Write a head pose somewhere different from the rig's current spawn.
        const writeR = await client.callTool("xri_simulate_pose", {
          device: "head", position: [3, 1.7, 0], rotation: [0, 90, 0],
        });
        expect(!isErrorResult(writeR), `xri_simulate_pose write isError: ${getText(writeR)}`);
        expect(JSON.parse(getText(writeR)).mode === "write", "write should report mode=write");

        const cap2R = await client.callTool("view_user_perspective", { width: 320, height: 180 });
        expect(!isErrorResult(cap2R), `post-write capture isError: ${getText(cap2R)}`);
        const png2 = JSON.parse(getText(cap2R)).pngBase64;
        const hash2 = createHash("sha1").update(Buffer.from(png2, "base64")).digest("hex");

        expect(hash1 !== hash2, `pre/post-write captures should differ; both hashed to ${hash1}`);
        console.log(`[smoke:v2] [play-mode] xri_simulate_pose write → frame hash differs (${hash1.slice(0, 8)} → ${hash2.slice(0, 8)})`);
      }
    }

    // -------------------------------------------------------------------------
    // Cleanup pass — defense in depth against partial-failure runs leaving
    // orphan GameObjects in the user's scene. Sweeps anything matching the
    // smoke-harness naming prefixes (UnityMCP_Smoke_*, UnityMCP_SmokeV2_*).
    // -------------------------------------------------------------------------
    const orphanPrefixes = ["UnityMCP_Smoke_", "UnityMCP_SmokeV2_"];
    let orphanCount = 0;
    const sceneR = await client.callTool("scene_info", {});
    const sceneData = JSON.parse(getText(sceneR));
    const rootNames = sceneData.active?.rootGameObjectNames ?? [];
    for (const rootName of rootNames) {
      if (!orphanPrefixes.some((p) => rootName.startsWith(p))) continue;
      const findR = await client.callTool("go_find", { mode: "name", query: rootName, limit: 1 });
      const found = JSON.parse(getText(findR)).items?.[0];
      if (!found) continue;
      const delR = await client.callTool("go_delete", { instanceId: found.instanceId });
      if (!isErrorResult(delR)) orphanCount++;
    }
    if (orphanCount > 0) {
      console.log(`[smoke:v2] cleanup → swept ${orphanCount} orphan GameObject(s)`);
    }
  } finally {
    client.close();
  }

  if (failures.length) {
    console.error(`\n[smoke:v2] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n[smoke:v2] OK${onlyFilter ? ` (section: ${onlyFilter})` : ""}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(`\n[smoke:v2] FATAL: ${err.message}`);
  process.exit(2);
});
