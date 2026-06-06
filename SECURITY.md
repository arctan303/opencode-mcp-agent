# Security Policy

## Supported Version

Security fixes are applied to the latest stable release and the latest revision on the default branch.

## Reporting a Vulnerability

Do not open a public issue for vulnerabilities involving credential exposure, authentication bypass, unintended network exposure, or permission bypass.

Report the issue privately through GitHub Security Advisories for the repository. Include reproduction steps, affected versions or commits, impact, and any suggested mitigation.

Do not include real model-provider credentials, OpenCode configuration files, runtime Basic Authentication values, or private workspace contents.

## Security Boundaries

The bridge:

- Starts `opencode serve` on `127.0.0.1`.
- Generates runtime authentication credentials in memory.
- Delegates model-provider configuration to OpenCode.
- Forwards OpenCode permission requests to the MCP client.
- Does not intentionally bypass OpenCode permission checks.

The MCP client and user remain responsible for reviewing workspace paths, prompts, permission patterns, and `always` approvals.
