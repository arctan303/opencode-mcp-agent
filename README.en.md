# OpenCode MCP Agent

[![CI](https://github.com/arctan303/opencode-mcp-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/arctan303/opencode-mcp-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/opencode-mcp-agent.svg)](https://www.npmjs.com/package/opencode-mcp-agent)

**[简体中文](README.md) | English**

Let your primary AI agent dispatch tasks directly to OpenCode — use the best model for planning, use the most cost-effective model for execution.

## Why This Tool?

In multi-agent workflows, you often face these challenges:

- 🧠 **Planning** requires the strongest models (GPT-5.5, Claude Opus 4.6), but they are expensive
- ⚡ **Code execution** consumes massive tokens (reading files, writing code, running tests) — using top-tier models is wasteful
- 🔄 **Switching between agents** requires manually copying files and pasting context, breaking the workflow

OpenCode MCP Agent solves these problems:

```text
Primary Agent (GPT-5.5 / Opus 4.6)
  → Creates plans, designs architecture, breaks down tasks
  → Dispatches work to OpenCode via MCP
      → OpenCode uses cost-effective models (DeepSeek / Mimo) for execution
      → Automatically returns results, status, and permission requests
```

**In one sentence**: Use the best brain for decisions, use the most economical hands for execution, with zero friction in between.

## How It Works

```text
MCP Client (e.g. Codex, Claude Desktop)
  → OpenCode MCP Agent (MCP server)
    → Managed opencode serve (local runtime)
      → OpenCode agent, session, model and tools
```

- The runtime binds to `127.0.0.1` on a random port; credentials exist only in process memory
- OpenCode Desktop is not required
- Works with any MCP client

## Verified Environment

| Component | Version |
|-----------|---------|
| OS | Windows 11 25H2 |
| Node.js | v24.15.0 |
| Primary Agent | Codex (GPT-5.5) |
| Execution Agent | OpenCode (DeepSeek v4 Pro) |

> This is the author's first MCP tool project. If you encounter issues in other environments, please [open an Issue](https://github.com/arctan303/opencode-mcp-agent/issues) to report bugs or suggest improvements — the project will be continuously improved.

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

Version 1.0 provides the first stable task-oriented MCP interface.

## Requirements

- Node.js 18 or newer
- OpenCode CLI installed and configured
- An MCP client that supports stdio servers

Confirm that OpenCode is available:

```bash
opencode --version
```

If OpenCode is not on `PATH`, set `OPENCODE_BIN` to its executable path.

## Quick Start

### Install from npm

```bash
npm install -g opencode-mcp-agent
```

Then register with your MCP client:

```json
{
  "mcpServers": {
    "opencode-control": {
      "command": "opencode-mcp-agent"
    }
  }
}
```

### Install from source

```bash
git clone https://github.com/arctan303/opencode-mcp-agent.git
cd opencode-mcp-agent
npm run check
```

Register it with Codex:

```bash
codex mcp add opencode-control -- node /path/to/opencode-mcp-agent/server.mjs
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

## Typical Use Cases

### Scenario 1: Separate Planning from Execution

1. Use GPT-5.5 in Codex to create a project plan and design document
2. GPT-5.5 dispatches implementation tasks directly to OpenCode via `opencode_task_start`
3. OpenCode uses cost-effective models like DeepSeek v4 Pro for code writing
4. The primary agent tracks progress via `opencode_task_status`
5. Collects results with `opencode_task_result` when complete

### Scenario 2: Parallel Batch Tasks

1. The primary agent breaks a large task into multiple subtasks
2. Dispatches them sequentially with `opencode_task_start` (`wait: false`)
3. Queries status and results in parallel

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

Cancellation is two-phase: `opencode_task_cancel` first returns `cancelRequested: true`; the task becomes `cancelled` after OpenCode confirms the session abort.

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

```bash
npm run check
```

The check command runs syntax validation and the Node.js test suite.

Build the npm release artifact:

```bash
npm run build
```

The build runs all checks and writes the package tarball, `SHA256SUMS`, and `manifest.json` to `dist/`.

Project documentation:

- [BACKGROUND.md](docs/BACKGROUND.md)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [ROADMAP.md](docs/ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CHANGELOG.md](CHANGELOG.md)

## License

MIT
