# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 - 2026-06-06

- Declared the task-oriented MCP interface stable for the first public release.
- Added a reproducible npm tarball build with SHA-256 and machine-readable manifest output.
- Verified tarball installation, both CLI aliases, MCP initialization, and all 13 core tools.
- Reported the package version dynamically through MCP `serverInfo`.
- Added Windows and Linux CI coverage across Node.js 18, 20, and 22.
- Fixed the Windows Node.js 18 test entry point.
- Added bilingual (Chinese/English) README with Chinese as the default.
- Added bilingual versions for ARCHITECTURE.md, BACKGROUND.md, and ROADMAP.md.
- Added CI, License, Node.js, and npm badges to README.
- Added npm install quick start and typical usage scenarios to README.
- Rewrote project description to highlight multi-agent collaboration and cost optimization.
- Added CODE_OF_CONDUCT.md (Contributor Covenant v2.1).
- Added GitHub Issue templates (bug report, feature request) and PR template.
- Added automated Release workflow (npm publish + GitHub Release on tag push).
- Added .editorconfig and .env.example.
- Enhanced .gitignore with IDE and OS-specific patterns.
- Enhanced CONTRIBUTING.md with code of conduct reference and commit guidelines.
- Enhanced SECURITY.md with response time commitment.
- Moved ARCHITECTURE.md, BACKGROUND.md, ROADMAP.md to docs/ directory.
- Removed legacy `codex-opencode-bridge` bin alias.

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
