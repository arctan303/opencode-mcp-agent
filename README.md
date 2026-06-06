# OpenCode MCP Agent

Use OpenCode as a managed MCP sub-agent.

OpenCode MCP Agent starts a private local `opencode serve` runtime and exposes task-oriented MCP tools for sending work, selecting a workspace and model, continuing sessions, observing progress, handling permissions, cancelling work, and collecting results.

The MCP server is client-agnostic and can be used by Codex and other clients that support stdio MCP servers.

## Status

The core workflow is functional and covered by automated and real-runtime tests:

- Managed local OpenCode runtime
- Explicit workspace and model selection
- Asynchronous tasks with persistent task records
- Session creation and continuation
- Progress, running tool, and blocked tool reporting
- OpenCode permission discovery and reply
- Fast two-phase cancellation
- Model and session discovery

This is an early public release. OpenCode API compatibility may require updates when OpenCode changes its server endpoints.

## How It Works

```text
MCP client
  -> OpenCode MCP Agent
    -> managed opencode serve
      -> OpenCode agent, session, model and tools
```

The runtime binds to `127.0.0.1` on a random port. The bridge generates random Basic Authentication credentials in memory and does not expose them to the MCP client.

OpenCode Desktop is not required and is not used as the control path.

## Requirements

- Node.js 18 or newer
- OpenCode CLI installed and configured
- An MCP client that supports stdio servers

Confirm that OpenCode is available:

```powershell
opencode --version
```

If OpenCode is not on `PATH`, set `OPENCODE_BIN` to its executable path.

## Quick Start

Clone the repository and run the checks:

```powershell
git clone https://github.com/arctan303/opencode-mcp-agent.git
cd opencode-mcp-agent
npm run check
```

Register it with Codex:

```powershell
codex mcp add opencode-control -- node C:\path\to\opencode-mcp-agent\server.mjs
```

Generic stdio MCP configuration:

```json
{
  "mcpServers": {
    "opencode-control": {
      "command": "node",
      "args": ["/absolute/path/to/opencode-mcp-agent/server.mjs"]
    }
  }
}
```

Restart the MCP client after changing its configuration.

## Recommended Task Flow

1. Call `opencode_model_list` to inspect configured models.
2. Call `opencode_task_start` with an explicit `workspace`, normally using `wait: false`.
3. Poll `opencode_task_status`.
4. If the task enters `waiting_permission`, call `opencode_permission_list`, inspect the request, then call `opencode_permission_reply`.
5. Read the final result with `opencode_task_result`.

Example task arguments:

```json
{
  "workspace": "C:\\projects\\example",
  "model": "provider/model",
  "prompt": "Analyze this project and report performance risks. Do not modify files.",
  "wait": false,
  "timeoutMs": 600000
}
```

`timeoutMs` is the maximum lifetime of the OpenCode model and tool request. It still applies when `wait` is `false` and is independent of any timeout imposed by the MCP client.

## MCP Tools

| Tool | Purpose |
|---|---|
| `opencode_task_start` | Create or continue an OpenCode task |
| `opencode_task_list` | Find persisted bridge tasks |
| `opencode_task_status` | Refresh task, tool, session, and permission status |
| `opencode_task_result` | Read the complete tracked task result |
| `opencode_task_cancel` | Request cancellation without blocking on confirmation |
| `opencode_session_list` | List OpenCode sessions |
| `opencode_session_messages` | Read compact or raw session messages |
| `opencode_model_list` | List models available to OpenCode |
| `opencode_permission_list` | List real pending OpenCode permissions |
| `opencode_permission_reply` | Reply with `once`, `always`, or `reject` |
| `opencode_runtime_status` | Inspect the managed runtime |
| `opencode_runtime_start` | Start the managed runtime |
| `opencode_runtime_stop` | Stop the managed runtime |

Long-running calls should use `wait: false`. MCP requests are processed concurrently, so status and permission calls can run while another request is waiting.

Cancellation is two-phase: `opencode_task_cancel` first returns `cancelRequested: true`; the task becomes `cancelled` after OpenCode confirms the session abort or the bridge observes an idle session with no open tool calls.

## Configuration

| Environment variable | Purpose |
|---|---|
| `OPENCODE_BIN` | Explicit OpenCode executable path |
| `OPENCODE_CONFIG` | Explicit OpenCode configuration file path |
| `OPENCODE_BRIDGE_STATE` | Explicit task state JSON file path |
| `OPENCODE_BRIDGE_DEBUG_TOOLS=1` | Expose legacy/debug MCP tools |

By default, task state is stored outside the repository in the current user's local application state directory.

## Security Model

- The managed server listens only on `127.0.0.1`.
- A random port and random Basic Authentication credentials are generated per runtime.
- Runtime credentials remain in bridge process memory.
- The bridge does not store model-provider credentials.
- OpenCode permissions are forwarded, not bypassed.
- `always` grants should be approved only after inspecting their permission type and patterns.

See [SECURITY.md](SECURITY.md) for reporting security issues.

## Development

```powershell
npm run check
```

The check command runs syntax validation and the Node.js test suite.

Build the npm release artifact:

```powershell
npm run build
```

The build runs all checks and writes the package tarball, `SHA256SUMS`, and `manifest.json` to `dist/`. The output directory is intentionally not committed; its files are suitable for an npm publish workflow or a GitHub Release.

Project documentation:

- [BACKGROUND.md](BACKGROUND.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ROADMAP.md](ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CHANGELOG.md](CHANGELOG.md)

## License

MIT
