# Contributing

Contributions are welcome through focused issues and pull requests.

## Development Setup

Requirements:

- Node.js 18 or newer
- OpenCode CLI for real-runtime testing

Run the local checks:

```powershell
npm run check
```

The automated test suite must not require model-provider credentials or a running OpenCode instance. Real-runtime tests should be documented separately and use disposable workspaces.

## Pull Requests

- Keep changes scoped to the reported problem.
- Add or update tests for behavior changes.
- Do not commit OpenCode configuration, provider credentials, runtime state, generated probe output, or personal filesystem paths.
- Preserve the task-oriented MCP interface unless a breaking change is explicitly discussed.
- Update README, architecture, or roadmap documentation when behavior changes.

## Design Constraints

- OpenCode Desktop is not a required backend.
- The managed runtime must bind to loopback only.
- Runtime authentication must not be persisted or returned to MCP clients.
- Permission requests must be exposed to the client rather than bypassed.
- Long tasks should remain observable and cancellable.

## Reporting Bugs

Include:

- Operating system and Node.js version
- OpenCode version and installation source
- MCP client
- Tool name and sanitized arguments
- Returned task status and error code
- Minimal reproduction steps

Remove provider keys, authorization headers, usernames, and unrelated source code before posting logs.
