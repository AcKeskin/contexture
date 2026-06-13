using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Physics
{
    /// <summary>
    /// 3D physics primitives: project settings + ad-hoc raycasts and overlap
    /// queries. Five actions:
    ///
    ///   settings      — read project Physics settings.
    ///   set_settings  — write a subset of project Physics settings.
    ///   raycast       — Physics.Raycast; returns nearest hit or null.
    ///   raycast_all   — Physics.RaycastAll; returns all hits sorted by distance.
    ///   overlap_sphere — Physics.OverlapSphere; colliders enclosed by/touching
    ///                   the sphere.
    ///   sync_transforms — Physics.SyncTransforms; flushes pending Transform
    ///                   updates into the physics scene. Useful right after
    ///                   instantiating colliders when autoSyncTransforms is
    ///                   false, before issuing a query.
    ///
    /// Direction vectors are normalized internally so callers can pass any
    /// nonzero vector without remembering to unitize. layerMask accepts either
    /// an int (raw bitmask) or a string[] of layer names — strings are OR'd
    /// via LayerMask.GetMask, which silently drops names that don't resolve;
    /// the tool surfaces a 'unresolvedLayers' field when that happens so the
    /// caller catches typos rather than seeing a silently-narrower mask.
    ///
    /// Out of scope for this slice: physics materials, joints (rigidbody/2D),
    /// force application, simulate-step. Those compose adequately via
    /// component_set_property; this slice covers the queries agents most
    /// often hand-compose.
    /// </summary>
    [UnityMcpTool("manage_physics")]
    internal sealed class ManagePhysicsTool : IUnityMcpTool
    {
        public string Name => "manage_physics";

        public string Description =>
            "3D physics operations. action=settings|set_settings|raycast|raycast_all|overlap_sphere|sync_transforms. " +
            "settings: returns { gravity:[x,y,z], defaultMaxDepenetrationVelocity, autoSyncTransforms, " +
            "queriesHitBackfaces, queriesHitTriggers, bounceThreshold, sleepThreshold, defaultContactOffset, " +
            "defaultSolverIterations, defaultSolverVelocityIterations }. " +
            "set_settings: required 'properties' map with the same keys. " +
            "raycast / raycast_all: required 'origin' [x,y,z] and 'direction' [x,y,z] (normalized " +
            "internally). Optional 'maxDistance' (default Mathf.Infinity), 'layerMask' (int or " +
            "string[] of layer names; default all), 'queryTriggerInteraction' " +
            "('UseGlobal'|'Collide'|'Ignore'; default UseGlobal). " +
            "overlap_sphere: required 'center' [x,y,z] and 'radius'. Same layerMask + " +
            "queryTriggerInteraction options. " +
            "sync_transforms: no parameters; calls Physics.SyncTransforms. " +
            "Hit shape: { point, normal, distance, colliderInstanceId, gameObjectInstanceId, " +
            "gameObjectName, isTrigger }. raycast returns { hit: <object|null> }; raycast_all and " +
            "overlap_sphere return { count, items: [...] }; sync_transforms returns { synced: true }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "settings", "set_settings", "raycast", "raycast_all", "overlap_sphere", "sync_transforms" },
                },
                ["properties"] = new JObject { ["type"] = "object" },
                ["origin"] = new JObject { ["type"] = "array", ["items"] = new JObject { ["type"] = "number" }, ["minItems"] = 3, ["maxItems"] = 3 },
                ["direction"] = new JObject { ["type"] = "array", ["items"] = new JObject { ["type"] = "number" }, ["minItems"] = 3, ["maxItems"] = 3 },
                ["center"] = new JObject { ["type"] = "array", ["items"] = new JObject { ["type"] = "number" }, ["minItems"] = 3, ["maxItems"] = 3 },
                ["radius"] = new JObject { ["type"] = "number", ["minimum"] = 0 },
                ["maxDistance"] = new JObject { ["type"] = "number", ["minimum"] = 0 },
                ["layerMask"] = new JObject { },
                ["queryTriggerInteraction"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "UseGlobal", "Collide", "Ignore" },
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            switch (action)
            {
                case "settings":       return Task.FromResult(ReadSettings());
                case "set_settings":   return Task.FromResult(WriteSettings(@params["properties"] as JObject));
                case "raycast":        return Task.FromResult(Raycast(@params, all: false));
                case "raycast_all":    return Task.FromResult(Raycast(@params, all: true));
                case "overlap_sphere": return Task.FromResult(OverlapSphere(@params));
                case "sync_transforms":
                    UnityEngine.Physics.SyncTransforms();
                    return Task.FromResult(ToolResult.Json(new JObject { ["synced"] = true }));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be settings|set_settings|raycast|raycast_all|overlap_sphere|sync_transforms; got '{action}'.");
            }
        }

        private static ToolResult ReadSettings()
        {
            var g = UnityEngine.Physics.gravity;
            return ToolResult.Json(new JObject
            {
                ["gravity"] = new JArray { g.x, g.y, g.z },
                ["defaultMaxDepenetrationVelocity"] = UnityEngine.Physics.defaultMaxDepenetrationVelocity,
                ["autoSyncTransforms"] = UnityEngine.Physics.autoSyncTransforms,
                ["queriesHitBackfaces"] = UnityEngine.Physics.queriesHitBackfaces,
                ["queriesHitTriggers"] = UnityEngine.Physics.queriesHitTriggers,
                ["bounceThreshold"] = UnityEngine.Physics.bounceThreshold,
                ["sleepThreshold"] = UnityEngine.Physics.sleepThreshold,
                ["defaultContactOffset"] = UnityEngine.Physics.defaultContactOffset,
                ["defaultSolverIterations"] = UnityEngine.Physics.defaultSolverIterations,
                ["defaultSolverVelocityIterations"] = UnityEngine.Physics.defaultSolverVelocityIterations,
            });
        }

        private static ToolResult WriteSettings(JObject props)
        {
            if (props == null || props.Count == 0)
                throw new ToolException("InvalidInput", "'properties' must be a non-empty object.");

            var applied = new JArray();
            foreach (var kvp in props)
            {
                ApplySetting(kvp.Key, kvp.Value);
                applied.Add(kvp.Key);
            }
            // Echo the post-write settings + the applied-keys list so the caller
            // doesn't have to round-trip a separate read to confirm the values
            // landed.
            var snapshot = (JObject)((JToken)ReadSettings().Data);
            snapshot["applied"] = applied;
            return ToolResult.Json(snapshot);
        }

        private static void ApplySetting(string field, JToken value)
        {
            switch (field)
            {
                case "gravity":
                {
                    var g = ExpectFloat3(field, value);
                    UnityEngine.Physics.gravity = new Vector3(g[0], g[1], g[2]);
                    break;
                }
                case "defaultMaxDepenetrationVelocity":
                    UnityEngine.Physics.defaultMaxDepenetrationVelocity = ExpectNumber(field, value);
                    break;
                case "autoSyncTransforms":
                    UnityEngine.Physics.autoSyncTransforms = ExpectBool(field, value);
                    break;
                case "queriesHitBackfaces":
                    UnityEngine.Physics.queriesHitBackfaces = ExpectBool(field, value);
                    break;
                case "queriesHitTriggers":
                    UnityEngine.Physics.queriesHitTriggers = ExpectBool(field, value);
                    break;
                case "bounceThreshold":
                    UnityEngine.Physics.bounceThreshold = ExpectNumber(field, value);
                    break;
                case "sleepThreshold":
                    UnityEngine.Physics.sleepThreshold = ExpectNumber(field, value);
                    break;
                case "defaultContactOffset":
                    UnityEngine.Physics.defaultContactOffset = ExpectNumber(field, value);
                    break;
                case "defaultSolverIterations":
                    UnityEngine.Physics.defaultSolverIterations = ExpectInt(field, value);
                    break;
                case "defaultSolverVelocityIterations":
                    UnityEngine.Physics.defaultSolverVelocityIterations = ExpectInt(field, value);
                    break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown Physics setting '{field}'. Supported: gravity, defaultMaxDepenetrationVelocity, " +
                        "autoSyncTransforms, queriesHitBackfaces, queriesHitTriggers, bounceThreshold, sleepThreshold, " +
                        "defaultContactOffset, defaultSolverIterations, defaultSolverVelocityIterations.");
            }
        }

        private static ToolResult Raycast(JObject @params, bool all)
        {
            var origin = ExpectFloat3("origin", @params["origin"]);
            var dirArr = ExpectFloat3("direction", @params["direction"]);
            var dir = new Vector3(dirArr[0], dirArr[1], dirArr[2]);
            if (dir.sqrMagnitude < 1e-10f)
                throw new ToolException("InvalidInput", "'direction' must be a nonzero vector.");
            dir = dir.normalized;

            float maxDistance = @params.Value<float?>("maxDistance") ?? Mathf.Infinity;
            int layerMask = ResolveLayerMask(@params["layerMask"], out var unresolvedLayers);
            var qti = ParseQueryTriggerInteraction(@params.Value<string>("queryTriggerInteraction"));

            var originVec = new Vector3(origin[0], origin[1], origin[2]);

            if (all)
            {
                var hits = UnityEngine.Physics.RaycastAll(originVec, dir, maxDistance, layerMask, qti);
                System.Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
                var arr = new JArray();
                foreach (var h in hits) arr.Add(SerializeHit(h));
                var data = new JObject
                {
                    ["count"] = arr.Count,
                    ["items"] = arr,
                };
                if (unresolvedLayers != null) data["unresolvedLayers"] = unresolvedLayers;
                return ToolResult.Json(data);
            }
            else
            {
                if (UnityEngine.Physics.Raycast(originVec, dir, out var h, maxDistance, layerMask, qti))
                {
                    var data = new JObject { ["hit"] = SerializeHit(h) };
                    if (unresolvedLayers != null) data["unresolvedLayers"] = unresolvedLayers;
                    return ToolResult.Json(data);
                }
                else
                {
                    var data = new JObject { ["hit"] = JValue.CreateNull() };
                    if (unresolvedLayers != null) data["unresolvedLayers"] = unresolvedLayers;
                    return ToolResult.Json(data);
                }
            }
        }

        private static ToolResult OverlapSphere(JObject @params)
        {
            var center = ExpectFloat3("center", @params["center"]);
            var radius = @params.Value<float?>("radius")
                ?? throw new ToolException("InvalidInput", "'radius' is required for action=overlap_sphere.");
            if (radius < 0f)
                throw new ToolException("InvalidInput", "'radius' must be non-negative.");

            int layerMask = ResolveLayerMask(@params["layerMask"], out var unresolvedLayers);
            var qti = ParseQueryTriggerInteraction(@params.Value<string>("queryTriggerInteraction"));
            var centerVec = new Vector3(center[0], center[1], center[2]);

            var colliders = UnityEngine.Physics.OverlapSphere(centerVec, radius, layerMask, qti);
            var arr = new JArray();
            foreach (var c in colliders) arr.Add(SerializeCollider(c));
            var data = new JObject
            {
                ["count"] = arr.Count,
                ["items"] = arr,
            };
            if (unresolvedLayers != null) data["unresolvedLayers"] = unresolvedLayers;
            return ToolResult.Json(data);
        }

        private static int ResolveLayerMask(JToken token, out JArray unresolvedLayers)
        {
            unresolvedLayers = null;
            if (token == null || token.Type == JTokenType.Null) return ~0; // all layers
            if (token.Type == JTokenType.Integer) return token.Value<int>();
            if (token is JArray arr)
            {
                int mask = 0;
                foreach (var t in arr)
                {
                    var name = t.Value<string>();
                    if (string.IsNullOrEmpty(name)) continue;
                    int bit = LayerMask.NameToLayer(name);
                    if (bit < 0)
                    {
                        if (unresolvedLayers == null) unresolvedLayers = new JArray();
                        unresolvedLayers.Add(name);
                        continue;
                    }
                    mask |= 1 << bit;
                }
                return mask == 0 && unresolvedLayers == null ? ~0 : mask;
            }
            throw new ToolException("InvalidInput", "'layerMask' must be an integer bitmask or an array of layer-name strings.");
        }

        private static QueryTriggerInteraction ParseQueryTriggerInteraction(string s)
        {
            if (string.IsNullOrEmpty(s)) return QueryTriggerInteraction.UseGlobal;
            switch (s)
            {
                case "UseGlobal": return QueryTriggerInteraction.UseGlobal;
                case "Collide":   return QueryTriggerInteraction.Collide;
                case "Ignore":    return QueryTriggerInteraction.Ignore;
                default:
                    throw new ToolException("InvalidInput",
                        $"queryTriggerInteraction must be UseGlobal|Collide|Ignore; got '{s}'.");
            }
        }

        private static JObject SerializeHit(RaycastHit h)
        {
            var coll = h.collider;
            return new JObject
            {
                ["point"] = new JArray { h.point.x, h.point.y, h.point.z },
                ["normal"] = new JArray { h.normal.x, h.normal.y, h.normal.z },
                ["distance"] = h.distance,
                ["colliderInstanceId"] = coll != null ? coll.GetInstanceID() : 0,
                ["gameObjectInstanceId"] = coll != null ? coll.gameObject.GetInstanceID() : 0,
                ["gameObjectName"] = coll != null ? coll.gameObject.name : string.Empty,
                ["isTrigger"] = coll != null && coll.isTrigger,
            };
        }

        private static JObject SerializeCollider(Collider c)
        {
            return new JObject
            {
                ["colliderInstanceId"] = c.GetInstanceID(),
                ["gameObjectInstanceId"] = c.gameObject.GetInstanceID(),
                ["gameObjectName"] = c.gameObject.name,
                ["isTrigger"] = c.isTrigger,
            };
        }

        private static float[] ExpectFloat3(string field, JToken value)
        {
            if (!(value is JArray arr) || arr.Count != 3)
                throw new ToolException("InvalidInput", $"'{field}' must be a 3-element [x,y,z] number array.");
            var f = new float[3];
            for (int i = 0; i < 3; i++) f[i] = arr[i].Value<float>();
            return f;
        }

        private static float ExpectNumber(string field, JToken value)
        {
            if (value == null || (value.Type != JTokenType.Float && value.Type != JTokenType.Integer))
                throw new ToolException("InvalidInput", $"Field '{field}' expects a number.");
            return value.Value<float>();
        }

        private static int ExpectInt(string field, JToken value)
        {
            if (value == null || value.Type != JTokenType.Integer)
                throw new ToolException("InvalidInput", $"Field '{field}' expects an integer.");
            return value.Value<int>();
        }

        private static bool ExpectBool(string field, JToken value)
        {
            if (value == null || value.Type != JTokenType.Boolean)
                throw new ToolException("InvalidInput", $"Field '{field}' expects a boolean.");
            return value.Value<bool>();
        }
    }
}
