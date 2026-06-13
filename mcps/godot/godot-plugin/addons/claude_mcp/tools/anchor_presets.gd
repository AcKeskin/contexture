@tool
extends RefCounted
class_name McpAnchorPresets
## Maps a friendly anchor-preset name to Control.LayoutPreset. Shared by
## ui_create_control and ui_set_anchors (the two callers — deletion test passes).
##
## Only constants accessible at parse time are used here (no runtime ClassDB
## lookup needed — Control.PRESET_* are compile-time int constants in Godot 4.x).


## Returns the Control.LayoutPreset int for a friendly name, or -1 if unknown.
static func resolve(name: String) -> int:
	match name:
		"top_left":      return Control.PRESET_TOP_LEFT
		"top_right":     return Control.PRESET_TOP_RIGHT
		"bottom_left":   return Control.PRESET_BOTTOM_LEFT
		"bottom_right":  return Control.PRESET_BOTTOM_RIGHT
		"center_left":   return Control.PRESET_CENTER_LEFT
		"center_top":    return Control.PRESET_CENTER_TOP
		"center_right":  return Control.PRESET_CENTER_RIGHT
		"center_bottom": return Control.PRESET_CENTER_BOTTOM
		"center":        return Control.PRESET_CENTER
		"left_wide":     return Control.PRESET_LEFT_WIDE
		"top_wide":      return Control.PRESET_TOP_WIDE
		"right_wide":    return Control.PRESET_RIGHT_WIDE
		"bottom_wide":   return Control.PRESET_BOTTOM_WIDE
		"vcenter_wide":  return Control.PRESET_VCENTER_WIDE
		"hcenter_wide":  return Control.PRESET_HCENTER_WIDE
		"full_rect":     return Control.PRESET_FULL_RECT
		_:               return -1


## All supported preset names. Used in error messages and schema discoverability.
static func names() -> PackedStringArray:
	return PackedStringArray([
		"top_left", "top_right", "bottom_left", "bottom_right",
		"center_left", "center_top", "center_right", "center_bottom",
		"center",
		"left_wide", "top_wide", "right_wide", "bottom_wide",
		"vcenter_wide", "hcenter_wide",
		"full_rect",
	])
