@tool
extends SceneTree
## Headless test for value_coercion.gd. Run:
##   godot --headless -s addons/claude_mcp/tools/value_coercion_test.gd --path <project>
##
## Exercises each supported coercion type, round-trips where round-trippable, and
## asserts unsupported shapes return the UNSUPPORTED sentinel (no crash). Exits
## non-zero on any failure so the check is CI-shaped.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")

var _failures: int = 0


func _init() -> void:
	_run()
	if _failures > 0:
		push_error("value_coercion_test: %d failure(s)" % _failures)
		quit(1)
	else:
		print("value_coercion_test: ALL PASS")
		quit(0)


func _check(name: String, cond: bool, detail: String = "") -> void:
	if cond:
		print("  PASS  ", name)
	else:
		print("  FAIL  ", name, "  ", detail)
		_failures += 1


func _run() -> void:
	# ── primitives ──
	_check("bool hinted", McpCoercion.coerce(true, "bool") == true)
	_check("int hinted", McpCoercion.coerce(3.0, "int") == 3)
	_check("float hinted", McpCoercion.coerce(2, "float") == 2.0)
	_check("string hinted", McpCoercion.coerce("hi", "String") == "hi")
	_check("primitive unhinted passthrough", McpCoercion.coerce(42) == 42)

	# ── Vector2 (array + dict) ──
	var v2a = McpCoercion.coerce([1, 2], "Vector2")
	_check("Vector2 from array", v2a is Vector2 and v2a == Vector2(1, 2))
	var v2d = McpCoercion.coerce({"x": 3, "y": 4}, "Vector2")
	_check("Vector2 from dict", v2d is Vector2 and v2d == Vector2(3, 4))
	var v2j = McpCoercion.to_json(Vector2(5, 6))
	_check("Vector2 round-trip", v2j is Dictionary and v2j["x"] == 5 and v2j["y"] == 6)

	# ── Vector3 ──
	var v3a = McpCoercion.coerce([1, 2, 3], "Vector3")
	_check("Vector3 from array", v3a is Vector3 and v3a == Vector3(1, 2, 3))
	var v3j = McpCoercion.to_json(Vector3(1, 2, 3))
	_check("Vector3 round-trip", v3j is Dictionary and v3j["x"] == 1 and v3j["y"] == 2 and v3j["z"] == 3)

	# ── Vector2i / Vector3i ──
	var v2i = McpCoercion.coerce([7, 8], "Vector2i")
	_check("Vector2i", v2i is Vector2i and v2i == Vector2i(7, 8))
	var v3i = McpCoercion.coerce([7, 8, 9], "Vector3i")
	_check("Vector3i", v3i is Vector3i and v3i == Vector3i(7, 8, 9))

	# ── Color (html, array, dict, named) ──
	var ch = McpCoercion.coerce("#ff0000", "Color")
	_check("Color from html", ch is Color and ch == Color(1, 0, 0, 1))
	var ca = McpCoercion.coerce([0, 1, 0, 1], "Color")
	_check("Color from array", ca is Color and ca == Color(0, 1, 0, 1))
	var cn = McpCoercion.coerce("red", "Color")
	_check("Color from name", cn is Color and cn == Color.RED)
	var cj = McpCoercion.to_json(Color(0.5, 0.25, 0.125, 1.0))
	_check("Color round-trip shape", cj is Dictionary and cj.has("r") and cj.has("a"))

	# ── NodePath ──
	var npv = McpCoercion.coerce("Player/Camera3D", "NodePath")
	_check("NodePath coerce", npv is NodePath and str(npv) == "Player/Camera3D")
	_check("NodePath round-trip", McpCoercion.to_json(NodePath("A/B")) == "A/B")

	# ── Resource ref (inline make a .tres in user:// then load by path) ──
	var tmp_path := "user://__coercion_test_res.tres"
	var probe := Resource.new()
	ResourceSaver.save(probe, tmp_path)
	# load() works on user:// paths; the helper only gates on res:// prefix, so test
	# the resource branch via a res:// engine resource we know exists at runtime is
	# brittle — instead assert the negative (non-res:// string is UNSUPPORTED).
	_check("Resource rejects non-res path",
		McpCoercion.is_unsupported(McpCoercion.coerce("user://x.tres", "Resource")))

	# ── PackedVector2Array (list-of-arrays, list-of-dicts, flat) ──
	var pva = McpCoercion.coerce([[0, 0], [10, 0], [10, 10]], "PackedVector2Array")
	_check("PackedVector2Array from list-of-arrays",
		pva is PackedVector2Array and pva.size() == 3 and pva[1] == Vector2(10, 0))
	var pvd = McpCoercion.coerce([{"x": 1, "y": 2}, {"x": 3, "y": 4}], "PackedVector2Array")
	_check("PackedVector2Array from list-of-dicts",
		pvd is PackedVector2Array and pvd.size() == 2 and pvd[1] == Vector2(3, 4))
	var pvf = McpCoercion.coerce([0, 0, 5, 5], "PackedVector2Array")
	_check("PackedVector2Array from flat",
		pvf is PackedVector2Array and pvf.size() == 2 and pvf[1] == Vector2(5, 5))
	var pvj = McpCoercion.to_json(PackedVector2Array([Vector2(7, 8)]))
	_check("PackedVector2Array round-trip",
		pvj is Array and pvj.size() == 1 and pvj[0]["x"] == 7 and pvj[0]["y"] == 8)
	_check("PackedVector2Array rejects odd flat",
		McpCoercion.is_unsupported(McpCoercion.coerce([1, 2, 3], "PackedVector2Array")))
	_check("PackedVector2Array rejects bad element",
		McpCoercion.is_unsupported(McpCoercion.coerce([[1, 2], "nope"], "PackedVector2Array")))

	# ── Rect2 / Rect2i (array + dict, AtlasTexture region rects) ──
	var r2a = McpCoercion.coerce([10, 20, 32, 48], "Rect2")
	_check("Rect2 from array", r2a is Rect2 and r2a == Rect2(10, 20, 32, 48))
	var r2d = McpCoercion.coerce({"x": 1, "y": 2, "w": 3, "h": 4}, "Rect2")
	_check("Rect2 from dict", r2d is Rect2 and r2d == Rect2(1, 2, 3, 4))
	var r2i = McpCoercion.coerce([0, 0, 16, 16], "Rect2i")
	_check("Rect2i from array", r2i is Rect2i and r2i == Rect2i(0, 0, 16, 16))
	var r2j = McpCoercion.to_json(Rect2(5, 6, 7, 8))
	_check("Rect2 round-trip shape",
		r2j is Dictionary and r2j["x"] == 5 and r2j["y"] == 6 and r2j["w"] == 7 and r2j["h"] == 8)
	_check("Rect2 rejects short array",
		McpCoercion.is_unsupported(McpCoercion.coerce([1, 2, 3], "Rect2")))
	_check("Rect2 rejects missing key",
		McpCoercion.is_unsupported(McpCoercion.coerce({"x": 1, "y": 2, "w": 3}, "Rect2")))

	# ── StyleBox inline flat ──
	var sb = McpCoercion.coerce(
		{"type": "flat", "properties": {"bg_color": "#333333", "corner_radius": 4}}, "StyleBox")
	_check("StyleBox inline flat", sb is StyleBoxFlat and sb.bg_color == Color.html("#333333"))
	_check("StyleBox corner radius", sb is StyleBoxFlat and sb.corner_radius_top_left == 4)

	# ── UNSUPPORTED sentinel (no crash) ──
	_check("unsupported: dict no hint",
		McpCoercion.is_unsupported(McpCoercion.coerce({"foo": 1})))
	_check("unsupported: array no hint",
		McpCoercion.is_unsupported(McpCoercion.coerce([1, 2, 3])))
	_check("unsupported: bad vec shape",
		McpCoercion.is_unsupported(McpCoercion.coerce([1], "Vector2")))
	_check("unsupported: bad color",
		McpCoercion.is_unsupported(McpCoercion.coerce("notacolor", "Color")))
	_check("unsupported: unknown hint",
		McpCoercion.is_unsupported(McpCoercion.coerce("x", "Quaternion")))
