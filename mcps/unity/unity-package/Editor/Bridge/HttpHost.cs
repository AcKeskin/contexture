using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor.Bridge
{
    /// <summary>
    /// Local HTTP host. Binds 127.0.0.1 on an OS-assigned port, accepts requests
    /// on .NET thread-pool threads, marshals work onto the editor main thread
    /// via <see cref="MainThreadDispatcher"/>, and writes structured responses.
    /// </summary>
    internal static class HttpHost
    {
        private static HttpListener _listener;
        private static CancellationTokenSource _cts;
        private static int _port;
        private static volatile bool _running;

        public static int Port => _port;
        public static bool IsRunning => _running;

        public static void Start(out int port)
        {
            Start(0, out port);
        }

        public static void Start(int preferredPort, out int port)
        {
            if (_running) { port = _port; return; }

            // HttpListener needs a concrete port; it doesn't honor 0 the way Sockets do.
            // If a preferred port is supplied (post-reload restore), try it first.
            // Then probe a curated range (6400-6499), then ephemeral (49152-65535).
            int boundPort = -1;
            HttpListener bound = null;
            if (preferredPort > 0 && preferredPort <= 65535)
            {
                bound = TryBindInRange(preferredPort, preferredPort, out boundPort);
            }
            if (bound == null) bound = TryBindInRange(6400, 6499, out boundPort);
            if (bound == null) bound = TryBindInRange(49152, 65535, out boundPort);

            if (bound == null)
            {
                throw new InvalidOperationException("[UnityMCP] failed to bind any local HTTP port in 6400-6499 or 49152-65535.");
            }

            _listener = bound;
            _port = boundPort;
            _running = true;
            _cts = new CancellationTokenSource();

            _ = AcceptLoop(_listener, _cts.Token);

            port = _port;
            Debug.Log($"[UnityMCP] HTTP host bound on http://127.0.0.1:{_port}/");
        }

        public static void Stop()
        {
            if (!_running) return;
            _running = false;
            try { _cts?.Cancel(); } catch { }
            try { _listener?.Stop(); } catch { }
            try { _listener?.Close(); } catch { }
            _listener = null;
            _cts = null;
        }

        private static HttpListener TryBindInRange(int from, int to, out int port)
        {
            for (int p = from; p <= to; p++)
            {
                var listener = new HttpListener();
                try
                {
                    listener.Prefixes.Add($"http://127.0.0.1:{p}/");
                    listener.Start();
                    port = p;
                    return listener;
                }
                catch
                {
                    try { listener.Close(); } catch { }
                }
            }
            port = -1;
            return null;
        }

        private static async Task AcceptLoop(HttpListener listener, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested && listener.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                }
                catch (HttpListenerException) { return; }
                catch (ObjectDisposedException) { return; }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityMCP] accept failed: {ex.Message}");
                    continue;
                }

                _ = HandleAsync(context, ct);
            }
        }

        private static async Task HandleAsync(HttpListenerContext context, CancellationToken ct)
        {
            try
            {
                var req = context.Request;
                var path = req.Url?.AbsolutePath ?? string.Empty;
                var method = req.HttpMethod;

                if (method == "GET" && path == "/capabilities")
                {
                    await HandleCapabilitiesAsync(context).ConfigureAwait(false);
                    return;
                }
                if (method == "POST" && path == "/invoke")
                {
                    await HandleInvokeAsync(context, ct).ConfigureAwait(false);
                    return;
                }
                WriteText(context.Response, 404, "not found");
            }
            catch (Exception ex)
            {
                if (IsClientHangup(ex))
                {
                    // The MCP client (or a curl call) closed the TCP connection before we finished
                    // writing the response. Not a server-side fault — surface at info level only.
                    Debug.Log($"[UnityMCP] client closed connection before response completed: {ex.Message}");
                }
                else
                {
                    Debug.LogWarning($"[UnityMCP] handler crashed: {ex.Message}");
                }
                try { WriteText(context.Response, 500, "internal error"); } catch { }
            }
        }

        private static bool IsClientHangup(Exception ex)
        {
            for (var cur = ex; cur != null; cur = cur.InnerException)
            {
                if (cur is HttpListenerException) return true;
                if (cur is SocketException se &&
                    (se.SocketErrorCode == SocketError.ConnectionReset ||
                     se.SocketErrorCode == SocketError.ConnectionAborted ||
                     se.SocketErrorCode == SocketError.Shutdown))
                {
                    return true;
                }
                if (cur is IOException && cur.InnerException is SocketException) continue; // walk inner
            }
            return false;
        }

        private static async Task HandleCapabilitiesAsync(HttpListenerContext context)
        {
            var task = MainThreadDispatcher.EnqueueAsync(() =>
                Task.FromResult<object>(CapabilityDescriptor.Build(_port)));
            var result = await task.ConfigureAwait(false);
            WriteJson(context.Response, 200, (JObject)result);
        }

        private static async Task HandleInvokeAsync(HttpListenerContext context, CancellationToken ct)
        {
            string body;
            using (var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding ?? Encoding.UTF8))
            {
                body = await reader.ReadToEndAsync().ConfigureAwait(false);
            }

            JObject envelope;
            try { envelope = JObject.Parse(body); }
            catch (Exception ex)
            {
                WriteJson(context.Response, 200, ErrorResponse(null, "InvalidInput", $"Request body was not valid JSON: {ex.Message}"));
                return;
            }

            string correlationId = envelope.Value<string>("correlationId");
            string tool = envelope.Value<string>("tool");
            JObject @params = envelope["params"] as JObject ?? new JObject();

            if (string.IsNullOrEmpty(correlationId))
            {
                WriteJson(context.Response, 200, ErrorResponse(null, "InvalidInput", "Missing 'correlationId' on request envelope."));
                return;
            }
            if (string.IsNullOrEmpty(tool))
            {
                WriteJson(context.Response, 200, ErrorResponse(correlationId, "InvalidInput", "Missing 'tool' on request envelope."));
                return;
            }

            var handler = ToolRegistry.Lookup(tool);
            if (handler == null)
            {
                WriteJson(context.Response, 200, ErrorResponse(correlationId, "ToolNotFound", $"Unknown tool '{tool}'."));
                return;
            }

            var ctx = new ToolContext(correlationId, ct);
            var sw = InvocationLog.Start(correlationId, tool);
            try
            {
                var resultObj = await MainThreadDispatcher.EnqueueAsync(async () =>
                {
                    var r = await handler.InvokeAsync(@params, ctx).ConfigureAwait(true);
                    return (object)r;
                }).ConfigureAwait(false);

                var result = (ToolResult)resultObj;
                WriteJson(context.Response, 200, SuccessResponse(correlationId, result));
                InvocationLog.Ok(correlationId, tool, sw);
            }
            catch (ToolException tex)
            {
                WriteJson(context.Response, 200, ErrorResponse(correlationId, tex.Code, tex.Message, tex.Details));
                InvocationLog.Err(correlationId, tool, sw, tex.Code, tex.Message);
            }
            catch (ArgumentException ax)
            {
                // ArgumentException is the convention every tool uses for input-shape failures.
                // Map to InvalidInput so agents can branch on the structured code.
                WriteJson(context.Response, 200, ErrorResponse(correlationId, "InvalidInput", ax.Message));
                InvocationLog.Err(correlationId, tool, sw, "InvalidInput", ax.Message);
            }
            catch (Exception ex)
            {
                var details = new JObject { ["stackTrace"] = ex.StackTrace ?? string.Empty };
                WriteJson(context.Response, 200, ErrorResponse(correlationId, "ToolError", ex.Message, details));
                InvocationLog.Err(correlationId, tool, sw, "ToolError", ex.Message);
            }
        }

        private static JObject SuccessResponse(string correlationId, ToolResult result)
        {
            JToken dataToken;
            if (result.ContentType == "image/png")
            {
                var bytes = (byte[])result.Data;
                dataToken = JValue.CreateString(Convert.ToBase64String(bytes));
            }
            else
            {
                dataToken = (JToken)result.Data;
            }

            return new JObject
            {
                ["ok"] = true,
                ["result"] = new JObject
                {
                    ["contentType"] = result.ContentType,
                    ["data"] = dataToken,
                },
                ["correlationId"] = correlationId,
            };
        }

        private static JObject ErrorResponse(string correlationId, string code, string message, JObject details = null)
        {
            var error = new JObject
            {
                ["code"] = code,
                ["message"] = message,
            };
            if (details != null) error["details"] = details;

            var env = new JObject { ["ok"] = false, ["error"] = error };
            if (!string.IsNullOrEmpty(correlationId)) env["correlationId"] = correlationId;
            else env["correlationId"] = string.Empty;
            return env;
        }

        private static void WriteJson(HttpListenerResponse response, int status, JObject body)
        {
            response.StatusCode = status;
            response.ContentType = "application/json; charset=utf-8";
            var json = body.ToString(Formatting.None);
            var bytes = Encoding.UTF8.GetBytes(json);
            response.ContentLength64 = bytes.Length;
            using (var stream = response.OutputStream) stream.Write(bytes, 0, bytes.Length);
        }

        private static void WriteText(HttpListenerResponse response, int status, string text)
        {
            response.StatusCode = status;
            response.ContentType = "text/plain; charset=utf-8";
            var bytes = Encoding.UTF8.GetBytes(text);
            response.ContentLength64 = bytes.Length;
            using (var stream = response.OutputStream) stream.Write(bytes, 0, bytes.Length);
        }
    }
}
