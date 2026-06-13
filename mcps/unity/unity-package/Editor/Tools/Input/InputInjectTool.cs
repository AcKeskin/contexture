using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
#if UNITY_MCP_HAS_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.LowLevel;
#endif

namespace UnityMcp.Editor.Tools.InputTools
{
    /// <summary>
    /// Generic Unity InputSystem state injection. Pushes synthetic device state so
    /// callers can drive any code reading from the InputSystem during play mode —
    /// without needing MRTK or XRI.
    ///
    ///   key             — press/release/tap a Keyboard key by short name
    ///                     (e.g. "T", "Space", "LeftArrow"). 'hold' chooses the
    ///                     phase: press|release|tap (tap = press for 1 frame
    ///                     equivalent + release).
    ///   mouse_button    — left|right|middle press/release/tap.
    ///   mouse_position  — set the mouse cursor position in screen-pixel coordinates.
    ///   gamepad_button  — south|north|east|west|leftShoulder|rightShoulder|
    ///                     leftStick|rightStick|start|select press/release/tap on
    ///                     gamepad #0 (auto-creates a virtual gamepad if none exists).
    ///
    /// Always requires Application.isPlaying = true; rejected with InvalidInput
    /// otherwise. Tap synthesizes "press, then release on the next frame" via two
    /// InputState.Change calls; callers needing held inputs should use
    /// 'press' + 'release' pair with their own pacing.
    /// </summary>
    /// <remarks>
    /// Fires only while <c>Application.isPlaying</c> is true; any call outside Play Mode throws <c>InvalidInput</c>.
    /// </remarks>
    [UnityMcpTool("input_inject")]
    internal sealed class InputInjectTool : IUnityMcpTool
    {
        public string Name => "input_inject";

        public string Description =>
            "Inject synthetic InputSystem state into the running Unity Editor (Play Mode only). " +
            "action=key|mouse_button|mouse_position|mouse_delta|mouse_scroll|gamepad_button. " +
            "key: { key: '<short name>', hold: 'press'|'release'|'tap' (default tap) }. " +
            "mouse_button: { button: 'left'|'right'|'middle', hold: 'press'|'release'|'tap' }. " +
            "mouse_position: { position: [x, y] in screen-pixels }. " +
            "mouse_delta: { delta: [dx, dy] }. Writes Mouse.delta; for sustained drag issue many small deltas back-to-back (each call ticks InputSystem.Update once so the previous delta consumes before yours lands). " +
            "mouse_scroll: { delta: [dx, dy] }. Writes Mouse.scroll (vertical scroll is y). " +
            "gamepad_button: { button: 'south'|'north'|'east'|'west'|'leftShoulder'|'rightShoulder'|'leftStick'|'rightStick'|'start'|'select', hold: 'press'|'release'|'tap' }. " +
            "Returns { action, isPlaying, applied, details }. Requires com.unity.inputsystem (≥1.0.0).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "key", "mouse_button", "mouse_position", "mouse_delta", "mouse_scroll", "gamepad_button" },
                },
                ["key"] = new JObject { ["type"] = "string" },
                ["button"] = new JObject { ["type"] = "string" },
                ["hold"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "press", "release", "tap" },
                },
                ["position"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 2,
                    ["maxItems"] = 2,
                },
                ["delta"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 2,
                    ["maxItems"] = 2,
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_INPUT_SYSTEM
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!Application.isPlaying)
            {
                throw new ToolException("InvalidInput",
                    "input_inject requires play mode. Call playmode_set { state: 'play' } first.");
            }

            var action = @params.Value<string>("action");
            switch (action)
            {
                case "key":            return Task.FromResult(InjectKey(@params));
                case "mouse_button":   return Task.FromResult(InjectMouseButton(@params));
                case "mouse_position": return Task.FromResult(InjectMousePosition(@params));
                case "mouse_delta":    return Task.FromResult(InjectMouseDelta(@params));
                case "mouse_scroll":   return Task.FromResult(InjectMouseScroll(@params));
                case "gamepad_button": return Task.FromResult(InjectGamepadButton(@params));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be key|mouse_button|mouse_position|mouse_delta|mouse_scroll|gamepad_button; got '{action}'.");
            }
        }

        private static string ResolveHold(JObject @params, string defaultPhase = "tap")
        {
            var hold = @params.Value<string>("hold");
            if (string.IsNullOrEmpty(hold)) return defaultPhase;
            switch (hold)
            {
                case "press":
                case "release":
                case "tap":
                    return hold;
                default:
                    throw new ToolException("InvalidInput",
                        $"'hold' must be press|release|tap; got '{hold}'.");
            }
        }

        private static ToolResult InjectKey(JObject @params)
        {
            var keyName = @params.Value<string>("key");
            if (string.IsNullOrWhiteSpace(keyName))
            {
                throw new ToolException("InvalidInput", "'key' is required for action=key.");
            }

            if (!System.Enum.TryParse<Key>(keyName, ignoreCase: true, out var keyEnum))
            {
                throw new ToolException("InvalidInput",
                    $"Unknown key '{keyName}'. Use UnityEngine.InputSystem.Key short names (e.g. 'T', 'Space', 'LeftArrow').");
            }

            var keyboard = Keyboard.current;
            if (keyboard == null)
            {
                keyboard = InputSystem.AddDevice<Keyboard>();
            }

            var control = keyboard[keyEnum];
            var hold = ResolveHold(@params);
            ApplyButtonPhase(keyboard, control, hold);

            return ToolResult.Json(new JObject
            {
                ["action"] = "key",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["key"] = keyEnum.ToString(),
                    ["hold"] = hold,
                    ["devicePath"] = keyboard.path,
                },
            });
        }

        private static ToolResult InjectMouseButton(JObject @params)
        {
            var button = @params.Value<string>("button");
            if (string.IsNullOrWhiteSpace(button))
            {
                throw new ToolException("InvalidInput", "'button' is required for action=mouse_button.");
            }

            var mouse = Mouse.current;
            if (mouse == null)
            {
                mouse = InputSystem.AddDevice<Mouse>();
            }

            ButtonControl control;
            switch (button.ToLowerInvariant())
            {
                case "left":   control = mouse.leftButton; break;
                case "right":  control = mouse.rightButton; break;
                case "middle": control = mouse.middleButton; break;
                default:
                    throw new ToolException("InvalidInput",
                        $"'button' must be left|right|middle; got '{button}'.");
            }

            var hold = ResolveHold(@params);
            ApplyButtonPhase(mouse, control, hold);

            return ToolResult.Json(new JObject
            {
                ["action"] = "mouse_button",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["button"] = button.ToLowerInvariant(),
                    ["hold"] = hold,
                    ["devicePath"] = mouse.path,
                },
            });
        }

        private static ToolResult InjectMousePosition(JObject @params)
        {
            var pos = @params["position"] as JArray;
            if (pos == null || pos.Count != 2)
            {
                throw new ToolException("InvalidInput",
                    "'position' must be [x, y] in screen pixels.");
            }
            var screenPos = new Vector2(pos[0].Value<float>(), pos[1].Value<float>());

            var mouse = Mouse.current;
            if (mouse == null)
            {
                mouse = InputSystem.AddDevice<Mouse>();
            }
            InputState.Change(mouse.position, screenPos);

            return ToolResult.Json(new JObject
            {
                ["action"] = "mouse_position",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["position"] = new JArray(screenPos.x, screenPos.y),
                    ["devicePath"] = mouse.path,
                },
            });
        }

        private static ToolResult InjectMouseDelta(JObject @params)
        {
            var arr = @params["delta"] as JArray;
            if (arr == null || arr.Count != 2)
            {
                throw new ToolException("InvalidInput",
                    "'delta' must be [dx, dy].");
            }
            var delta = new Vector2(arr[0].Value<float>(), arr[1].Value<float>());

            var mouse = Mouse.current;
            if (mouse == null)
            {
                mouse = InputSystem.AddDevice<Mouse>();
            }

            // Write only the new position. The InputSystem synthesizes Mouse.delta
            // from successive position writes during Update, which is what action
            // bindings on <Mouse>/delta read from. Writing the delta control directly
            // is shadowed by this synthesis, so do not duplicate the write.
            var currentPos = mouse.position.ReadValue();
            var newPos = currentPos + delta;
            QueueVector2(mouse.position, newPos);
            InputSystem.Update();

            return ToolResult.Json(new JObject
            {
                ["action"] = "mouse_delta",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["delta"] = new JArray(delta.x, delta.y),
                    ["newPosition"] = new JArray(newPos.x, newPos.y),
                    ["devicePath"] = mouse.path,
                },
            });
        }

        private static ToolResult InjectMouseScroll(JObject @params)
        {
            var arr = @params["delta"] as JArray;
            if (arr == null || arr.Count != 2)
            {
                throw new ToolException("InvalidInput",
                    "'delta' must be [dx, dy].");
            }
            var delta = new Vector2(arr[0].Value<float>(), arr[1].Value<float>());

            var mouse = Mouse.current;
            if (mouse == null)
            {
                mouse = InputSystem.AddDevice<Mouse>();
            }
            QueueVector2(mouse.scroll, delta);
            InputSystem.Update();

            return ToolResult.Json(new JObject
            {
                ["action"] = "mouse_scroll",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["delta"] = new JArray(delta.x, delta.y),
                    ["devicePath"] = mouse.path,
                },
            });
        }

        private static void QueueVector2(InputControl<Vector2> control, Vector2 value)
        {
            using (DeltaStateEvent.From(control, out var eventPtr))
            {
                eventPtr.time = InputState.currentTime;
                control.WriteValueIntoEvent(value, eventPtr);
                InputSystem.QueueEvent(eventPtr);
            }
        }

        private static ToolResult InjectGamepadButton(JObject @params)
        {
            var button = @params.Value<string>("button");
            if (string.IsNullOrWhiteSpace(button))
            {
                throw new ToolException("InvalidInput", "'button' is required for action=gamepad_button.");
            }

            var gamepad = Gamepad.current;
            if (gamepad == null)
            {
                gamepad = InputSystem.AddDevice<Gamepad>();
            }

            ButtonControl control;
            switch (button.ToLowerInvariant())
            {
                case "south":         control = gamepad.buttonSouth; break;
                case "north":         control = gamepad.buttonNorth; break;
                case "east":          control = gamepad.buttonEast; break;
                case "west":          control = gamepad.buttonWest; break;
                case "leftshoulder":  control = gamepad.leftShoulder; break;
                case "rightshoulder": control = gamepad.rightShoulder; break;
                case "leftstick":     control = gamepad.leftStickButton; break;
                case "rightstick":    control = gamepad.rightStickButton; break;
                case "start":         control = gamepad.startButton; break;
                case "select":        control = gamepad.selectButton; break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown gamepad button '{button}'. See tool description for the supported set.");
            }

            var hold = ResolveHold(@params);
            ApplyButtonPhase(gamepad, control, hold);

            return ToolResult.Json(new JObject
            {
                ["action"] = "gamepad_button",
                ["isPlaying"] = true,
                ["applied"] = true,
                ["details"] = new JObject
                {
                    ["button"] = button.ToLowerInvariant(),
                    ["hold"] = hold,
                    ["devicePath"] = gamepad.path,
                },
            });
        }

        private static void ApplyButtonPhase(InputDevice device, ButtonControl control, string hold)
        {
            // Use DeltaStateEvent (not InputState.Change) because keyboard keys are
            // bit-packed and InputState.Change rejects bit-addressed controls. This
            // mirrors what InputTestFixture.Set/Press/Release do internally.
            switch (hold)
            {
                case "press":
                    QueueButtonValue(control, 1f);
                    InputSystem.Update();
                    break;
                case "release":
                    QueueButtonValue(control, 0f);
                    InputSystem.Update();
                    break;
                case "tap":
                    // Press, then release on the next sample so a binding's
                    // WasPerformedThisFrame() / press-interaction still fires.
                    QueueButtonValue(control, 1f);
                    InputSystem.Update();
                    QueueButtonValue(control, 0f);
                    InputSystem.Update();
                    break;
            }
        }

        private static void QueueButtonValue(ButtonControl control, float value)
        {
            using (DeltaStateEvent.From(control, out var eventPtr))
            {
                eventPtr.time = InputState.currentTime;
                control.WriteValueIntoEvent(value, eventPtr);
                InputSystem.QueueEvent(eventPtr);
            }
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "input_inject requires com.unity.inputsystem (≥1.0.0). Install the Input System package to use this tool.");
        }
#endif
    }
}
