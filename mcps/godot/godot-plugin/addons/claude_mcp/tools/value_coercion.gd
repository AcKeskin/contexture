@tool
extends RefCounted
class_name McpCoercion
## Shared JSON <-> Godot Variant coercion for tool handlers.
##
## Tools receive params as JSON-decoded Variants (the WebSocket payload is JSON):
## numbers, strings, bools, Arrays, Dictionaries, null. To set a typed property
## (a Vector3 position, a Color, a NodePath, a Resource ref, a StyleBox theme
## override) the raw JSON shape must be coerced to the right Godot type. Read-back
## goes the other way: a Godot Variant is serialized to a JSON-safe shape.
##
## This helper is the single seam both node_set_property (Bundle 1) and the theme
## tools (Bundle 3) share — extracted because two callers exist, not speculatively
## (deletion test). It has NO state; everything is static.
##
## Coverage (v2 line, spec Open Q #3): primitives, Vector2/3 + i variants, Color,
## NodePath, Resource refs (res:// path), StyleBox (res:// path or inline flat).
## Anything outside that returns the UNSUPPORTED sentinel — callers translate it to
## an InvalidInput naming the offending type. No silent best-effort coercion.

## Returned by coerce() when the JSON shape can't be mapped to the requested type.
## Callers MUST check `is_unsupported()` and surface InvalidInput — never pass this
## sentinel on as a real value.
const UNSUPPORTED := {"__mcp_unsupported__": true}


static func is_unsupported(v) -> bool:
	return v is Dictionary and v.get("__mcp_unsupported__", false)


## Map a TYPE_* constant to the hint string coerce() understands. Used by property
## setters (editor node_set_property + the in-game runtime endpoint) to infer the
## target type from a property's CURRENT value. Returns "" for types coerce() takes
## at face value (then coerce() applies its unhinted path).
static func type_name(t: int) -> String:
	match t:
		TYPE_BOOL:      return "bool"
		TYPE_INT:       return "int"
		TYPE_FLOAT:     return "float"
		TYPE_STRING:    return "String"
		TYPE_STRING_NAME: return "String"
		TYPE_VECTOR2:   return "Vector2"
		TYPE_VECTOR2I:  return "Vector2i"
		TYPE_VECTOR3:   return "Vector3"
		TYPE_VECTOR3I:  return "Vector3i"
		TYPE_COLOR:     return "Color"
		TYPE_NODE_PATH: return "NodePath"
		TYPE_RECT2:     return "Rect2"
		TYPE_RECT2I:    return "Rect2i"
		TYPE_PACKED_VECTOR2_ARRAY: return "PackedVector2Array"
		_:              return ""


# ── JSON -> Variant ───────────────────────────────────────────────────────────

## Coerce a JSON-decoded value to a Godot Variant.
##
## `hint` is an optional Godot type name ("Vector3", "Color", "NodePath",
## "StyleBox", "Resource", …). When given, it forces the target type and validates
## the shape against it. When empty, the value is taken at face value for
## primitives/strings/bools and structurally inferred for arrays/dicts that carry
## a recognisable shape — but ambiguous structures REQUIRE a hint and otherwise
## return UNSUPPORTED. Property setters should pass the property's expected type as
## the hint whenever they know it (the safe path).
static func coerce(value, hint: String = ""):
	if hint != "":
		return _coerce_hinted(value, hint)
	return _coerce_unhinted(value)


static func _coerce_hinted(value, hint: String):
	match hint:
		"bool":
			return bool(value) if (value is bool or value is float or value is int) else UNSUPPORTED
		"int":
			return int(value) if (value is float or value is int) else UNSUPPORTED
		"float":
			return float(value) if (value is float or value is int) else UNSUPPORTED
		"String", "StringName":
			return str(value) if value is String else UNSUPPORTED
		"Vector2":
			return _to_vec2(value)
		"Vector2i":
			var v = _to_vec2(value)
			return Vector2i(v) if v is Vector2 else UNSUPPORTED
		"Vector3":
			return _to_vec3(value)
		"Vector3i":
			var v = _to_vec3(value)
			return Vector3i(v) if v is Vector3 else UNSUPPORTED
		"Color":
			return _to_color(value)
		"NodePath":
			return NodePath(str(value)) if value is String else UNSUPPORTED
		"Rect2":
			return _to_rect2(value)
		"Rect2i":
			var r = _to_rect2(value)
			return Rect2i(r) if r is Rect2 else UNSUPPORTED
		"PackedVector2Array":
			return _to_packed_vec2_array(value)
		"Resource":
			return _to_resource(value)
		_:
			# StyleBox and its subclasses share the resource/inline path.
			if hint == "StyleBox" or hint.begins_with("StyleBox"):
				return _to_stylebox(value)
			return UNSUPPORTED


static func _coerce_unhinted(value):
	# Primitives and strings pass through unchanged.
	if value is bool or value is float or value is int or value is String:
		return value
	if value == null:
		return null
	# A bare array of 2-4 numbers is ambiguous (Vector2/3/Color) — require a hint.
	if value is Array or value is Dictionary:
		return UNSUPPORTED
	return UNSUPPORTED


# ── Variant -> JSON ───────────────────────────────────────────────────────────

## Serialize a Godot Variant to a JSON-safe shape for read-back. Inverse of coerce
## for the round-trippable types. Unknown/opaque types fall back to their string
## form so a read never crashes (but such a value won't round-trip through coerce).
static func to_json(value):
	match typeof(value):
		TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		TYPE_STRING_NAME:
			return str(value)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_COLOR:
			return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_NODE_PATH:
			return str(value)
		TYPE_RECT2, TYPE_RECT2I:
			return {"x": value.position.x, "y": value.position.y, "w": value.size.x, "h": value.size.y}
		TYPE_PACKED_VECTOR2_ARRAY:
			var pts: Array = []
			for v in value:
				pts.append({"x": v.x, "y": v.y})
			return pts
		TYPE_NIL:
			return null
		TYPE_ARRAY:
			var out: Array = []
			for e in value:
				out.append(to_json(e))
			return out
		TYPE_DICTIONARY:
			var out: Dictionary = {}
			for k in value:
				out[str(k)] = to_json(value[k])
			return out
		TYPE_OBJECT:
			# Resource refs serialize to their resource path when they have one.
			if value is Resource and value.resource_path != "":
				return {"resourcePath": value.resource_path}
			return str(value)
		_:
			return str(value)


# ── Shape parsers ─────────────────────────────────────────────────────────────

## Accept [x,y] or {x,y}. Returns Vector2 or UNSUPPORTED.
static func _to_vec2(value):
	if value is Array and value.size() == 2 and _all_num(value):
		return Vector2(value[0], value[1])
	if value is Dictionary and value.has("x") and value.has("y"):
		return Vector2(value["x"], value["y"])
	return UNSUPPORTED


## Accept [x,y,z] or {x,y,z}. Returns Vector3 or UNSUPPORTED.
static func _to_vec3(value):
	if value is Array and value.size() == 3 and _all_num(value):
		return Vector3(value[0], value[1], value[2])
	if value is Dictionary and value.has("x") and value.has("y") and value.has("z"):
		return Vector3(value["x"], value["y"], value["z"])
	return UNSUPPORTED


## Accept [x,y,w,h] or {x,y,w,h}. Returns Rect2 or UNSUPPORTED. Used for
## AtlasTexture region rects (set_resource) and any Rect2 property coercion.
static func _to_rect2(value):
	if value is Array and value.size() == 4 and _all_num(value):
		return Rect2(value[0], value[1], value[2], value[3])
	if value is Dictionary and value.has("x") and value.has("y") and value.has("w") and value.has("h"):
		return Rect2(value["x"], value["y"], value["w"], value["h"])
	return UNSUPPORTED


## Accept "#rrggbb"/"#rrggbbaa", a named color string, [r,g,b(,a)], or {r,g,b,a}.
static func _to_color(value):
	if value is String:
		if Color.html_is_valid(value):
			return Color.html(value)
		# Named colors (e.g. "red"): from_string returns the fallback for an
		# invalid name. Probe with two distinct sentinels — if the result equals
		# neither sentinel it's a genuine named color; if it tracks the sentinel
		# the name was invalid. (Color has no public is-valid-name predicate in 4.6.)
		var a := Color.from_string(value, Color.BLACK)
		var b := Color.from_string(value, Color.WHITE)
		if a == b:
			return a
		return UNSUPPORTED
	if value is Array and (value.size() == 3 or value.size() == 4) and _all_num(value):
		var a: float = value[3] if value.size() == 4 else 1.0
		return Color(value[0], value[1], value[2], a)
	if value is Dictionary and value.has("r") and value.has("g") and value.has("b"):
		return Color(value["r"], value["g"], value["b"], value.get("a", 1.0))
	return UNSUPPORTED


## Build a PackedVector2Array from a JSON array. Accepts three shapes:
##   [[x,y], [x,y], ...]    list of 2-number arrays
##   [{x,y}, {x,y}, ...]    list of {x,y} dicts
##   [x,y, x,y, ...]        flat list of an even count of numbers
## Each element is routed through _to_vec2; the flat form is paired up first.
## Any element that fails to coerce makes the whole value UNSUPPORTED — no
## partial/best-effort array.
static func _to_packed_vec2_array(value):
	if not (value is Array):
		return UNSUPPORTED
	var out := PackedVector2Array()
	# Flat [x,y,x,y,...] form: even-length array of numbers.
	if value.size() > 0 and _all_num(value):
		if value.size() % 2 != 0:
			return UNSUPPORTED
		var i := 0
		while i < value.size():
			out.append(Vector2(value[i], value[i + 1]))
			i += 2
		return out
	# List-of-points form: each element is [x,y] or {x,y}.
	for e in value:
		var v = _to_vec2(e)
		if not (v is Vector2):
			return UNSUPPORTED
		out.append(v)
	return out


## Load a Resource from a res:// path string.
static func _to_resource(value):
	if value is String and value.begins_with("res://"):
		var res := load(value)
		return res if res != null else UNSUPPORTED
	return UNSUPPORTED


## A StyleBox is either a res:// path to a saved .tres, or an inline flat spec:
##   {"type": "flat", "properties": {"bg_color": "#333333", "corner_radius": 4}}
static func _to_stylebox(value):
	if value is String and value.begins_with("res://"):
		var res := load(value)
		return res if res is StyleBox else UNSUPPORTED
	if value is Dictionary and str(value.get("type", "")) == "flat":
		var sb := StyleBoxFlat.new()
		var props: Dictionary = value.get("properties", {})
		for key in props:
			var k := str(key)
			if k == "bg_color":
				var c = _to_color(props[k])
				if c is Color:
					sb.bg_color = c
			elif k == "corner_radius":
				var r := int(props[k])
				sb.set_corner_radius_all(r)
			elif k in ["content_margin_left", "content_margin_right", "content_margin_top", "content_margin_bottom"]:
				sb.set(k, float(props[k]))
			# Other flat properties can be added as needed; unknown keys ignored.
		return sb
	return UNSUPPORTED


static func _all_num(arr: Array) -> bool:
	for e in arr:
		if not (e is float or e is int):
			return false
	return true
