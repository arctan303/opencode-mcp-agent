# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 - 2026-06-06

- Declared the task-oriented MCP interface stable for the first public release.
- Added a reproducible npm tarball build with SHA-256 and machine-readable manifest output.
- Verified tarball installation, both CLI aliases, MCP initialization, and all 13 core tools.
- Reported the package version dynamically through MCP `serverInfo`.
- Added Windows and Linux CI coverage across Node.js 18, 20, and 22.
- Fixed the Windows Node.js 18 test entry point.

## 0.2.0 - 2026-06-06

- Renamed the public project to OpenCode MCP Agent.
- Reworked the project around a managed headless OpenCode runtime.
- Added asynchronous task tracking and persistent task records.
- Added model, session, runtime, permission, status, result, and cancellation tools.
- Added real OpenCode permission discovery and `once`, `always`, and `reject` replies.
- Added running, queued, and blocked tool diagnostics.
- Added structured OpenCode request timeout errors.
- Added fast two-phase task cancellation.
- Added concurrent MCP request handling.
- Removed historical OpenCode Desktop private-interface probes.
- Added public repository documentation and CI.

## 0.1.0 - 2026-06-05

- Initial bridge prototype.
